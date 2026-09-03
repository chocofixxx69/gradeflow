import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '../../../lib/server-session'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin'])
    if (authError) return authError

    const { usn, force, faculty_id, scheme } = await req.json()

    // Support both 3-digit and 4-digit USN suffixes and various branch codes
    if (!usn || !/^\d[A-Z]{2}\d{2}[A-Z]{2,3}\d{3}$/.test(usn.toUpperCase())) {
        return NextResponse.json({ error: 'Invalid USN format' }, { status: 400 })
    }

    const cleanUSN = usn.toUpperCase()

    // Deduce target scheme: 22, 23, 24 admission years -> '2022', 25+ -> '2025'
    const admissionYear = parseInt(cleanUSN.substring(3, 5), 10) || 22;
    const targetScheme = scheme || (admissionYear >= 25 ? '2025' : '2022');

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentJobs } = await supabase
        .from('scraper_jobs')
        .select('id')
        .eq('usn', cleanUSN)
        .gte('created_at', oneHourAgo);

    if (recentJobs && recentJobs.length >= 5) {
        return NextResponse.json({ error: 'Rate limit reached. Max 5 fetch requests per hour per USN.' }, { status: 429 });
    }

    // 1. Check if already in database (only if force is false)
    if (!force) {
        const { data: existing } = await supabase
            .from('students')
            .select(`
          *,
          results (
            *,
            subject_marks (*)
          )
        `)
            .eq('usn', cleanUSN)
            .single()

        if (existing?.results?.length > 0) {
            return NextResponse.json({
                status: 'cached',
                student: existing,
                scheme: existing.scheme || targetScheme
            })
        }
    }

    // 2. Check if job already queued or running
    const { data: existingJob } = await supabase
        .from('scraper_jobs')
        .select('*')
        .eq('usn', cleanUSN)
        .in('status', ['queued', 'running'])
        .maybeSingle()

    if (existingJob) {
        return NextResponse.json({
            status: 'queued',
            jobId: existingJob.id,
            scheme: existingJob.scheme || targetScheme,
            message: 'Scrape already in progress',
        })
    }

    // 3. Queue a new scrape job with targeted scheme
    const { data: job } = await supabase
        .from('scraper_jobs')
        .insert({ usn: cleanUSN, faculty_id: faculty_id || null, status: 'queued', scheme: targetScheme })
        .select()
        .single()

    return NextResponse.json({
        status: 'queued',
        jobId: job?.id,
        scheme: targetScheme,
        message: `Scrape job queued for ${targetScheme} Scheme — check status in 30-90 seconds`,
    })
}
