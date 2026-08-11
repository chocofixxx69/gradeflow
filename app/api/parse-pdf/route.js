import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Max file size: 30MB
export const maxDuration = 60;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('pdf');

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Validate size (30MB max)
        if (file.size > 30 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Max 30MB.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // SHA-256 Duplicate Detection
        const crypto = await import('crypto');
        const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

        // Check if this exact file has already been processed
        try {
            const { data: existingDoc } = await supabaseAdmin
                .from('documents')
                .select('id, file_name, created_at')
                .eq('file_path', fileHash)
                .maybeSingle();

            if (existingDoc) {
                return NextResponse.json({
                    success: false,
                    error: `Duplicate file detected. This PDF was already uploaded on ${new Date(existingDoc.created_at).toLocaleDateString()}. File: ${existingDoc.file_name}`,
                    duplicate: true,
                    fileHash,
                }, { status: 409 });
            }
        } catch (dupErr) {
            // Non-critical — continue with upload even if duplicate check fails
        }

        // Step 1: Parse the PDF for marks data
        const { parsePDF } = await import('../../../lib/pdfParser');
        const result = await parsePDF(buffer);
        result.fileHash = fileHash;

        // Step 2: Store PDF permanently in Supabase Storage (NEVER deleted)
        // Even if parsing fails, we still store the file as a permanent record
        const usn = result?.studentInfo?.usn || 'unknown';
        const timestamp = Date.now();
        const storagePath = `uploads/${usn.toLowerCase()}/${timestamp}_${file.name}`;

        try {
            await supabaseAdmin.storage
                .from('student-pdfs')
                .upload(storagePath, buffer, {
                    contentType: 'application/pdf',
                    upsert: false, // Never overwrite — each upload is a unique record
                });

            result.storagePath = storagePath;
        } catch (storageErr) {
            // Storage may not exist yet — that's OK, parsing still works
            console.warn('PDF storage failed (bucket may not exist):', storageErr.message);
        }

        // Step 3: If we got a USN and name, update the student profile name match
        if (result?.isParsed && result?.studentInfo?.usn && result?.studentInfo?.name) {
            try {
                const cleanUsn = result.studentInfo.usn.toUpperCase();
                const { data: existing } = await supabaseAdmin
                    .from('students')
                    .select('id, name')
                    .eq('usn', cleanUsn)
                    .maybeSingle();

                if (existing && (existing.name === cleanUsn || !existing.name || existing.name.length < 3)) {
                    // Update the student name from the PDF if current name is just the USN
                    await supabaseAdmin
                        .from('students')
                        .update({ name: result.studentInfo.name })
                        .eq('usn', cleanUsn);

                }
            } catch (nameErr) {
                // Non-critical
            }
        }
        // Step 4: Record document hash for duplicate detection
        if (result?.isParsed) {
            try {
                const docUsn = result?.studentInfo?.usn?.toUpperCase() || 'unknown';
                // Get student id if possible
                let studentId = null;
                const { data: stuData } = await supabaseAdmin
                    .from('students')
                    .select('id')
                    .eq('usn', docUsn)
                    .maybeSingle();
                if (stuData) studentId = stuData.id;

                await supabaseAdmin
                    .from('documents')
                    .insert({
                        student_id: studentId,
                        student_usn: docUsn,
                        file_name: file.name,
                        file_path: fileHash, // Store hash in file_path for duplicate detection
                        file_type: 'application/pdf',
                        file_size: file.size,
                        semester: result?.studentInfo?.semester || null,
                        uploaded_by: 'student',
                    });
            } catch (docErr) {
                // Non-critical
            }
        }

        return NextResponse.json({ success: true, data: result });

    } catch (err) {
        console.error('PDF PARSE ERROR:', err);
        return NextResponse.json(
            { success: false, error: 'Could not process the uploaded file. Please ensure it is a valid PDF.' },
            { status: 500 }
        );
    }
}
