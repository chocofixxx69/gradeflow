import os
import sys
import json
import urllib.request
from dotenv import load_dotenv

# Load .env and .env.local
load_dotenv()
load_dotenv('.env.local')


SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_ACCESS_TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN")

print(f"Supabase URL: {SUPABASE_URL}")
print(f"Service Role Key present: {bool(SUPABASE_SERVICE_ROLE_KEY)}")
print(f"Access Token present: {bool(SUPABASE_ACCESS_TOKEN)}")

if not SUPABASE_URL or "ambaatwhefphvkpukgya" not in SUPABASE_URL:
    print("Error: Invalid or missing Supabase URL in .env")
    sys.exit(1)

project_ref = "ambaatwhefphvkpukgya"

schema_sql = """
-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Per-faculty VTU URLs
CREATE TABLE IF NOT EXISTS faculty_vtu_urls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id  uuid REFERENCES faculty_onboarding(id) ON DELETE CASCADE,
  url         text NOT NULL,
  exam_name   text,
  is_active   boolean DEFAULT true,
  discovered  timestamptz DEFAULT now(),
  UNIQUE(faculty_id, url)
);

-- Global VTU result URLs table
CREATE TABLE IF NOT EXISTS vtu_result_urls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  url         text NOT NULL UNIQUE,
  exam_name   text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
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
  usn           text NOT NULL REFERENCES students(usn) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_marks_unique
ON subject_marks(usn, subject_code, semester);

-- Manual marks
CREATE TABLE IF NOT EXISTS marks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid REFERENCES students(id) ON DELETE CASCADE,
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

-- Academic remarks
CREATE TABLE IF NOT EXISTS academic_remarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid REFERENCES students(id) ON DELETE CASCADE,
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
  faculty_id  uuid REFERENCES faculty_onboarding(id) ON DELETE SET NULL,
  status      text DEFAULT 'queued',
  created_at  timestamptz DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz,
  error       text
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

-- Subject catalog
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

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  name         text,
  credits      numeric,
  semester     int,
  branch       text,
  scheme       text,
  cie_max      int DEFAULT 50,
  see_max      int DEFAULT 50,
  created_at   timestamptz DEFAULT now()
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  branch      text,
  semester    int,
  section     text,
  batch       text,
  created_at  timestamptz DEFAULT now()
);

-- Class students mapping
CREATE TABLE IF NOT EXISTS class_students (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid REFERENCES classes(id) ON DELETE CASCADE,
  usn         text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(class_id, usn)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,
  details     jsonb,
  user_id     uuid,
  ip_address  text,
  created_at  timestamptz DEFAULT now()
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
ALTER TABLE faculty_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read own profile" ON students;
CREATE POLICY "Students can read own profile" ON students FOR SELECT USING (true);

DROP POLICY IF EXISTS "Subject catalog is public" ON subject_catalog;
CREATE POLICY "Subject catalog is public" ON subject_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "Subject marks visibility" ON subject_marks;
CREATE POLICY "Subject marks visibility" ON subject_marks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Results visibility" ON results;
CREATE POLICY "Results visibility" ON results FOR SELECT USING (true);

DROP POLICY IF EXISTS "Faculty can see their own onboarding" ON faculty_onboarding;
CREATE POLICY "Faculty can see their own onboarding" ON faculty_onboarding FOR SELECT USING (true);
"""

headers = {
    'Authorization': f'Bearer {SUPABASE_ACCESS_TOKEN}',
    'User-Agent': 'SupabaseCLI/1.100.0',
    'Content-Type': 'application/json'
}

print("Executing schema on Supabase...")
req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{project_ref}/database/query',
    data=json.dumps({'query': schema_sql}).encode(),
    headers=headers
)

try:
    with urllib.request.urlopen(req) as resp:
        print('Schema applied successfully. Status:', resp.status)
        print('Result:', resp.read().decode())
except Exception as e:
    print('Schema execution failed:', e)
    if hasattr(e, 'read'):
        print('Error body:', e.read().decode())
    sys.exit(1)

# Now seed initial VTU URLs if empty
seed_urls_sql = """
INSERT INTO vtu_result_urls (title, url, exam_name, is_active)
VALUES 
  ('Dec 25/Jan 26 Regular (NEP)', 'https://results.vtu.ac.in/indexD5J6.php', 'Dec 25/Jan 26 NEP', true),
  ('Jun/Jul 25 Regular (NEP)', 'https://results.vtu.ac.in/indexJJ25.php', 'Jun/Jul 25 NEP', true),
  ('Dec 24/Jan 25 Regular (NEP)', 'https://results.vtu.ac.in/indexD4J5.php', 'Dec 24/Jan 25 NEP', true)
ON CONFLICT (url) DO NOTHING;
"""

print("Seeding initial VTU URLs...")
req_seed = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{project_ref}/database/query',
    data=json.dumps({'query': seed_urls_sql}).encode(),
    headers=headers
)
try:
    with urllib.request.urlopen(req_seed) as resp:
        print('Seed applied successfully. Status:', resp.status)
except Exception as e:
        print('Seed failed:', e)

print("Setup completed successfully!")
