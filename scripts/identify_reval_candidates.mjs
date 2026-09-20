// ONE-TIME, READ-ONLY historical audit.
//
// Pulls every scraped attempt (subject_mark_attempts) plus the currently
// active subject_marks/results rows, and flags usn+subject+semester groups
// where a "revaluation" exam portal contributed an attempt.
//
// IMPORTANT LIMITATION (confirmed via supabase/migrations/20260903000000_
// subject_mark_attempts_history.sql and direct inspection): subject_marks
// and subject_mark_attempts only ever store the scraper's already-merged
// internal/external/total for an attempt. They never stored the raw VTU
// "Old Marks / RV Marks / Final Marks" three-column breakdown. So this
// script can prove ONLY that a reval portal was involved for a given
// subject — it CANNOT prove what VTU's true Final Marks value was, and
// therefore performs NO corrections. Every flagged row requires a live
// VTU re-check (see backend/scraper/reconcile_historical.py) before any
// database write.
//
// Zero writes. Read-only against subject_mark_attempts, subject_marks, results.

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

const REVAL_PATTERN = /RV|REVAL/i;

async function fetchAll(table, select) {
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let data, error;
    for (let retry = 0; retry < 5; retry++) {
      ({ data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1));
      if (!error) break;
      console.error(`  [retry ${retry + 1}/5] ${table} range(${from}): ${error.message}`);
      await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
    }
    if (error) { throw new Error(`Failed to fetch ${table} at offset ${from} after retries: ${error.message}`); }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log('Fetching subject_mark_attempts, subject_marks, results (read-only)...');
  const attempts = await fetchAll('subject_mark_attempts',
    'usn,semester,subject_code,subject_name,internal,external,total,grade,passed,exam_name,scraped_at');
  const currentMarks = await fetchAll('subject_marks',
    'usn,semester,subject_code,internal,external,total,grade,passed,is_backlog');
  const results = await fetchAll('results', 'usn,semester,sgpa,exam_name');

  console.log(`Loaded ${attempts.length} attempts, ${currentMarks.length} current subject_marks rows, ${results.length} results rows.`);

  const curByKey = new Map();
  for (const r of currentMarks) curByKey.set(`${r.usn}|${r.semester}|${r.subject_code}`, r);

  const groups = new Map();
  for (const a of attempts) {
    const k = `${a.usn}|${a.semester}|${a.subject_code}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }

  const candidates = [];
  for (const [key, rows] of groups) {
    const hasRevalAttempt = rows.some(r => REVAL_PATTERN.test(r.exam_name || ''));
    if (!hasRevalAttempt) continue;

    rows.sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
    const [usn, semester, subject_code] = key.split('|');
    const current = curByKey.get(key);

    const revalAttempts = rows.filter(r => REVAL_PATTERN.test(r.exam_name || ''));
    const regularAttempts = rows.filter(r => !REVAL_PATTERN.test(r.exam_name || ''));

    // A reval EXAM PORTAL page lists a student's whole subject set for that
    // session, not just subjects actually revalued — so most reval-portal
    // attempts are identical to the regular attempt and are NOT evidence of
    // anything. Only a genuine VALUE DIFFERENCE between a regular attempt and
    // a reval attempt for the same subject is evidence that a revaluation
    // actually happened for that subject.
    const regularExternals = new Set(regularAttempts.map(r => r.external));
    const divergentRevalAttempts = revalAttempts.filter(r => regularAttempts.length > 0 && !regularExternals.has(r.external));

    const currentMatchesDivergentReval = current && divergentRevalAttempts.some(
      r => r.external === current.external && r.total === current.total
    );

    let priority;
    let classification;
    if (regularAttempts.length === 0) {
      priority = 'MEDIUM — no regular-portal attempt recorded to cross-check against (subject may only exist via reval/makeup portal)';
      classification = 'CANDIDATE — CANNOT CROSS-CHECK (no baseline attempt); requires live VTU re-check';
    } else if (divergentRevalAttempts.length === 0) {
      // reval portal attempt(s) exist but match the regular value exactly —
      // strong evidence this subject was NOT actually revalued.
      continue;
    } else if (currentMatchesDivergentReval) {
      priority = 'HIGH — currently-stored value equals a reval-portal attempt that DIFFERS from the regular-portal attempt (a real revaluation occurred; old parser likely stored RV Marks instead of Final Marks)';
      classification = 'CANDIDATE — VTU FINAL MARKS UNVERIFIED; requires live re-check before correction';
    } else {
      priority = 'LOW — a real reval was detected but a later/higher attempt already superseded it in subject_marks';
      classification = 'CANDIDATE — VTU FINAL MARKS UNVERIFIED (informational); requires live re-check to confirm current value is already correct';
    }

    candidates.push({
      usn,
      semester: Number(semester),
      subject_code,
      current_subject_marks: current || null,
      regular_attempts: regularAttempts.map(r => ({ exam_name: r.exam_name, external: r.external, total: r.total, grade: r.grade, scraped_at: r.scraped_at })),
      reval_attempts: revalAttempts.map(r => ({ exam_name: r.exam_name, external: r.external, total: r.total, grade: r.grade, scraped_at: r.scraped_at })),
      divergent: divergentRevalAttempts.length > 0,
      priority,
      classification,
    });
  }

  candidates.sort((a, b) => (a.priority < b.priority ? -1 : 1));

  const highPriority = candidates.filter(c => c.priority.startsWith('HIGH'));
  const mediumPriority = candidates.filter(c => c.priority.startsWith('MEDIUM'));
  const lowPriority = candidates.filter(c => c.priority.startsWith('LOW'));

  const report = {
    generated_at: new Date().toISOString(),
    method: 'DB-only audit (no live VTU access). Flags usn+subject+semester groups where a reval-portal attempt genuinely DIFFERS from a regular-portal attempt (evidence a revaluation actually happened), using existing subject_mark_attempts history. Reval-portal attempts identical to the regular attempt are excluded (not evidence of anything — reval portals list a student\'s full subject set, not just revalued subjects).',
    limitation: 'Cannot prove correctness — VTU Final Marks column was never persisted historically, only the scraper\'s already-merged internal/external/total. Every candidate needs a live VTU re-check (backend/scraper/reconcile_historical.py) before any correction.',
    counts: {
      total_attempts_scanned: attempts.length,
      total_current_subject_marks: currentMarks.length,
      subject_semester_groups_with_genuine_reval_divergence: candidates.length,
      high_priority_candidates: highPriority.length,
      medium_priority_candidates: mediumPriority.length,
      low_priority_candidates: lowPriority.length,
    },
    high_priority_candidates: highPriority,
    medium_priority_candidates: mediumPriority,
    low_priority_candidates: lowPriority,
  };

  fs.writeFileSync('scripts/reval_candidates_report.json', JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`\nFull report written to scripts/reval_candidates_report.json`);
  console.log(`\nTop 5 HIGH priority candidates:`);
  console.log(JSON.stringify(highPriority.slice(0, 5), null, 2));
}

main();
