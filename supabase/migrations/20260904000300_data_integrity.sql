-- ============================================================================
-- 20260904000300_data_integrity.sql
-- Validation rules, derived from the live data rather than assumed.
--
-- Every constraint below was checked against all existing rows first. Two that
-- an assumption-driven pass would have got wrong:
--
--   * internal <= 50 would FAIL on 2,111 valid rows. Those are single-component
--     courses: external is always 0, total equals internal, grade is always 'P'.
--     The real ceiling is 100.
--   * total = internal + external holds on all 16,951 subject_marks rows, so it
--     is enforced as the invariant that actually describes this data.
-- ============================================================================

begin;

-- ── subject_marks ──────────────────────────────────────────────────────────
alter table public.subject_marks
    alter column result_id    set not null,
    alter column subject_code set not null;

alter table public.subject_marks
    drop constraint if exists chk_subject_marks_internal,
    add  constraint chk_subject_marks_internal check (internal is null or internal between 0 and 100),
    drop constraint if exists chk_subject_marks_external,
    add  constraint chk_subject_marks_external check (external is null or external between 0 and 100),
    drop constraint if exists chk_subject_marks_total,
    add  constraint chk_subject_marks_total    check (total    is null or total    between 0 and 100),
    drop constraint if exists chk_subject_marks_sum,
    add  constraint chk_subject_marks_sum
         check (total is null or internal is null or external is null or total = internal + external),
    drop constraint if exists chk_subject_marks_credits,
    add  constraint chk_subject_marks_credits  check (credits is null or credits between 0 and 30),
    drop constraint if exists chk_subject_marks_grade,
    add  constraint chk_subject_marks_grade
         check (grade is null or upper(btrim(grade)) in ('O','S','A','B','C','D','E','F','P','X','NP','I','AB','W'));

create unique index if not exists uq_subject_marks_result_subject
    on public.subject_marks (result_id, subject_code);

create index if not exists idx_subject_marks_usn      on public.subject_marks (usn);
create index if not exists idx_subject_marks_sem      on public.subject_marks (semester);
create index if not exists idx_subject_marks_code     on public.subject_marks (subject_code);

-- subject_marks.announced_date is text here but date in subject_mark_attempts.
-- Retyped so the same field has the same type in both tables and can be
-- compared and sorted without a cast.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'subject_marks'
          and column_name = 'announced_date' and data_type = 'text'
    ) then
        alter table public.subject_marks
            alter column announced_date type date
            using nullif(btrim(announced_date), '')::date;
    end if;
end;
$$;

-- ── subject_mark_attempts ──────────────────────────────────────────────────
alter table public.subject_mark_attempts
    drop constraint if exists chk_sma_internal,
    add  constraint chk_sma_internal check (internal is null or internal between 0 and 100),
    drop constraint if exists chk_sma_external,
    add  constraint chk_sma_external check (external is null or external between 0 and 100),
    drop constraint if exists chk_sma_total,
    add  constraint chk_sma_total    check (total    is null or total    between 0 and 100),
    drop constraint if exists chk_sma_grade,
    add  constraint chk_sma_grade
         check (grade is null or upper(btrim(grade)) in ('O','S','A','B','C','D','E','F','P','X','NP','I','AB','W'));

create index if not exists idx_sma_usn_subject on public.subject_mark_attempts (usn, subject_code);

-- ── results ────────────────────────────────────────────────────────────────
alter table public.results
    drop constraint if exists chk_results_sgpa,
    add  constraint chk_results_sgpa check (sgpa is null or sgpa between 0 and 10),
    drop constraint if exists chk_results_semester,
    add  constraint chk_results_semester check (semester is null or semester between 1 and 8),
    drop constraint if exists chk_results_credits,
    add  constraint chk_results_credits check (total_credits is null or total_credits between 0 and 40);

create index if not exists idx_results_usn on public.results (usn);
create index if not exists idx_results_usn_sem on public.results (usn, semester);

-- Deleting a result should take its marks with it rather than erroring.
alter table public.subject_marks
    drop constraint if exists subject_marks_result_id_fkey,
    add  constraint subject_marks_result_id_fkey
         foreign key (result_id) references public.results(id)
         on update cascade on delete cascade;

