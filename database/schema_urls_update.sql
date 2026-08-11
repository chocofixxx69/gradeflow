-- Migration to isolate VTU scraping URLs per-faculty

-- 1. Create the new per-faculty URL table
CREATE TABLE IF NOT EXISTS faculty_vtu_urls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id  uuid REFERENCES faculty_onboarding(id) ON DELETE CASCADE,
  url         text NOT NULL,
  exam_name   text,
  is_active   boolean DEFAULT true,
  discovered  timestamptz DEFAULT now(),
  UNIQUE(faculty_id, url)
);

-- 2. Add faculty_id to the scraper_jobs queue
ALTER TABLE scraper_jobs 
ADD COLUMN IF NOT EXISTS faculty_id uuid REFERENCES faculty_onboarding(id) ON DELETE SET NULL;

-- 3. Move existing global URLs (optional):
-- If you want to seed URLs from the old table into the new one for existing faculty, you can do it here,
-- but the application API is designed to auto-seed them when the faculty opens the dashboard.
