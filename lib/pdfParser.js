// lib/pdfParser.js (Highly Optimized & Resilient VTU Parser)

import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

export async function parsePDF(buffer) {
    const tempFilePath = path.join(os.tmpdir(), `vtu_upload_${Date.now()}.pdf`);

    try {
        // 1. Write buffer to a temporary file
        await writeFile(tempFilePath, buffer);

        // 2. Run the Python script
        const pythonResult = await new Promise((resolve, reject) => {
            // Use 'python' or 'python3' depending on environment, but user has 'python'
            const py = spawn('python', [path.join(process.cwd(), 'scripts', 'reader.py'), tempFilePath]);

            let data = '';
            let error = '';

            py.stdout.on('data', (chunk) => { data += chunk; });
            py.stderr.on('data', (chunk) => { error += chunk; });

            py.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}: ${error}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse Python output: ${data}`));
                }
            });
        });

        // 3. Clean up temp file
        await unlink(tempFilePath).catch(console.error);

        // 4. Transform/Finalize result for the frontend
        if (pythonResult.isParsed) {
            return finalizeData(pythonResult);
        }
        return pythonResult;

    } catch (e) {
        console.error("Python Bridge Error:", e);
        // Fallback to basic error response
        return { isParsed: false, error: e.message, subjects: [] };
    } finally {
        // Final cleanup attempt
        await unlink(tempFilePath).catch(() => { });
    }
}

async function finalizeData(data) {
    let getSubjectInfo = null;
    try {
        const gradesMod = await import('./vtuGrades');
        getSubjectInfo = gradesMod.getSubjectInfo;
    } catch (e) {
        console.warn("Could not load subject database.");
    }

    const subjects = data.subjects.map(s => {
        const sInfo = getSubjectInfo ? getSubjectInfo(s.code) : null;
        return {
            ...s,
            id: Math.random(),
            name: sInfo ? sInfo.name : s.name,
            credits: sInfo ? sInfo.credits : s.credits
        };
    });

    // Grouping logic (same as before)
    const grouped = [];
    for (let i = 1; i <= 8; i++) {
        const semSubs = subjects.filter(s => s.semester === i);
        if (semSubs.length > 0) grouped.push({ id: i, name: `Semester ${i}`, subjects: semSubs });
    }

    return {
        ...data,
        subjects,
        groupedSemesters: grouped
    };
}