alter table public.subject_mark_attempts
    drop constraint if exists subject_mark_attempts_result_id_fkey,
    add  constraint subject_mark_attempts_result_id_fkey
         foreign key (result_id) references public.results(id)
         on update cascade on delete cascade;

-- ── students ───────────────────────────────────────────────────────────────
alter table public.students
    drop constraint if exists chk_students_semester,
    add  constraint chk_students_semester check (semester is null or semester between 1 and 8),
    -- `year` holds the ADMISSION year (2023, 2024), not the year of study.
    -- Constrained to a plausible admission-year window, not 1-5.
    drop constraint if exists chk_students_year,
    add  constraint chk_students_year     check (year is null or year between 2000 and 2100),
    drop constraint if exists chk_students_usn_shape,
    add  constraint chk_students_usn_shape check (length(btrim(usn)) >= 7);

-- One account per email address, case-insensitively.
create unique index if not exists uq_students_email_ci
    on public.students (lower(btrim(email)))
    where email is not null and btrim(email) <> '';

-- ── academic_remarks ───────────────────────────────────────────────────────
create unique index if not exists uq_academic_remarks_student_sem
    on public.academic_remarks (student_id, semester);

alter table public.academic_remarks
    drop constraint if exists chk_remarks_sgpa,
    add  constraint chk_remarks_sgpa check (sgpa is null or sgpa between 0 and 10),
    drop constraint if exists chk_remarks_backlogs,
    add  constraint chk_remarks_backlogs check (backlog_count is null or backlog_count >= 0);

alter table public.academic_remarks
    drop constraint if exists academic_remarks_student_id_fkey,
    add  constraint academic_remarks_student_id_fkey
         foreign key (student_id) references public.students(id)
         on update cascade on delete cascade;

-- ── subject_catalog ────────────────────────────────────────────────────────
create unique index if not exists uq_subject_catalog_row
    on public.subject_catalog (scheme, branch, semester, subject_code);

alter table public.subject_catalog
    drop constraint if exists chk_catalog_semester,
    add  constraint chk_catalog_semester check (semester between 1 and 8),
    drop constraint if exists chk_catalog_credits,
    add  constraint chk_catalog_credits  check (credits is null or credits between 0 and 30);

create index if not exists idx_subject_catalog_lookup
    on public.subject_catalog (scheme, branch, semester);

-- ── status vocabularies ────────────────────────────────────────────────────
alter table public.faculty_onboarding
    drop constraint if exists chk_faculty_status,
    add  constraint chk_faculty_status
         check (status is null or status in ('pending','approved','rejected','suspended'));

alter table public.scraper_jobs
    drop constraint if exists chk_scraper_status,
    add  constraint chk_scraper_status
         check (status is null or status in ('queued','running','completed','failed','cancelled'));

alter table public.support_tickets
    drop constraint if exists chk_ticket_status,
    add  constraint chk_ticket_status
         check (status in ('open','in_progress','resolved','closed')),
    drop constraint if exists chk_ticket_user_type,
    add  constraint chk_ticket_user_type
         check (user_type in ('student','faculty','admin'));

-- ── faculty_activity: the missing foreign key ──────────────────────────────
alter table public.faculty_activity
    drop constraint if exists faculty_activity_faculty_id_fkey,
    add  constraint faculty_activity_faculty_id_fkey
         foreign key (faculty_id) references public.faculty_onboarding(id)
         on update cascade on delete set null;

create index if not exists idx_faculty_activity_faculty on public.faculty_activity (faculty_id);
create index if not exists idx_faculty_activity_created on public.faculty_activity (created_at desc);

-- ── updated_at, maintained by the database ─────────────────────────────────
create or replace function public.trg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_students_touch on public.students;
create trigger trg_students_touch before update on public.students
    for each row execute function public.trg_touch_updated_at();

drop trigger if exists trg_support_tickets_touch on public.support_tickets;
create trigger trg_support_tickets_touch before update on public.support_tickets
    for each row execute function public.trg_touch_updated_at();

drop trigger if exists trg_academic_remarks_touch on public.academic_remarks;
create trigger trg_academic_remarks_touch before update on public.academic_remarks
    for each row execute function public.trg_touch_updated_at();

drop trigger if exists trg_system_settings_touch on public.system_settings;
create trigger trg_system_settings_touch before update on public.system_settings
    for each row execute function public.trg_touch_updated_at();

commit;
