import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { requireStaff } from '../../../../lib/server-session';

export async function POST(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { classId, branch, semester } = await req.json();

        if (!classId || !branch || !semester) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const scriptPath = path.join(process.cwd(), 'scripts', 'scraper', 'analyser.py');

        return new Promise((resolve) => {
            const pythonProcess = spawn('python', [scriptPath, classId, branch, semester.toString()]);

            let resultData = '';
            pythonProcess.stdout.on('data', (data) => {
                resultData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Analyser Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    return resolve(NextResponse.json({ error: 'Analysis failed' }, { status: 500 }));
                }

                try {
                    const parsed = JSON.parse(resultData);
                    resolve(NextResponse.json(parsed));
                } catch (e) {
                    resolve(NextResponse.json({ error: 'Failed to parse analyser output' }, { status: 500 }));
                }
            });
        });

    } catch (err) {
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        const { searchParams } = new URL(req.url);
        const branch = searchParams.get('branch');
        const semester = searchParams.get('semester');

        let query = supabaseAdmin.from('classes').select('*, class_students(count)');
        if (branch) query = query.eq('branch', branch);
        if (semester) query = query.eq('semester', parseInt(semester, 10));

        const { data: classes, error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true, data: { reports: classes || [] } });
    } catch (err) {
        console.error('[GET /api/faculty/reports]', err);
        return NextResponse.json({ success: false, error: 'Failed to fetch report datasets.' }, { status: 500 });
    }
}
