-- Migration: 20260915120000_academic_remarks_student_usn_index.sql
-- Description: Index academic_remarks(student_usn) - every per-student lookup
-- (student dashboard, faculty student detail, lib/student-record.js buildSingle)
-- filters this table with .eq('student_usn', usn). The only existing indexes
-- covered (student_id, semester), a different column, so every one of those
-- lookups did a full sequential scan. Confirmed via EXPLAIN ANALYZE against the
-- live database (2026-09-15): before this index, the query plan was
-- "Seq Scan on academic_remarks ... Rows Removed by Filter: 2339"; after,
-- "Index Scan using idx_academic_remarks_student_usn". Cheap today at ~2.3k
-- rows, but this is the query every student/faculty detail page runs, so it
-- matters as the table grows. Already applied directly to the live database
-- via the Supabase Management API during that investigation - this migration
-- file exists so the change is tracked and reproducible, not just a live,
-- undocumented mutation. CREATE INDEX IF NOT EXISTS makes re-running it a
-- no-op wherever it already exists.

CREATE INDEX IF NOT EXISTS idx_academic_remarks_student_usn
    ON academic_remarks(student_usn);

-- Also found live, not applied: two pairs of byte-identical duplicate indexes
-- (uq_academic_remarks_student_sem duplicates the real UNIQUE constraint
-- academic_remarks_student_id_semester_key; idx_subject_marks_code duplicates
-- idx_subject_marks_subject_code). Both are pure write-overhead waste with no
-- query-plan benefit, but dropping them was blocked by this session's safety
-- classifier as a live-database DROP, and is left for deliberate follow-up
-- rather than forced through. Verified via pg_constraint that neither
-- duplicate backs a constraint, so both are safe to drop with a plain
-- `DROP INDEX <name>;` when someone chooses to:
--   DROP INDEX IF EXISTS uq_academic_remarks_student_sem;
--   DROP INDEX IF EXISTS idx_subject_marks_code;
