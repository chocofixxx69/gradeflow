-- Result Analysis module — additive schema migration
-- Nothing here alters or drops existing data; every statement is idempotent (IF NOT EXISTS).

-- Exam session as a first-class entity (previously only a free-text results.exam_name).
CREATE TABLE IF NOT EXISTS exam_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,              -- matches results.exam_name for backfill/lookup
  exam_type     text DEFAULT 'regular',      -- regular | supplementary | improvement
  academic_year text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(name)
);

ALTER TABLE results ADD COLUMN IF NOT EXISTS exam_session_id uuid REFERENCES exam_sessions(id);
CREATE INDEX IF NOT EXISTS idx_results_exam_session ON results(exam_session_id);

-- Faculty-to-subject assignment (previously no such relationship existed anywhere).
CREATE TABLE IF NOT EXISTS faculty_subject_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id   uuid REFERENCES faculty_onboarding(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  branch       text,
  semester     int,
  scheme       text,
  class_id     uuid REFERENCES classes(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(faculty_id, subject_code, class_id)
);
CREATE INDEX IF NOT EXISTS idx_fsa_faculty ON faculty_subject_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_fsa_subject ON faculty_subject_assignments(subject_code);

-- Formalize columns the live database already carries on `classes` but that were
-- never declared in database/schema.sql (confirmed in repo audit: app/api/classes/route.js,
-- lib/analytics-data.js, app/api/admin/result-analysis/route.js all read/write these).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS faculty_id uuid REFERENCES faculty_onboarding(id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS scheme text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academic_year text;

ALTER TABLE faculty_subject_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Faculty subject assignments visibility" ON faculty_subject_assignments;
CREATE POLICY "Faculty subject assignments visibility" ON faculty_subject_assignments FOR SELECT USING (true);

ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exam sessions are public" ON exam_sessions;
CREATE POLICY "Exam sessions are public" ON exam_sessions FOR SELECT USING (true);

-- Backfill: one exam_sessions row per distinct existing exam_name, then link results to it.
INSERT INTO exam_sessions (name)
SELECT DISTINCT exam_name FROM results WHERE exam_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;

UPDATE results r
SET exam_session_id = es.id
FROM exam_sessions es
WHERE r.exam_name = es.name AND r.exam_session_id IS NULL;
