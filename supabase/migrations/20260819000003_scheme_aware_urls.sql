-- Scheme-Aware VTU Result Portals & Scraper Migration
-- Enables independent portal management and filtering for 2022 Scheme vs 2025 Scheme.

-- 1. Update existing null scheme rows to '2022' (all legacy rows are 2022 scheme)
UPDATE faculty_vtu_urls SET scheme = '2022' WHERE scheme IS NULL;

-- 2. Update unique constraint so the same URL can be configured independently per scheme
ALTER TABLE faculty_vtu_urls DROP CONSTRAINT IF EXISTS faculty_vtu_urls_faculty_id_url_key;
ALTER TABLE faculty_vtu_urls DROP CONSTRAINT IF EXISTS faculty_vtu_urls_faculty_id_url_scheme_key;
ALTER TABLE faculty_vtu_urls ADD CONSTRAINT faculty_vtu_urls_faculty_id_url_scheme_key UNIQUE (faculty_id, url, scheme);

-- 3. Add scheme column to scraper_jobs so queued jobs track target scheme
ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS scheme text;

-- 4. Create indexes for quick scheme-based lookups
CREATE INDEX IF NOT EXISTS idx_faculty_vtu_urls_fac_scheme ON faculty_vtu_urls(faculty_id, scheme, is_active);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_scheme ON scraper_jobs(scheme);
