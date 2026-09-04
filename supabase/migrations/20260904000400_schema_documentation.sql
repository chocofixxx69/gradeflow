-- ============================================================================
-- 20260904000400_schema_documentation.sql
-- Every table and every non-obvious column gets a description.
--
-- These comments render directly in the Supabase table editor, in `\d+` output
-- and in generated TypeScript types. They are what turns a list of 23 tables
-- into a schema someone new can read without asking anyone.
-- ============================================================================

begin;

-- ── Identity & access ──────────────────────────────────────────────────────
comment on table public.students is
    'One row per enrolled student. USN is the natural key used across the results pipeline; id is the surrogate key used by every foreign key.';
comment on column public.students.usn is
    'University Seat Number, uppercase. Characters 6-7 encode the branch (CS, CI, CD, EC, EE, ME, CV, RI) and are the authoritative source for branch_code.';
comment on column public.students.branch is
    'Free-text branch as captured at import. Retained as-is for display and history; branch_code is the canonical value to join on.';
comment on column public.students.branch_code is
    'Canonical branch, FK to branches.code. Derived from the USN by fn_normalize_branch() and kept current by trigger. Join on this, never on branch.';
comment on column public.students.password_hash is 'bcrypt hash. Never store or log the plaintext.';
comment on column public.students.recovery_pin  is 'PLAINTEXT — pending migration to a hashed, expiring column. Do not expose through any API.';
comment on column public.students.year is
    'ADMISSION year (2023, 2024) — not the year of study. Derived from USN characters 4-5 by fn_admission_year_from_usn(). Use semester for academic progress.';
comment on column public.students.lateral_entry is 'True for diploma lateral-entry students, who join in semester 3 and have no semester 1-2 results.';
comment on column public.students.is_suspended  is 'Blocks login. Suspension does not delete data.';

comment on table public.faculty_onboarding is
    'Faculty accounts and their approval workflow. Despite the name this is the live faculty table, not a staging area — classes, scraper_jobs and faculty_activity all reference it.';
comment on column public.faculty_onboarding.status   is 'pending | approved | rejected | suspended. Only approved faculty can sign in.';
comment on column public.faculty_onboarding.password is 'PLAINTEXT — scheduled for removal. password_hash is the column that matters.';

comment on table public.admin_users is 'Platform administrators. Small, sensitive, service-role access only.';

-- ── Academic reference ─────────────────────────────────────────────────────
comment on table public.branches is
    'Canonical branch dimension. usn_codes maps USN characters 6-7 to this branch; aliases lists every spelling seen in imported data. fn_normalize_branch() reads both.';
comment on column public.branches.usn_codes is 'USN branch codes that resolve here, e.g. CD and DS both map to DS.';
comment on column public.branches.aliases   is 'Uppercase spellings that resolve here, e.g. AIML, CI and ARTIFICIAL INTELLIGENCE all map to AI.';
comment on column public.branches.is_active is 'False hides the branch from pickers without deleting it or breaking existing references.';

comment on table public.subject_catalog is
    'Authoritative subject list per scheme, branch and semester. The single source of truth for credits — subject_marks.credits is scraped and not trusted.';
comment on table public.subjects is
    'DORMANT (0 rows). Superseded by subject_catalog. Retained until its cie_max/see_max columns are folded in; no code should read from it.';
comment on table public.exam_sessions is
    'Named exam cycles. Currently unpopulated — results.exam_session_id is nullable until the scraper starts writing sessions.';

-- ── Teaching structure ─────────────────────────────────────────────────────
comment on table public.classes is
    'A teaching section: branch + semester + section for one academic year, optionally owned by a faculty member.';
comment on column public.classes.branch_code is
    'Canonical branch, FK to branches.code. Roster validation compares this against students.branch_code.';

comment on table public.class_students is
    'Class roster membership. Validated on write by trg_class_students_validate: the student must exist, and their branch and scheme must match the class. Semester differences are allowed and flagged.';
