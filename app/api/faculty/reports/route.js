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
