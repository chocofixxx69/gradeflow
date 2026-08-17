-- Result Analysis backend — additive-only migration.
-- Adds only what's confirmed missing against the live schema; everything else
-- required by the Result Analysis spec (classes.section/batch/academic_year/scheme,
-- exam_sessions, faculty_subject_assignments, results.exam_session_id) already exists.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS lateral_entry boolean DEFAULT false;

-- Deliberately NOT adding academic_remarks.backlog_count / is_all_clear:
-- backlog state is derived from subject_marks.is_backlog (single source of truth),
-- not stored redundantly.

CREATE INDEX IF NOT EXISTS idx_subject_marks_subject_code ON subject_marks(subject_code);
CREATE INDEX IF NOT EXISTS idx_subject_marks_is_backlog   ON subject_marks(is_backlog);
CREATE INDEX IF NOT EXISTS idx_subject_marks_result_id    ON subject_marks(result_id);
CREATE INDEX IF NOT EXISTS idx_fsa_faculty_id             ON faculty_subject_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_results_exam_session_id    ON results(exam_session_id);
