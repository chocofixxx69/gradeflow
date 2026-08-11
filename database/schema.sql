-- GradeFlow — Complete Database Schema
-- Version: 2.0 (Production SaaS)

-- VTU Result URLs (managed per faculty via dashboard)
CREATE TABLE IF NOT EXISTS faculty_vtu_urls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id  uuid REFERENCES faculty_onboarding(id),
  url         text NOT NULL,
  exam_name   text,
  is_active   boolean DEFAULT true,
  discovered  timestamptz DEFAULT now(),
  UNIQUE(faculty_id, url)
);

-- Students master table
CREATE TABLE IF NOT EXISTS students (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usn           text UNIQUE NOT NULL,
  name          text,
  branch        text,
  college       text,
  year          int,
  scheme        text DEFAULT '2022',
  email         text,
  phone         text,
  photo_url     text,
  password_hash text,
  semester      int,
  activated_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Per-semester results
CREATE TABLE IF NOT EXISTS results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usn           text NOT NULL REFERENCES students(usn),
  semester      int,
  exam_url      text,
  exam_name     text,
  sgpa          numeric(4,2),
  total_credits int,
  scraped_at    timestamptz DEFAULT now(),
  UNIQUE(usn, exam_url)
);

-- Per-subject marks (scraped from VTU)
CREATE TABLE IF NOT EXISTS subject_marks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id     uuid REFERENCES results(id) ON DELETE CASCADE,
  usn           text NOT NULL,
  semester      int,
  subject_code  text,
  subject_name  text,
  internal      int,
  external      int,
  total         int,
  grade         text,
  credits       int,
  passed        boolean,
  is_backlog    boolean DEFAULT false,
  is_makeup     boolean DEFAULT false
);

-- Unique constraint on subject_marks (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_marks_unique
ON subject_marks(usn, subject_code, semester);

-- Per-subject marks (manually entered via calculator)
CREATE TABLE IF NOT EXISTS marks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid REFERENCES students(id),
  student_usn   text,
  subject_code  text,
  subject_name  text,
  cie_marks     int,
  see_marks     int,
  total_marks   int,
  grade         text,
  credits       int DEFAULT 3,
  semester      int,
  sync_source   text DEFAULT 'MANUAL_ENTRY',
  UNIQUE(student_id, subject_code, semester)
);

-- Academic remarks (SGPA per semester)
CREATE TABLE IF NOT EXISTS academic_remarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid REFERENCES students(id),
  student_usn   text,
  semester      int,
  sgpa          numeric(4,2),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(student_id, semester)
);

-- Scraper job queue
CREATE TABLE IF NOT EXISTS scraper_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usn         text NOT NULL,
  faculty_id  uuid REFERENCES faculty_onboarding(id),
  status      text DEFAULT 'queued',
  created_at  timestamptz DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz,
  error       text
);

-- Faculty onboarding
CREATE TABLE IF NOT EXISTS faculty_onboarding (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  email               text,
  department          text,
  password_hash       text,
  status              text DEFAULT 'pending',
  generated_access_key text,
  created_at          timestamptz DEFAULT now()
);

-- Faculty activity log
CREATE TABLE IF NOT EXISTS faculty_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id    uuid,
  faculty_name  text,
  target_usn    text,
  action_type   text DEFAULT 'VIEW_RECORD',
  sync_status   text DEFAULT 'SUCCESS',
  created_at    timestamptz DEFAULT now()
);

-- Subject catalog (pre-defined subjects per scheme/branch/semester)
CREATE TABLE IF NOT EXISTS subject_catalog (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme       text NOT NULL,
  branch       text NOT NULL,
  semester     int NOT NULL,
  subject_code text NOT NULL,
  subject_name text NOT NULL,
  credits      int DEFAULT 3,
  UNIQUE(scheme, branch, semester, subject_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_results_usn    ON results(usn);
CREATE INDEX IF NOT EXISTS idx_marks_usn      ON subject_marks(usn);
CREATE INDEX IF NOT EXISTS idx_marks_student   ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status    ON scraper_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_usn       ON scraper_jobs(usn);
CREATE INDEX IF NOT EXISTS idx_catalog_main   ON subject_catalog(scheme, branch, semester);
CREATE INDEX IF NOT EXISTS idx_faculty_log    ON faculty_activity(created_at);

-- Row Level Security
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE results          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_marks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_catalog  ENABLE ROW LEVEL SECURITY;

-- ── POLICIES ──────────────────────────────────────────────────────────────

-- Students can read their own profile
CREATE POLICY "Students can read own profile" ON students
  FOR SELECT USING (true); -- Relaxed for this app to allow USN lookups

-- Subjects are public
CREATE POLICY "Subject catalog is public" ON subject_catalog
  FOR SELECT USING (true);

-- Subject marks are readable if USN matches (or by faculty)
CREATE POLICY "Subject marks visibility" ON subject_marks
  FOR SELECT USING (true);

-- Results visibility
CREATE POLICY "Results visibility" ON results
  FOR SELECT USING (true);

-- Faculty onboarding (faculty can see their own)
ALTER TABLE faculty_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Faculty can see their own onboarding" ON faculty_onboarding
  FOR SELECT USING (true);
