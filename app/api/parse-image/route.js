import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('image') || formData.get('file');

        if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

        // Validate size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image too large. Max 10MB.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Process OCR
        console.log('Starting OCR on image...');
        const worker = await Tesseract.createWorker('eng');
        const { data: { text } } = await worker.recognize(buffer);
        await worker.terminate();

        console.log('OCR Result Length:', text.length);

        // --- Parsing Logic (Similar to reader.py Regex Fallback) ---
        const result = {
            isParsed: false,
            subjects: [],
            studentInfo: { usn: "Unknown", semester: 0, branch: "Detected", name: "Extracted from Image" },
            scheme: "2022"
        };

        let fullText = text.toUpperCase();

        // 1. Detect USN
        const usnMatch = fullText.match(/([1-9][A-Z]{2}\d{2}[A-Z]{2,3}\d{3})/i) ||
            fullText.match(/(\d[A-Z]{2}\d{2}[A-Z]{2}\d{3})/i) ||
            fullText.match(/USN\s*[:\-]?\s*([A-Z0-9]{10,12})/i);
        if (usnMatch) {
            result.studentInfo.usn = usnMatch[1].toUpperCase();
        }

        // 2. Detect Semester
        const semMatch = fullText.match(/(?:SEMESTER|SEM)\s*[:\-]?\s*(\d)/i) ||
            fullText.match(/(\d)\s*(?:ST|ND|RD|TH)\s*SEMESTER/i);
        if (semMatch) {
            let sNum = parseInt(semMatch[1], 10);
            if (sNum >= 1 && sNum <= 8) result.studentInfo.semester = sNum;
        }

        // 3. Extract Subjects using Regex
        // VTU Subject Code eg: 21CS41, 18CS51, 21MAT11, 22ETC15G
        const pattern = /([A-Z]{2,6}\d{2,4}[A-Z\d]?)\s+([\w\s&()\-]+?)\s+(\d{1,3})\s+(\d{1,3})[\s0-9]*?([OABCPFSE][+]?)/gi;

        const allSubjects = [];
        let match;
        while ((match = pattern.exec(text)) !== null) {
            let code = match[1].toUpperCase();
            let name = match[2].trim();
            // clean up name
            name = name.replace(/[^A-Za-z0-9&()\-\s]/g, '').trim();
            if (name.length < 3) continue;

            let int_m = parseInt(match[3], 10);
            let ext_m = parseInt(match[4], 10);
            let grd = match[5].toUpperCase();

            // Ignore header matches
            if (["CODE", "SUBJECT", "CREDIT", "GRADE", "TOTAL", "MARKS"].includes(code)) continue;

            let tot_m = int_m + ext_m; // Auto calculation of total since image might miss it

            // Assume credits 3 for standard courses
            let cred = 3;
            if (name.includes("LAB") || name.includes("PRACTICAL")) cred = 1;

            // Deduplicate
            if (!allSubjects.some(s => s.code === code)) {
                allSubjects.push({
                    code: code,
                    name: name,
                    credits: cred,
                    internal: int_m,
                    external: ext_m,
                    total: tot_m,
                    grade: grd,
                    semester: result.studentInfo.semester > 0 ? result.studentInfo.semester : 1
                });
            }
        }

        // Infer Semester if not found
        if (result.studentInfo.semester <= 0 && allSubjects.length > 0) {
            const semSet = new Set();
            for (let s of allSubjects) {
                const m = s.code.match(/[A-Z]{2,3}(\d)\d/);
                if (m) semSet.add(parseInt(m[1], 10));
            }
            if (semSet.size > 0) {
                result.studentInfo.semester = Math.max(...Array.from(semSet));
            } else {
                result.studentInfo.semester = 1;
            }
        }

        // Update parsed subjects with inferred sem
        for (let s of allSubjects) {
            s.semester = result.studentInfo.semester;
        }

        result.subjects = allSubjects;
        result.isParsed = allSubjects.length > 0;

        if (!result.isParsed) {
            return NextResponse.json({ success: false, error: 'Could not extract marks from the image. Ensure the image is clear and contains a standard VTU Results table.' }, { status: 400 });
        }

        return NextResponse.json({ success: true, data: result });

    } catch (err) {
        console.error('IMAGE PARSE ERROR:', err);
        return NextResponse.json(
            { success: false, error: 'Could not process the uploaded image.' },
            { status: 500 }
        );
    }
}
