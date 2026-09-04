-- ============================================================================
-- 20260904000000_branch_dimension.sql
-- Canonical branch dimension.
--
-- Problem this solves:
--   students.branch holds 11 distinct strings for 8 real branches
--     ("CS" and "Computer Science (CSE)"; "CI" and "AI & Machine Learning (AIML)";
--      "CD" and "Data Science"), while classes.branch holds short codes
--     ("CS", "AIML", "DS") and subject_catalog.branch holds a third set.
--   Every join between them is currently reconciled in JS at read time by
--   lib/vtuAcademicEngine.js normalizeBranch() — which once misfiled all 6 EEE
--   students as ECE because "Electrical & Electronics (EEE)" contains the
--   substring "ELECTRONICS".
--
-- Approach:
--   Nothing is dropped or rewritten. The existing free-text branch columns stay
--   exactly as they are. This migration adds a canonical branch_code alongside
--   them and teaches the DATABASE the same rules normalizeBranch() applies, so
--   both sides agree by construction instead of by convention.
-- ============================================================================

begin;

-- ── 1. Extend the branches lookup into a real dimension ────────────────────
alter table public.branches
    add column if not exists usn_codes  text[]  not null default '{}',
    add column if not exists aliases    text[]  not null default '{}',
    add column if not exists sort_order integer not null default 0,
    add column if not exists is_active  boolean not null default true;

-- Alias sets mirror lib/vtuAcademicEngine.js normalizeBranch() exactly.
update public.branches set usn_codes = array['CS'],       aliases = array['CS','CSE','COMPUTER SCIENCE'],        sort_order = 10 where code = 'CS';
update public.branches set usn_codes = array['CI','AI'],  aliases = array['AI','AIML','CI','ARTIFICIAL INTELLIGENCE'], sort_order = 20 where code = 'AI';
update public.branches set usn_codes = array['CD','DS'],  aliases = array['DS','CD','DATA SCIENCE','CSE(DS)'],   sort_order = 30 where code = 'DS';
update public.branches set usn_codes = array['EC'],       aliases = array['EC','ECE','ELECTRONICS'],             sort_order = 40 where code = 'EC';
update public.branches set usn_codes = array['EE'],       aliases = array['EE','EEE','ELECTRICAL'],              sort_order = 50 where code = 'EE';
update public.branches set usn_codes = array['ME'],       aliases = array['ME','MECH','MECHANICAL'],             sort_order = 60 where code = 'ME';
update public.branches set usn_codes = array['CV'],       aliases = array['CV','CIVIL'],                         sort_order = 70 where code = 'CV';
update public.branches set usn_codes = array['RI'],       aliases = array['RI','ROBOTICS'],                      sort_order = 80 where code = 'RI';

-- subject_catalog carries two further codes (BA, MC) on the 2024/2026 schemes
-- that have no branches row and no students yet. Added inactive so they do not
-- appear in pickers until someone confirms the labels.
insert into public.branches (code, label, usn_codes, aliases, sort_order, is_active)
values
    ('BA', 'Master of Business Administration (confirm label)', array['BA'], array['BA','MBA'], 90,  false),
    ('MC', 'Master of Computer Applications (confirm label)',   array['MC'], array['MC','MCA'], 100, false)
on conflict (code) do nothing;

-- ── 2. The normalization rule, as a database function ──────────────────────
-- SQL twin of normalizeBranch(branchInput, usn). Order matters: EE is tested
-- before EC because the EEE label contains the substring "ELECTRONICS".
create or replace function public.fn_normalize_branch(p_branch text, p_usn text default '')
returns text
language plpgsql
stable          -- reads public.branches, so stable rather than immutable
as $$
declare
    b        text := upper(btrim(coalesce(p_branch, '')));
    u_code   text;
    v_code   text;
