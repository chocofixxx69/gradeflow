-- Scheme reorg: BE-only, 22/25-scheme portal tables, branch seed, ordering.
-- Additive/idempotent — nothing here drops existing data.
-- Mirrors database/migrations/002_scheme_reorg.sql — keep both in sync.

-- 1. Branches (live table already exists via app usage; formalize it here).
CREATE TABLE IF NOT EXISTS branches (
  code  text PRIMARY KEY,
  label text NOT NULL
);

INSERT INTO branches (code, label) VALUES
  ('CS', 'Computer Science & Engineering'),
  ('AI', 'AI & Machine Learning'),
  ('DS', 'Computer Science & Engineering (Data Science)'),
  ('EC', 'Electronics & Communication Engineering'),
  ('EE', 'Electrical & Electronics Engineering'),
  ('CV', 'Civil Engineering'),
  ('ME', 'Mechanical Engineering'),
  ('RI', 'Robotics & Artificial Intelligence')
ON CONFLICT (code) DO NOTHING;

-- 2. Scheme-specific VTU result-portal tables (replaces vtu_result_urls as the
--    canonical discovery target; vtu_result_urls is left in place, unwritten,
--    since faculty_vtu_urls seeding still falls back to it for old rows).
--
--    NOTE: a single VTU exam-session portal serves any BE USN regardless of
--    admission-year scheme (VTU does not segregate portals by curriculum
--    scheme) — so both tables are seeded from the same BE-filtered discovery
--    feed today. They exist as separate tables so faculty can independently
--    prune/toggle the list they use per scheme cohort they teach, and so the
--    scraper has a natural home to diverge into if VTU ever does start
--    separating portals by scheme in the future.
CREATE TABLE IF NOT EXISTS vtu_urls_2022_scheme (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  url         text NOT NULL UNIQUE,
  exam_name   text,
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  discovered  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vtu_urls_2025_scheme (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  url         text NOT NULL UNIQUE,
  exam_name   text,
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  discovered  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vtu_urls_2022_sort ON vtu_urls_2022_scheme(sort_order);
CREATE INDEX IF NOT EXISTS idx_vtu_urls_2025_sort ON vtu_urls_2025_scheme(sort_order);

ALTER TABLE vtu_urls_2022_scheme ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VTU 2022 scheme urls are public" ON vtu_urls_2022_scheme;
CREATE POLICY "VTU 2022 scheme urls are public" ON vtu_urls_2022_scheme FOR SELECT USING (true);

ALTER TABLE vtu_urls_2025_scheme ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VTU 2025 scheme urls are public" ON vtu_urls_2025_scheme;
CREATE POLICY "VTU 2025 scheme urls are public" ON vtu_urls_2025_scheme FOR SELECT USING (true);

-- 3. faculty_vtu_urls gains a scheme tag + sort order (stays one table; the
--    existing per-URL toggle API/UI don't need to change shape).
ALTER TABLE faculty_vtu_urls ADD COLUMN IF NOT EXISTS scheme text;
ALTER TABLE faculty_vtu_urls ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_faculty_vtu_urls_scheme ON faculty_vtu_urls(faculty_id, scheme);
