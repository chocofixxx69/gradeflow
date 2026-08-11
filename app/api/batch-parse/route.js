import { NextResponse } from 'next/server';
import { parsePDF } from '../../../lib/pdfParser';
import crypto from 'crypto';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('pdfs');
        const scheme = formData.get('scheme') || '2022';

        if (!files || files.length === 0) {
            return NextResponse.json({ success: false, error: 'No PDF files provided.' }, { status: 400 });
        }

        // Limit to 8 files max
        if (files.length > 8) {
            return NextResponse.json({ success: false, error: 'Maximum 8 semester PDFs allowed.' }, { status: 400 });
        }

        const results = [];
        const hashes = new Set();
        const errors = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const semesterNum = parseInt(formData.get(`semester_${i}`)) || (i + 1);

            if (!file || !file.name) {
                continue;
            }

            // Validate file type
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                errors.push({ semester: semesterNum, error: `${file.name} is not a valid PDF file.` });
                continue;
            }

            // Validate file size (max 30MB)
            if (file.size > 30 * 1024 * 1024) {
                errors.push({ semester: semesterNum, error: `${file.name} exceeds 30MB limit.` });
                continue;
            }

            try {
                const buffer = Buffer.from(await file.arrayBuffer());

                // SHA-256 duplicate detection
                const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
                if (hashes.has(fileHash)) {
                    errors.push({ semester: semesterNum, error: `Duplicate file detected (same as another uploaded PDF).` });
                    continue;
                }
                hashes.add(fileHash);

                // Parse the PDF
                const parsed = await parsePDF(buffer);

                if (!parsed || !parsed.isParsed) {
                    errors.push({ semester: semesterNum, error: `Could not parse ${file.name}. Ensure it is a valid VTU result PDF.` });
                    continue;
                }

                const subjects = parsed.subjects || [];
                if (subjects.length === 0) {
                    errors.push({ semester: semesterNum, error: `No subjects found in ${file.name}.` });
                    continue;
                }

                // Use semester from PDF if available, otherwise from the upload slot
                const detectedSemester = parsed.studentInfo?.semester || semesterNum;

                results.push({
                    semester: detectedSemester,
                    subjects,
                    studentInfo: parsed.studentInfo || {},
                    scheme: parsed.scheme || scheme,
                    fileName: file.name,
                    fileHash,
                    subjectCount: subjects.length,
                });
            } catch (parseErr) {
                console.error(`Error parsing file ${i}:`, parseErr);
                errors.push({ semester: semesterNum, error: `Failed to process ${file.name}.` });
            }
        }

        if (results.length === 0 && errors.length > 0) {
            return NextResponse.json({
                success: false,
                error: 'No valid results could be extracted from the uploaded PDFs.',
                errors,
            }, { status: 400 });
        }

        // Sort results by semester
        results.sort((a, b) => a.semester - b.semester);

        // Compute SGPA per semester and overall CGPA
        const GP = { 'O': 10, 'S': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0, 'Ab': 0 };
        let totalWeightedPoints = 0;
        let totalCreditsAll = 0;

        const semesterResults = results.map(r => {
            let semPts = 0, semCr = 0;
            r.subjects.forEach(s => {
                const grade = (s.grade || '').trim();
                const credits = s.credits || 3;
                semPts += (GP[grade] || 0) * credits;
                semCr += credits;
            });
            const sgpa = semCr > 0 ? Math.round((semPts / semCr) * 100) / 100 : 0;
            totalWeightedPoints += semPts;
            totalCreditsAll += semCr;

            return {
                ...r,
                sgpa,
                totalCredits: semCr,
            };
        });

        const cgpa = totalCreditsAll > 0
            ? Math.round((totalWeightedPoints / totalCreditsAll) * 100) / 100
            : 0;

        const percentage = Math.max(0, (cgpa - 0.75) * 10);
        const classification = cgpa >= 7.75 ? 'First Class Distinction'
            : cgpa >= 6.75 ? 'First Class'
                : cgpa >= 5.0 ? 'Second Class'
                    : 'Pass';

        return NextResponse.json({
            success: true,
            data: {
                semesters: semesterResults,
                cgpa,
                percentage: Math.round(percentage * 10) / 10,
                classification,
                totalSemesters: semesterResults.length,
                totalSubjects: semesterResults.reduce((sum, s) => sum + s.subjectCount, 0),
                totalCredits: totalCreditsAll,
                studentInfo: semesterResults[0]?.studentInfo || {},
                errors,
            }
        });

    } catch (err) {
        console.error('[BATCH PARSE] Error:', err);
        return NextResponse.json({
            success: false,
            error: 'An internal error occurred while processing your PDFs.',
        }, { status: 500 });
    }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
