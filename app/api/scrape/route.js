import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '../../../lib/server-session'
import { fetchByChunks } from '../../../lib/supabase-utils'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export const dynamic = 'force-dynamic'

// Queueing a whole class means one request carrying every USN on the roster.
// The previous implementation ran the full queue routine — a stale-job heal, a
// cache probe, a duplicate-job probe and an insert — once per USN in a
// Promise.all, so an 86-student class opened 344 concurrent Supabase requests
// and frequently timed out or partially queued. Everything below is batched
// instead: a fixed handful of queries regardless of roster size.
const MAX_BATCH_USNS = 400

// A job still 'queued' or 'running' after this long has lost its worker.
const STALE_JOB_MS = 5 * 60 * 1000

// Rows per insert statement. Postgres handles far more, but a smaller
// statement means a failed chunk loses less and reports more precisely.
const INSERT_CHUNK = 100

const USN_REGEX = /^\d[A-Z]{2}\d{2}[A-Z]{2,3}\d{3}$/

function parseUsnList(body) {
    const { usn, usns } = body
    const tokens = []

    if (Array.isArray(usns)) {
        tokens.push(...usns)
    }
    if (usn) {
        if (Array.isArray(usn)) tokens.push(...usn)
        else tokens.push(...String(usn).split(/[\s,;\n\r]+/))
    }

    const valid = []
    const invalid = []
    const seen = new Set()

    for (const raw of tokens) {
        const clean = String(raw || '').trim().toUpperCase()
        if (!clean) continue
        if (!USN_REGEX.test(clean)) {
            if (!invalid.includes(clean)) invalid.push(clean)
            continue
        }
        if (seen.has(clean)) continue
        seen.add(clean)
        valid.push(clean)
    }

    return { valid, invalid }
}

/**
 * Resolve the optional portal override into the single comma-joined string the
 * worker expects. backend/scraper/engine.py splits target_url on commas and
 * whitespace, so several portals can ride in one job — that is the difference
 * between "scan these three reval portals" costing one job and costing three.
 */
function parseTargetUrls(body) {
    const { target_url, target_urls } = body
    const candidates = []

    if (Array.isArray(target_urls)) candidates.push(...target_urls)
    if (target_url) {
        if (Array.isArray(target_url)) candidates.push(...target_url)
        else if (typeof target_url === 'string') candidates.push(...target_url.split(/[,;\s]+/))
    }

    const urls = []
    for (const raw of candidates) {
        const trimmed = String(raw || '').trim()
        if (!trimmed || trimmed === 'ALL') continue
        if (!trimmed.toLowerCase().includes('vtu.ac.in')) {
            return { error: `Invalid portal URL: "${trimmed}". Must belong to results.vtu.ac.in` }
        }
        if (!urls.includes(trimmed)) urls.push(trimmed)
    }

    return { urls, joined: urls.length > 0 ? urls.join(',') : null }
}

function schemeForUsn(targetUsn, explicitScheme) {
    if (explicitScheme) return explicitScheme
    const admissionYear = parseInt(targetUsn.substring(3, 5), 10) || 22
    return admissionYear >= 25 ? '2025' : '2022'
}

