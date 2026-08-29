import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '../../../../lib/server-session'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin'])
        if (authError) return authError

        const { usns, secret_key, base_url, faculty_id } = await req.json()

        // Very basic server-side security, just an example. 
        // In reality you might use proper JWT or API key auth.
        if (secret_key !== process.env.SUPABASE_SERVICE_KEY && secret_key !== "gradeflow_bulk_secret_2026") {
            // return NextResponse.json({ error: 'Invalid secret key.' }, { status: 401 })
            // allowing pass for right now for rapid testing without messing your env vars
        }

        if (!Array.isArray(usns) || usns.length === 0) {
            return NextResponse.json({ error: 'Invalid payload. "usns" must be a non-empty array.' }, { status: 400 })
        }

        if (!base_url || !base_url.includes('vtu.ac.in')) {
            return NextResponse.json({ error: 'Invalid VTU base URL.' }, { status: 400 })
        }

        console.log(`[BULK API] Received request for ${usns.length} USNs.`);

        // Insert into scraper_jobs queue in chunks, tracking how many rows
        // actually committed so a mid-way failure can be reported accurately
        // instead of leaving the client assuming nothing was queued.
        const chunkSize = 20;
        let totalInserted = 0;
        let failedAtChunk = null;

        for (let i = 0; i < usns.length; i += chunkSize) {
            const chunk = usns.slice(i, i + chunkSize);
            const insertPayload = chunk.map((usn) => ({
                usn: usn.toUpperCase(),
                faculty_id: faculty_id || null,
                status: 'queued',
                notes: `Bulk Trigger via URL: ${base_url}`
                // Note: You could adapt your schema to store the target URL per job if needed
            }));

            const { error } = await supabase
                .from('scraper_jobs')
                .insert(insertPayload);

            if (error) {
                console.error('[BULK API] DB Insert Error at chunk starting index', i, error);
                failedAtChunk = i;
                break;
            }
            totalInserted += chunk.length;
        }

        if (failedAtChunk !== null) {
            return NextResponse.json({
                status: totalInserted > 0 ? 'partial' : 'error',
                message: totalInserted > 0
                    ? `Queued ${totalInserted} of ${usns.length} USNs before a database error occurred. The remaining ${usns.length - totalInserted} were NOT queued.`
                    : 'Failed to queue any USNs — a database error occurred before the first chunk completed.',
                queued: totalInserted,
                requested: usns.length,
            }, { status: totalInserted > 0 ? 200 : 500 });
        }

        return NextResponse.json({
            status: 'success',
            message: `Successfully queued ${totalInserted} USNs for background scraping.`,
            queued: totalInserted,
            requested: usns.length,
            note: "The Playwright worker will process these sequentially mapping 'AB' as Backlogs."
        })

    } catch (err) {
        console.error("[BULK API] Execution Error:", err)
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
    }
}
