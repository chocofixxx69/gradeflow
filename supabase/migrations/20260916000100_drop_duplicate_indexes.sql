-- Migration: 20260916000100_drop_duplicate_indexes.sql
-- Description: Drop two byte-identical duplicate indexes found live and flagged
-- (not applied) by the 20260915120000 migration's investigation:
--   - uq_academic_remarks_student_sem duplicates the real UNIQUE constraint
--     academic_remarks_student_id_semester_key (same columns: student_id, semester).
--   - idx_subject_marks_code duplicates idx_subject_marks_subject_code (same
--     column: subject_code).
-- Both are pure write-path overhead — every INSERT/UPDATE on these tables
-- maintained two physically separate btrees for the same lookup, with zero
-- query-plan benefit (Postgres only ever needs one). Independently re-verified
-- today via pg_constraint that neither index backs a constraint (conindid has no
-- matching row for either), so dropping is safe: no constraint enforcement is
-- lost, and any read plan that used one still has the surviving twin available.
-- Row counts confirmed unchanged before/after (dropping an index never touches
-- table data): subject_marks 19,345 rows, academic_remarks 2,345 rows.

DROP INDEX IF EXISTS uq_academic_remarks_student_sem;
DROP INDEX IF EXISTS idx_subject_marks_code;
