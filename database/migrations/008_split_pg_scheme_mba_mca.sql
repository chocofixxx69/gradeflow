-- 008_split_pg_scheme_mba_mca.sql
-- Splits the combined 'pg' (MBA/MCA) scheme into two independent schemes,
-- 'mba' and 'mca', so each can be enabled/disabled/scraped on its own instead
-- of being toggled together as a single "PG" bucket.

-- 1. Existing 'pg' rows become the MBA set (first one registered, no data lost).
UPDATE faculty_vtu_urls SET scheme = 'mba' WHERE scheme = 'pg';

-- 2. Clone those same rows as the MCA set, so both schemes start pre-seeded
--    with the same portal list (VTU has no MBA-specific vs MCA-specific
--    portal — see the comment in app/api/vtu-urls/route.js).
INSERT INTO faculty_vtu_urls (faculty_id, url, exam_name, sort_order, is_active, scheme)
SELECT faculty_id, url, exam_name, sort_order, is_active, 'mca'
FROM faculty_vtu_urls
WHERE scheme = 'mba'
ON CONFLICT (faculty_id, url, scheme) DO NOTHING;

-- 3. Same split for any queued/historical scraper_jobs tagged 'pg'.
UPDATE scraper_jobs SET scheme = 'mba' WHERE scheme = 'pg';

CREATE INDEX IF NOT EXISTS idx_faculty_vtu_urls_fac_scheme ON faculty_vtu_urls(faculty_id, scheme, is_active);
