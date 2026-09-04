-- ============================================================================
-- 20260904000900_fix_scraper_jobs_status.sql
-- Corrects a constraint introduced in 20260904000300_data_integrity.sql.
--
-- The mistake:
--   That migration derived the allowed scraper_jobs statuses from live data,
--   which happened to contain only 'running' at the time, and filled in a
--   plausible-sounding vocabulary: queued/running/completed/failed/cancelled.
--
--   The real vocabulary is set by the code, not by the rows that existed:
--     backend/scraper/process_queue.py writes 'running', 'finished',
--     'no_result' and 'error'; /api/scrape and backend/api/main.py insert
--     'queued'; app/faculty/dashboard/page.jsx branches on 'finished',
--     'no_result' and 'error'.
--
--   So the constraint would have rejected every terminal write the scraper
--   makes, leaving jobs stuck in 'running' forever and failing the worker.
--
-- Verified after applying: a job can move
--   queued -> running -> finished -> no_result -> error
-- without violating the constraint.
--
-- Lesson worth keeping: a status vocabulary comes from the writers, not from a
-- sample of current rows.
-- ============================================================================

begin;

alter table public.scraper_jobs
    drop constraint if exists chk_scraper_status;

alter table public.scraper_jobs
    add constraint chk_scraper_status
    check (status is null or status in ('queued','running','finished','no_result','error'));

comment on column public.scraper_jobs.status is
    'queued -> running -> finished | no_result | error. Written by backend/scraper/process_queue.py.';

commit;
