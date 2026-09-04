-- ============================================================================
-- 20260904000600_rls_lockdown_phase1.sql
-- Make RLS actually enforce, everywhere it can without breaking the app.
--
-- Starting position:
--   RLS was "enabled" on all 24 tables, but nearly every policy read
--   USING (true) for the public role, and anon/authenticated additionally held
--   the default DELETE/INSERT/SELECT/TRUNCATE/UPDATE grants on every table.
--   The net effect was an open database behind a switch that looked closed.
--
-- What decided the scope:
--   The frontend was audited before anything was dropped. Browser code using
--   the anon key (lib/supabase.js) only ever touches five tables:
--     students, subject_catalog, marks, faculty_activity, vtu_result_urls
--   Everything else is reached exclusively through Next.js API routes on the
--   service role, which bypasses RLS entirely and is unaffected by this file.
--   No browser code performs a Supabase DELETE anywhere - the admin terminal's
--   deletions go through an API route, and its `.delete(` calls are JS Set
--   operations.
--
-- Result: 18 of 24 tables are now unreachable with the anon key. The remaining
--   six are listed in phase 2 below and need app changes before they can close.
-- ============================================================================

begin;

-- ── Policies granting the public role data it never reads ──────────────────
drop policy if exists "Results visibility"                     on public.results;
drop policy if exists "Subject marks visibility"               on public.subject_marks;
drop policy if exists "Subject mark attempts visibility"       on public.subject_mark_attempts;
drop policy if exists "Faculty can see their own onboarding"   on public.faculty_onboarding;
drop policy if exists "Faculty subject assignments visibility" on public.faculty_subject_assignments;
drop policy if exists "Scraper jobs readability"               on public.scraper_jobs;
drop policy if exists "Exam sessions are public"               on public.exam_sessions;
drop policy if exists "VTU 2022 scheme urls are public"        on public.vtu_urls_2022_scheme;
drop policy if exists "VTU 2025 scheme urls are public"        on public.vtu_urls_2025_scheme;
-- system_settings had a policy for ALL commands: anon could rewrite app config.
drop policy if exists "Allow staff full access to system_settings" on public.system_settings;
-- audit_logs allowed anonymous INSERT: anyone could forge entries in the trail.
drop policy if exists "Audit log insert"                       on public.audit_logs;

-- ── RLS on, explicitly, for every table ────────────────────────────────────
alter table public.results                     enable row level security;
alter table public.subject_marks               enable row level security;
alter table public.subject_mark_attempts       enable row level security;
alter table public.academic_remarks            enable row level security;
alter table public.students                    enable row level security;
alter table public.classes                     enable row level security;
alter table public.class_students              enable row level security;
alter table public.faculty_onboarding          enable row level security;
alter table public.faculty_subject_assignments enable row level security;
alter table public.faculty_activity            enable row level security;
alter table public.faculty_vtu_urls            enable row level security;
alter table public.admin_users                 enable row level security;
alter table public.audit_logs                  enable row level security;
alter table public.scraper_jobs                enable row level security;
alter table public.exam_sessions               enable row level security;
alter table public.subject_catalog             enable row level security;
alter table public.subjects                    enable row level security;
alter table public.branches                    enable row level security;
alter table public.marks                       enable row level security;
alter table public.system_settings             enable row level security;
alter table public.support_tickets             enable row level security;
alter table public.vtu_result_urls             enable row level security;
alter table public.vtu_urls_2022_scheme        enable row level security;
alter table public.vtu_urls_2025_scheme        enable row level security;

-- ── Remove the grants underneath, so RLS is not the only line of defence ───
revoke all on public.results                     from anon, authenticated;
revoke all on public.subject_marks               from anon, authenticated;
revoke all on public.subject_mark_attempts       from anon, authenticated;
revoke all on public.academic_remarks            from anon, authenticated;
revoke all on public.classes                     from anon, authenticated;
revoke all on public.class_students              from anon, authenticated;
revoke all on public.faculty_onboarding          from anon, authenticated;
revoke all on public.faculty_subject_assignments from anon, authenticated;
revoke all on public.faculty_vtu_urls            from anon, authenticated;
revoke all on public.admin_users                 from anon, authenticated;
revoke all on public.audit_logs                  from anon, authenticated;
revoke all on public.scraper_jobs                from anon, authenticated;
revoke all on public.exam_sessions               from anon, authenticated;
revoke all on public.subjects                    from anon, authenticated;
revoke all on public.system_settings             from anon, authenticated;
revoke all on public.support_tickets             from anon, authenticated;
revoke all on public.vtu_urls_2022_scheme        from anon, authenticated;
revoke all on public.vtu_urls_2025_scheme        from anon, authenticated;

-- ── On the five tables the browser does use, strip what it never exercises ─
revoke truncate, references, trigger, delete on public.students         from anon, authenticated;
revoke truncate, references, trigger, delete on public.subject_catalog  from anon, authenticated;
revoke truncate, references, trigger, delete on public.marks            from anon, authenticated;
revoke truncate, references, trigger, delete on public.faculty_activity from anon, authenticated;
revoke truncate, references, trigger, delete on public.branches         from anon, authenticated;
revoke truncate, references, trigger, delete, insert, update
    on public.vtu_result_urls from anon, authenticated;

-- Grants with no policy behind them: already blocked, removed anyway.
revoke insert, update on public.branches         from anon, authenticated;
revoke insert, update on public.subject_catalog  from anon, authenticated;
revoke update         on public.faculty_activity from anon, authenticated;

-- ── Roster mutation functions are for server-side callers only ─────────────
revoke execute on function public.add_students_to_class(uuid, text[], text)            from anon, authenticated;
revoke execute on function public.remove_students_from_class(uuid, text[])             from anon, authenticated;
revoke execute on function public.transfer_students_to_class(uuid, uuid, text[], text) from anon, authenticated;
revoke execute on function public.create_class_with_students(text, text, integer, text, text, text, text, uuid, text[], text)
    from anon, authenticated;

commit;

-- ============================================================================
-- PHASE 2 - still open, because each needs an app change first.
--
-- These five tables remain anon-reachable only because browser code writes or
-- reads them directly with the public anon key:
--
--   students          SELECT+INSERT+UPDATE
--                     app/settings/page.jsx        .select('*')  <- returns
--                                                  recovery_pin (plaintext)
--                                                  and password_hash
--                     app/admin/terminal/page.jsx  .update({password_hash:null,
--                                                  recovery_pin:null})
--                     app/calculator/page.jsx      .upsert(...)
--                     components/ClerkSync.jsx     .insert(...)
--                     app/vault/page.jsx           .select('id')
--                     The .eq('usn', ...) filters in these calls are client
--                     supplied, not a security boundary: with USING (true) any
--                     caller can substitute any USN.
--
--   marks             SELECT+INSERT+UPDATE  - app/dashboard, app/vault upserts
--   subject_catalog   SELECT                - app/curriculum, app/faculty/subjects
--                     (its upsert already fails: no INSERT policy exists)
--   faculty_activity  SELECT+INSERT         - app/analytics reads client-side
--   vtu_result_urls   SELECT                - app/api/supabase-status
--
-- The fix is the same in each case: move the call into a Next.js API route that
-- validates the session cookie and uses the service-role client, then drop the
-- corresponding policy and grant here.
-- ============================================================================
