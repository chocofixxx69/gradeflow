-- ============================================================================
-- 20260904000800_students_usn_format.sql
-- Reject malformed USNs at the database.
--
-- The problem:
--   A mistyped USN such as 2AB23CS0001 (four-digit roll suffix) was creating a
--   real student profile. Four code paths inserted into students without any
--   VTU verification:
--     app/api/auth/activate/route.js      - invented a row on activation
--     app/api/student/dashboard/route.js  - "auto-create profile if absent"
--     components/ClerkSync.jsx            - anon-key insert (Clerk is disabled)
--     app/api/admin/student-action        - deliberate admin action (legitimate)
--   The prior constraint only required length >= 7, which that typo satisfies.
--
--   Only backend/scraper/engine.py should create a student, and it does so
--   after VTU has actually returned results for the USN.
--
-- VTU USN shape:
--   <digit><college: 2 letters><admission year: 2 digits>
--   <branch: 2-3 letters><roll: 3 digits>        e.g. 2AB23CS001
--
-- All 559 existing rows match the 2-letter-branch form. {2,3} mirrors the
-- validation app/api/scrape/route.js already applies, so nothing valid is lost.
-- Verified after applying: inserting 2AB23CS0001 raises check_violation.
-- ============================================================================

begin;

alter table public.students
    drop constraint if exists chk_students_usn_shape;

alter table public.students
    add constraint chk_students_usn_format
    check (btrim(upper(usn)) ~ '^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{3}$');

comment on constraint chk_students_usn_format on public.students is
    'Rejects malformed USNs (e.g. a four-digit roll suffix) at the database, regardless of which code path attempts the insert.';

commit;
