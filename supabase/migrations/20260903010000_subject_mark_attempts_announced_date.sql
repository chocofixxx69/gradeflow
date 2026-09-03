-- Additive: subject_mark_attempts was missing announced_date, so every UI
-- surface showing "Date Declared" was actually displaying scraped_at (when
-- OUR scraper happened to visit the result page) instead of the real VTU
-- announcement date — confirmed off by ~2 months on a live record
-- (usn 2AB23CS078, BCS602: real announced_date 2026-06-30 vs scraped_at
-- showing as 22 Aug 2026). subject_marks already captures this field
-- correctly; subject_mark_attempts simply never had a column for it.

ALTER TABLE subject_mark_attempts
  ADD COLUMN IF NOT EXISTS announced_date date;
