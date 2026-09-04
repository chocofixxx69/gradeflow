-- ============================================================================
-- 20260904000200_class_roster_api.sql
-- The per-class "subtable", done the way that scales.
--
-- What was asked for:
--   "if I create a new class and add students it should create a specific
--    subtable in a smart way"
--
-- Why this is a view and a function, not a physical table per class:
--   A real table per class (class_cse_a_2025, class_cse_b_2025, ...) means a
--   DDL statement every time a class is created, no way to query across
--   classes ("show me every backlog student in 7th sem"), a migration that has
--   to touch N tables whenever a column is added, and RLS policies that must
--   be recreated per table. At 3 classes it looks tidy; at 60 it is unworkable.
--   class_roster below gives the exact same experience — `where class_id = ...`
--   returns one clean, complete, self-contained table for that class — while
--   staying one storage structure underneath.
--
-- Note on SGPA/CGPA:
--   These are deliberately NOT recomputed here. lib/vtuAcademicEngine.js is the
--   authority (catalog credit resolution, elective families, audit-course
--   exclusion, attempt dedup). Reimplementing that in SQL would create a second
--   source of truth that drifts. The view surfaces the already-computed
--   academic_remarks rollup plus structural counts it can own outright.
-- ============================================================================

begin;

-- ── 1. class_roster — the per-class table ──────────────────────────────────
drop view if exists public.class_roster;
create view public.class_roster
with (security_invoker = true) as
select
    cs.class_id,
    c.name                            as class_name,
    c.section,
    c.batch,
    c.academic_year,
    c.semester                        as class_semester,
    c.branch_code                     as class_branch,
    c.scheme                          as class_scheme,

    cs.id                             as membership_id,
    cs.added_at,
    cs.added_by,

    s.id                              as student_id,
    s.usn,
    s.name                            as student_name,
    s.branch_code                     as student_branch,
    b.label                           as student_branch_label,
    s.semester                        as student_semester,
    s.scheme                          as student_scheme,
    s.email,
    s.phone,
    s.lateral_entry,
    s.is_suspended,
    s.activated_at is not null        as is_activated,

    -- Alignment, computed rather than trusted.
    cs.semester_mismatch,
    (s.branch_code is distinct from c.branch_code) as branch_mismatch,
    (btrim(s.scheme) is distinct from btrim(c.scheme)) as scheme_mismatch,

    -- Authoritative academic rollup for the class's semester, from the engine.
    ar.sgpa                           as sgpa_current_sem,
    ar.backlog_count,
    ar.is_all_clear,
    ar.updated_at                     as academics_updated_at,

    -- Structural counts this view can own without duplicating engine logic.
    (select count(*) from public.results r where upper(btrim(r.usn)) = upper(btrim(s.usn)))       as result_count,
    (select count(*) from public.subject_marks sm where upper(btrim(sm.usn)) = upper(btrim(s.usn))) as subject_mark_count,
    (select max(r.semester) from public.results r where upper(btrim(r.usn)) = upper(btrim(s.usn))) as latest_result_semester
from public.class_students cs
join public.classes  c on c.id = cs.class_id
join public.students s on s.id = cs.student_id
left join public.branches b on b.code = s.branch_code
left join public.academic_remarks ar
       on ar.student_id = s.id
      and ar.semester   = c.semester;

comment on view public.class_roster is
    'One row per class membership, joined to the student profile, alignment flags and the academic_remarks rollup. Query with `where class_id = $1` for a single class''s roster.';

-- ── 2. class_overview — one row per class ──────────────────────────────────
drop view if exists public.class_overview;
create view public.class_overview
with (security_invoker = true) as
select
    c.id                    as class_id,
    c.name                  as class_name,
    c.branch_code,
    b.label                 as branch_label,
    c.semester,
    c.section,
    c.batch,
    c.scheme,
    c.academic_year,
    c.faculty_id,
    f.full_name             as faculty_name,
    c.created_at,

    count(cs.id)                                        as student_count,
    count(cs.id) filter (where cs.semester_mismatch)    as semester_mismatch_count,
    count(cs.id) filter (where s.is_suspended)          as suspended_count,
    count(cs.id) filter (where s.activated_at is null)  as not_activated_count,
    count(cs.id) filter (where s.lateral_entry)         as lateral_entry_count,

    round(avg(ar.sgpa) filter (where ar.sgpa is not null), 2) as avg_sgpa,
    count(ar.id) filter (where ar.is_all_clear)              as all_clear_count,
    coalesce(sum(ar.backlog_count), 0)                       as total_backlogs
from public.classes c
left join public.branches b  on b.code = c.branch_code
left join public.faculty_onboarding f on f.id = c.faculty_id
left join public.class_students cs on cs.class_id = c.id
left join public.students s on s.id = cs.student_id
left join public.academic_remarks ar
       on ar.student_id = s.id
      and ar.semester   = c.semester
group by c.id, c.name, c.branch_code, b.label, c.semester, c.section, c.batch,
         c.scheme, c.academic_year, c.faculty_id, f.full_name, c.created_at;

comment on view public.class_overview is
    'One row per class: headcount, alignment warnings and aggregate academics. Backs the class list screen without an N+1 query per class.';