comment on column public.class_students.student_id is
    'FK to students.id — the join key. usn is kept alongside for display and for the existing API contract.';
comment on column public.class_students.semester_mismatch is
    'True when the student''s semester differs from the class''s. Legal (backlog students sit in senior classes) but surfaced so the UI can show it.';
comment on column public.class_students.added_by is 'Who added this member — faculty email or admin identifier.';

comment on table public.faculty_subject_assignments is
    'Which faculty may act on which subject, for which class. Currently unpopulated — populate before opening any marks-entry UI, since this is the table that should gate write access.';

-- ── Results pipeline ───────────────────────────────────────────────────────
comment on table public.results is
    'One row per student per exam sitting, as scraped from the VTU result page. Deleting a result cascades to its subject_marks and subject_mark_attempts.';
comment on column public.results.sgpa is 'SGPA as published by VTU. The app recomputes SGPA from the catalog rather than trusting this.';

comment on table public.subject_marks is
    'Current mark per subject per result. Invariant: total = internal + external on every row.';
comment on column public.subject_marks.internal is
    'CIE marks, 0-100. Above 50 indicates a single-component course (external is 0 and total equals internal) — 2,111 such rows exist and are valid.';
comment on column public.subject_marks.external is 'SEE marks, 0-100. Zero on single-component courses.';
comment on column public.subject_marks.credits  is 'Scraped value, not authoritative. Resolve credits from subject_catalog.';
comment on column public.subject_marks.is_backlog is 'Marks this row as a backlog attempt rather than a first sitting.';

comment on table public.subject_mark_attempts is
    'Append-only history: every scraped attempt at a subject, including backlog and makeup retakes. Never updated in place — subject_marks holds the current value, this holds how it got there.';

comment on table public.academic_remarks is
    'Per-student, per-semester rollup (SGPA, backlog count, all-clear). Computed by lib/vtuAcademicEngine.js — the authority for these figures.';

comment on table public.marks is
    'DORMANT (0 rows). An earlier manual marks-entry model superseded by subject_marks. Retained until the faculty marks-entry flow is confirmed to use subject_marks.';

-- ── Scraping & sync ────────────────────────────────────────────────────────
comment on table public.vtu_result_urls      is 'Official VTU result URLs, scheme-agnostic. See also vtu_urls_2022_scheme and vtu_urls_2025_scheme.';
comment on table public.vtu_urls_2022_scheme is 'Result URLs for the 2022 scheme. Candidate for merging into a single exam_urls table keyed by a scheme column.';
comment on table public.vtu_urls_2025_scheme is 'Result URLs for the 2025 scheme. Candidate for merging into a single exam_urls table keyed by a scheme column.';
comment on table public.faculty_vtu_urls     is 'Result URLs contributed by a faculty member. Already carries the scheme as a column, which is the pattern the three tables above should adopt.';
comment on table public.scraper_jobs         is 'Queue and status for scrape runs. status: queued | running | completed | failed | cancelled.';

-- ── Activity, support & system ─────────────────────────────────────────────
comment on table public.faculty_activity is
    'Faculty action log (record views, edits). faculty_id is now a real foreign key; faculty_name is denormalized for fast reads.';
comment on table public.audit_logs is
    'Security-sensitive change trail. Currently unwired — no rows are being written. Intended to be populated by triggers on password, suspension and admin changes, not by application code.';
comment on table public.support_tickets is
    'Help-desk tickets raised by students and faculty. status: open | in_progress | resolved | closed.';
comment on table public.system_settings is
    'Application configuration as key/value JSON. Read at runtime; changes take effect without a deploy.';

-- ── Views & functions ──────────────────────────────────────────────────────
comment on view public.class_roster is
    'Per-class roster: one row per membership with the student profile, alignment flags and academic rollup. This is the "table per class" interface — filter by class_id.';
comment on view public.class_overview is
    'Per-class summary: headcount, alignment warnings and aggregate academics. One row per class.';

commit;