export async function POST(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin'])
    if (authError) return authError

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
    }

    const { usns, force, faculty_id, scheme } = body

    // 1. Gather and validate candidate USNs
    const { valid: validUSNs, invalid: invalidUSNs } = parseUsnList(body)

    if (validUSNs.length === 0) {
        return NextResponse.json({
            error: invalidUSNs.length > 0
                ? `Invalid USN format: ${invalidUSNs.slice(0, 10).join(', ')}${invalidUSNs.length > 10 ? ` (+${invalidUSNs.length - 10} more)` : ''}`
                : 'Please provide at least one USN to fetch.'
        }, { status: 400 })
    }

    if (validUSNs.length > MAX_BATCH_USNS) {
        return NextResponse.json({
            error: `Too many USNs in one request (${validUSNs.length}). Queue at most ${MAX_BATCH_USNS} at a time.`
        }, { status: 400 })
    }

    // 2. Validate optional target portal(s)
    const targets = parseTargetUrls(body)
    if (targets.error) {
        return NextResponse.json({ error: targets.error }, { status: 400 })
    }
    const cleanTargetUrl = targets.joined
    const portalCount = targets.urls.length

    // Single-USN callers (the faculty dashboard) still get the original response
    // shape, including the cached student record.
    const isSingleLegacy = validUSNs.length === 1 && !Array.isArray(usns)

    const staleCutoff = new Date(Date.now() - STALE_JOB_MS).toISOString()

    // 3. Auto-heal stale jobs for every USN in this request, in one statement.
    // Without this a crashed worker leaves a permanently 'running' row that the
    // duplicate check below would honour forever, so the USN could never be
    // re-queued.
    try {
        await supabase
            .from('scraper_jobs')
            .update({
                status: 'error',
                error: 'Job timed out / stale worker detected.',
                finished_at: new Date().toISOString()
            })
            .in('usn', validUSNs)
            .in('status', ['queued', 'running'])
            .lt('created_at', staleCutoff)
    } catch (err) {
        // A failed heal must not block queueing — worst case a genuinely stuck
        // USN reports "already in progress" for this round.
        console.error('[POST /api/scrape] stale-job heal failed:', err)
    }

    // 4. Cache probe — skipped entirely when forcing or aiming at a portal,
    // since both mean "go and look again regardless of what we already hold".
    const cachedUsns = new Set()
    let singleCachedStudent = null

    if (!force && !cleanTargetUrl) {
        if (isSingleLegacy) {
            const { data: existing } = await supabase
                .from('students')
                .select('*, results (*, subject_marks (*))')
                .eq('usn', validUSNs[0])
                .maybeSingle()

            if (existing?.results?.length > 0) {
                cachedUsns.add(validUSNs[0])
                singleCachedStudent = existing
            }
        } else {
            const rows = await fetchByChunks('results', 'usn', 'usn', validUSNs, supabase)
            rows.forEach(r => {
                const u = String(r.usn || '').toUpperCase().trim()
                if (u) cachedUsns.add(u)
            })
        }
    }

    // 5. Duplicate probe — fresh queued/running jobs for the same USN (and the
    // same portal target, when one was given).
    const pendingByUsn = new Map()
    const usnsToProbe = validUSNs.filter(u => !cachedUsns.has(u))

    if (usnsToProbe.length > 0) {
        const probeChunks = []
        for (let i = 0; i < usnsToProbe.length; i += INSERT_CHUNK) {
            probeChunks.push(usnsToProbe.slice(i, i + INSERT_CHUNK))
        }

        const probeResults = await Promise.all(probeChunks.map(async (chunk) => {
            let query = supabase
                .from('scraper_jobs')
                .select('id, usn, scheme, target_url, status, created_at')
                .in('usn', chunk)
                .in('status', ['queued', 'running'])
                .gte('created_at', staleCutoff)

            if (cleanTargetUrl) query = query.eq('target_url', cleanTargetUrl)

            const { data, error } = await query
            if (error) {
                console.error('[POST /api/scrape] duplicate probe failed:', error)
                return []
            }
            return data || []
        }))

        // Newest row wins when a USN somehow has more than one live job. The old
        // code used .maybeSingle() here, which errors outright on duplicates.
        for (const job of probeResults.flat()) {
            const key = String(job.usn || '').toUpperCase().trim()
            const prev = pendingByUsn.get(key)
            if (!prev || new Date(job.created_at) > new Date(prev.created_at)) {
                pendingByUsn.set(key, job)
            }
        }
    }

    // 6. Insert whatever is left, in chunks.
    const toInsert = validUSNs.filter(u => !cachedUsns.has(u) && !pendingByUsn.has(u))
    const insertedByUsn = new Map()
    const insertFailures = new Map()

    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK)
        const payload = chunk.map(u => ({
            usn: u,
            faculty_id: faculty_id || null,
            status: 'queued',
            scheme: schemeForUsn(u, scheme),
            target_url: cleanTargetUrl
        }))

        const { data, error } = await supabase
            .from('scraper_jobs')
            .insert(payload)
            .select('id, usn, scheme, target_url')

        if (error) {
            console.error('[POST /api/scrape] insert chunk failed:', error)
            chunk.forEach(u => insertFailures.set(u, error.message || 'Insert failed.'))
            continue
        }

        ;(data || []).forEach(job => {
            insertedByUsn.set(String(job.usn || '').toUpperCase().trim(), job)
        })

        // A chunk that returned fewer rows than it sent means some USNs silently
        // did not land — report those rather than pretending they are queued.
        chunk.forEach(u => {
            if (!insertedByUsn.has(u)) insertFailures.set(u, 'Job row was not created.')
        })
    }

    // 7. Compose a per-USN result, in the order the caller supplied them.
    const results = validUSNs.map(targetUsn => {
        const targetScheme = schemeForUsn(targetUsn, scheme)

        if (cachedUsns.has(targetUsn)) {
            return {
                usn: targetUsn,
                status: 'cached',
                ...(singleCachedStudent ? { student: singleCachedStudent } : {}),
                scheme: singleCachedStudent?.scheme || targetScheme
            }
        }

        const pending = pendingByUsn.get(targetUsn)
        if (pending) {
            return {
                usn: targetUsn,
                status: 'queued',
                jobId: pending.id,
                scheme: pending.scheme || targetScheme,
                target_url: pending.target_url || cleanTargetUrl,
                message: 'Scrape already in progress'
            }
        }

        const inserted = insertedByUsn.get(targetUsn)
        if (inserted) {
            return {
                usn: targetUsn,
                status: 'queued',
                jobId: inserted.id,
                scheme: inserted.scheme || targetScheme,
                target_url: inserted.target_url || cleanTargetUrl,
                message: cleanTargetUrl
                    ? `Targeted portal scan queued (${portalCount} portal(s))`
                    : `Scrape job queued for ${targetScheme} Scheme`
            }
        }

        return {
            usn: targetUsn,
            status: 'error',
            error: insertFailures.get(targetUsn) || 'Could not queue this USN.'
        }
    })

    // Single USN backward compatibility
    if (isSingleLegacy) {
        const single = results[0]
        if (single.status === 'error') {
            return NextResponse.json({ error: single.error }, { status: 500 })
        }
        return NextResponse.json(single)
    }

    // Batch USN response
    const queuedCount = results.filter(r => r.status === 'queued').length
    const cachedCount = results.filter(r => r.status === 'cached').length
    const failedCount = results.filter(r => r.status === 'error').length

    return NextResponse.json({
        status: failedCount > 0 && queuedCount === 0 ? 'error' : 'queued',
        count: results.length,
        queuedCount,
        cachedCount,
        failedCount,
        jobs: results,
        target_url: cleanTargetUrl,
        portalCount,
        invalidUSNs: invalidUSNs.length > 0 ? invalidUSNs : undefined,
        message: [
            `Queued ${queuedCount} scrape job(s)`,
            cachedCount > 0 ? `${cachedCount} already cached` : null,
            failedCount > 0 ? `${failedCount} could not be queued` : null,
        ].filter(Boolean).join(' · ') + '.'
    }, { status: failedCount > 0 && queuedCount === 0 ? 500 : 200 })
}
