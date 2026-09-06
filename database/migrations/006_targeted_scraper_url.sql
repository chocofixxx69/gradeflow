-- 006_targeted_scraper_url.sql
-- Enables targeted single-portal scraping for newly announced reval & backlog results.

ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS target_url text;

CREATE INDEX IF NOT EXISTS idx_scraper_jobs_target_url ON scraper_jobs(target_url);

COMMENT ON COLUMN scraper_jobs.target_url IS 'Optional single VTU portal URL override. When set, scraper worker scans only this specific portal instead of iterating all configured URLs.';
