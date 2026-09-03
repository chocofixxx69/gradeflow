-- Append-only history of every scraped subject-mark attempt — additive only,
-- no existing table/column touched.
--
-- Why this exists: subject_marks intentionally keeps only ONE row per
-- (usn, subject_code, semester) — whichever attempt is currently best, per
-- VTU policy ("the higher of the original and revaluation marks always
-- stands"). That's correct for CGPA/SGPA/backlog computation, but it means
-- the moment a revaluation comes back better, the original pre-reval mark is
-- overwritten and gone — there was never a real "before" value to report on
-- for Reval Impact analysis (confirmed empty across the entire live database:
-- 1,623 result declarations, 257 of them revaluations, 10,318 subject_marks
-- rows, zero recoverable before/after pairs).
--
-- This table changes nothing about how subject_marks or SGPA/CGPA/backlogs
-- are computed. The scraper additionally inserts one row here per raw scraped
-- attempt, on top of its existing upsert-best-only write to subject_marks.
-- Nothing here is ever updated or overwritten — every scrape of a subject is
-- its own permanent row, so a genuine before/after comparison becomes
-- possible for every scrape from this point forward.

CREATE TABLE IF NOT EXISTS subject_mark_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id     uuid REFERENCES results(id) ON DELETE CASCADE,
  usn           text NOT NULL,
  semester      int,
  subject_code  text NOT NULL,
  subject_name  text,
  internal      int,
  external      int,
  total         int,
  grade         text,
  credits       int,
  passed        boolean,
  exam_name     text,
  scraped_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sma_usn_subject_sem ON subject_mark_attempts(usn, subject_code, semester);
CREATE INDEX IF NOT EXISTS idx_sma_result_id       ON subject_mark_attempts(result_id);
CREATE INDEX IF NOT EXISTS idx_sma_scraped_at       ON subject_mark_attempts(scraped_at);

ALTER TABLE subject_mark_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subject mark attempts visibility" ON subject_mark_attempts
  FOR SELECT USING (true);