-- ── 3. add_students_to_class ───────────────────────────────────────────────
-- Returns a row per USN instead of failing the whole batch, so the UI can show
-- exactly which students were added and precisely why any were not.
create or replace function public.add_students_to_class(
    p_class_id uuid,
    p_usns     text[],
    p_added_by text default null
)
returns table (usn text, status text, message text)
language plpgsql
as $$
declare
    v_usn text;
begin
    if not exists (select 1 from public.classes where id = p_class_id) then
        raise exception 'Unknown class: %', p_class_id using errcode = 'foreign_key_violation';
    end if;

    foreach v_usn in array coalesce(p_usns, '{}')
    loop
        v_usn := upper(btrim(v_usn));
        begin
            insert into public.class_students (class_id, usn, added_by)
            values (p_class_id, v_usn, p_added_by);

            usn := v_usn; status := 'added'; message := null;
            return next;

        exception
            when unique_violation then
                usn := v_usn; status := 'skipped';
                message := 'Already in this class.';
                return next;
            when others then
                usn := v_usn; status := 'rejected';
                message := sqlerrm;      -- the trigger's readable mismatch text
                return next;
        end;
    end loop;
end;
$$;

comment on function public.add_students_to_class(uuid, text[], text) is
    'Adds students to a class by USN. Returns one row per USN with status added | skipped | rejected, so a partial batch never fails as a whole.';

-- ── 4. remove_students_from_class ──────────────────────────────────────────
create or replace function public.remove_students_from_class(
    p_class_id uuid,
    p_usns     text[]
)
returns table (usn text, status text, message text)
language plpgsql
as $$
declare
    v_usn     text;
    v_deleted integer;
begin
    foreach v_usn in array coalesce(p_usns, '{}')
    loop
        v_usn := upper(btrim(v_usn));

        delete from public.class_students cs
        where cs.class_id = p_class_id
          and upper(btrim(cs.usn)) = v_usn;

        get diagnostics v_deleted = row_count;

        usn := v_usn;
        if v_deleted > 0 then
            status := 'removed'; message := null;
        else
            status := 'skipped'; message := 'Not a member of this class.';
        end if;
        return next;
    end loop;
end;
$$;

comment on function public.remove_students_from_class(uuid, text[]) is
    'Removes students from a class by USN. Returns one row per USN with status removed | skipped.';

-- ── 5. transfer_students_to_class ──────────────────────────────────────────
-- Moves in one transaction: the target insert is validated first, so a student
-- is never dropped from their old class only to be rejected by the new one.
create or replace function public.transfer_students_to_class(
    p_from_class_id uuid,
    p_to_class_id   uuid,
    p_usns          text[],
    p_moved_by      text default null
)
returns table (usn text, status text, message text)
language plpgsql
as $$
declare
    v_usn text;
begin
    foreach v_usn in array coalesce(p_usns, '{}')
    loop
        v_usn := upper(btrim(v_usn));
        begin
            if not exists (
                select 1 from public.class_students cs
                where cs.class_id = p_from_class_id
                  and upper(btrim(cs.usn)) = v_usn
            ) then
                usn := v_usn; status := 'skipped';
                message := 'Not a member of the source class.';
                return next;
                continue;
            end if;

            insert into public.class_students (class_id, usn, added_by)
            values (p_to_class_id, v_usn, p_moved_by);

            delete from public.class_students cs
            where cs.class_id = p_from_class_id
              and upper(btrim(cs.usn)) = v_usn;

            usn := v_usn; status := 'moved'; message := null;
            return next;

        exception
            when unique_violation then
                delete from public.class_students cs
                where cs.class_id = p_from_class_id
                  and upper(btrim(cs.usn)) = v_usn;
                usn := v_usn; status := 'moved';
                message := 'Already in the target class; removed from the source.';
                return next;
            when others then
                usn := v_usn; status := 'rejected';
                message := sqlerrm;
                return next;
        end;
    end loop;
end;
$$;

comment on function public.transfer_students_to_class(uuid, uuid, text[], text) is
    'Moves students between classes atomically per student — the target insert is validated before the source row is removed.';

-- ── 6. create_class_with_students ──────────────────────────────────────────
-- One call to create the class and populate its roster.
create or replace function public.create_class_with_students(
    p_name          text,
    p_branch        text,
    p_semester      integer,
    p_scheme        text,
    p_section       text default null,
    p_batch         text default null,
    p_academic_year text default null,
    p_faculty_id    uuid  default null,
    p_usns          text[] default '{}',
    p_created_by    text  default null
)
returns jsonb
language plpgsql
as $$
declare
    v_class_id uuid;
    v_results  jsonb;
begin
    insert into public.classes (name, branch, semester, scheme, section, batch, academic_year, faculty_id)
    values (p_name, p_branch, p_semester, p_scheme, p_section, p_batch, p_academic_year, p_faculty_id)
    returning id into v_class_id;

    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    into   v_results
    from   public.add_students_to_class(v_class_id, p_usns, p_created_by) r;

    return jsonb_build_object(
        'class_id', v_class_id,
        'class',    (select to_jsonb(co) from public.class_overview co where co.class_id = v_class_id),
        'roster',   v_results
    );
end;
$$;

comment on function public.create_class_with_students(text, text, integer, text, text, text, text, uuid, text[], text) is
    'Creates a class and populates its roster in one transaction. Returns the class overview plus a per-USN result list.';

commit;