begin
    if b <> '' then
        select code into v_code
        from public.branches
        where b = any(aliases)
        limit 1;
        if v_code is not null then
            return v_code;
        end if;

        -- Substring fallbacks, in the same order as the JS engine.
        if b like '%COMPUTER SCIENCE%' then return 'CS'; end if;
        if b like '%ELECTRICAL%'       then return 'EE'; end if;
        if b like '%ELECTRONICS%'      then return 'EC'; end if;
        if b like '%ARTIFICIAL INTELLIGENCE%' then return 'AI'; end if;
        if b like '%DATA SCIENCE%'     then return 'DS'; end if;
        if b like '%MECHANICAL%'       then return 'ME'; end if;
        if b like '%CIVIL%'            then return 'CV'; end if;
        if b like '%ROBOTICS%'         then return 'RI'; end if;
    end if;

    -- Fallback: the USN is authoritative (2AB23CD001 -> CD -> DS).
    if p_usn is not null and length(p_usn) >= 7 then
        u_code := upper(substring(btrim(p_usn) from 6 for 2));
        select code into v_code
        from public.branches
        where u_code = any(usn_codes)
        limit 1;
        if v_code is not null then
            return v_code;
        end if;
    end if;

    return null;   -- unknown: surfaced rather than silently defaulted to 'CS'
end;
$$;

comment on function public.fn_normalize_branch(text, text) is
    'Canonical branch resolution. Mirrors lib/vtuAcademicEngine.js normalizeBranch(). Returns NULL when unresolvable so bad data surfaces instead of defaulting to CS.';

-- ── 2b. Admission year, also carried in the USN ────────────────────────────
-- students.year holds the ADMISSION year (2023, 2024) — not the year of study.
-- 409 of 559 rows are null, and every one of them can be recovered from USN
-- characters 4-5 (2AB23CS004 -> 23 -> 2023), the same place branch comes from.
create or replace function public.fn_admission_year_from_usn(p_usn text)
returns integer
language plpgsql
immutable
as $$
declare
    yy text;
begin
    if p_usn is null or length(btrim(p_usn)) < 7 then
        return null;
    end if;
    yy := substring(btrim(p_usn) from 4 for 2);
    if yy ~ '^\d{2}$' then
        return 2000 + yy::integer;
    end if;
    return null;
end;
$$;

comment on function public.fn_admission_year_from_usn(text) is
    'Extracts the admission year from USN characters 4-5. 2AB23CS004 -> 2023.';

-- ── 3. Canonical code on students and classes ──────────────────────────────
alter table public.students
    add column if not exists branch_code text;

alter table public.classes
    add column if not exists branch_code text;

-- Backfill. The USN wins over the free-text label wherever both are present.
update public.students
set branch_code = coalesce(
        public.fn_normalize_branch(null, usn),
        public.fn_normalize_branch(branch, usn)
    )
where branch_code is null;

update public.classes
set branch_code = public.fn_normalize_branch(branch, null)
where branch_code is null;

-- Recover the 409 missing admission years from the USN.
update public.students
set year = public.fn_admission_year_from_usn(usn)
where year is null
  and public.fn_admission_year_from_usn(usn) is not null;

alter table public.students
    drop constraint if exists students_branch_code_fkey,
    add  constraint students_branch_code_fkey
         foreign key (branch_code) references public.branches(code)
         on update cascade on delete restrict;

alter table public.classes
    drop constraint if exists classes_branch_code_fkey,
    add  constraint classes_branch_code_fkey
         foreign key (branch_code) references public.branches(code)
         on update cascade on delete restrict;

create index if not exists idx_students_branch_code on public.students (branch_code);
create index if not exists idx_classes_branch_code  on public.classes  (branch_code);

-- ── 4. Keep it canonical going forward ─────────────────────────────────────
create or replace function public.trg_set_branch_code()
returns trigger
language plpgsql
as $$
begin
    if tg_table_name = 'students' then
        new.branch_code := coalesce(
            public.fn_normalize_branch(null, new.usn),
            public.fn_normalize_branch(new.branch, new.usn),
            new.branch_code
        );
        new.year := coalesce(new.year, public.fn_admission_year_from_usn(new.usn));
    else
        new.branch_code := coalesce(
            public.fn_normalize_branch(new.branch, null),
            new.branch_code
        );
    end if;
    return new;
end;
$$;

drop trigger if exists trg_students_branch_code on public.students;
create trigger trg_students_branch_code
    before insert or update of branch, usn on public.students
    for each row execute function public.trg_set_branch_code();

drop trigger if exists trg_classes_branch_code on public.classes;
create trigger trg_classes_branch_code
    before insert or update of branch on public.classes
    for each row execute function public.trg_set_branch_code();

commit;
