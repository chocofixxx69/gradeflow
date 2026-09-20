-- 20260920000000_student_transfer_integrity.sql
-- Enables seamless cross-branch and cross-section MOVE transfers, honoring
-- branch_code overrides, without throwing check_violation exceptions.
--
-- trg_validate_class_membership stays strict (branch/scheme mismatches are
-- still rejected for every ordinary insert — importing a roster, adding one
-- student, a cross-branch "copy" that must not touch the student's identity).
-- transfer_class_students() below is the one sanctioned path that may realign
-- a student's branch/scheme, and it does so in the same transaction as the
-- class_students insert it performs, so a rejected insert (or anything else
-- that fails) rolls the realignment back too — there is no window where a
-- student's profile is changed without a corresponding successful transfer.

-- 1. Allow explicit branch_code override on students table
create or replace function public.trg_set_branch_code()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
    if tg_table_name = 'students' then
        -- Prefer explicit branch_code if provided or updated, else normalize from USN / branch
        new.branch_code := coalesce(
            new.branch_code,
            public.fn_normalize_branch(null, new.usn),
            public.fn_normalize_branch(new.branch, new.usn)
        );
        new.year := coalesce(new.year, public.fn_admission_year_from_usn(new.usn));
    else
        new.branch_code := coalesce(
            new.branch_code,
            public.fn_normalize_branch(new.branch, null)
        );
    end if;
    return new;
end;
$$;

-- 2. class_students membership validation stays strict — unchanged from
--    20260904000100_class_roster_integrity.sql. Branch/scheme mismatches are
--    rejected here; only transfer_class_students() is allowed to realign a
--    student's profile ahead of an intentional move, in the same transaction.
create or replace function public.trg_validate_class_membership()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
    v_student  public.students%rowtype;
    v_class    public.classes%rowtype;
begin
    new.usn := upper(btrim(new.usn));

    if new.student_id is not null then
        select * into v_student from public.students where id = new.student_id;
    else
        select * into v_student from public.students where upper(btrim(usn)) = new.usn;
    end if;

    if v_student.id is null then
        raise exception 'Unknown student: no record with USN %', new.usn
            using errcode = 'foreign_key_violation',
                  hint    = 'Add the student to the students table before assigning them to a class.';
    end if;

    new.student_id := v_student.id;
    new.usn        := upper(btrim(v_student.usn));

    select * into v_class from public.classes where id = new.class_id;
    if v_class.id is null then
        raise exception 'Unknown class: %', new.class_id
            using errcode = 'foreign_key_violation';
    end if;

    if v_class.branch_code is not null
       and v_student.branch_code is not null
       and v_class.branch_code <> v_student.branch_code then
        raise exception 'Branch mismatch: student % is %, but class "%" is %',
                        v_student.usn, v_student.branch_code, v_class.name, v_class.branch_code
            using errcode = 'check_violation',
                  hint    = 'Transfer the student via transfer_class_students(), add them to a class of their own branch, or correct the student''s branch on their profile.';
    end if;

    if v_class.scheme is not null
       and v_student.scheme is not null
       and btrim(v_class.scheme) <> btrim(v_student.scheme) then
        raise exception 'Scheme mismatch: student % is on the % scheme, but class "%" is % scheme',
                        v_student.usn, v_student.scheme, v_class.name, v_class.scheme
            using errcode = 'check_violation',
                  hint    = 'Schemes determine the subject catalog used for credits and SGPA — they must match.';
    end if;

    new.semester_mismatch := (v_student.semester is distinct from v_class.semester);

    return new;
end;
$$;

-- 3. transfer_class_students — the one atomic, sanctioned path for a
--    cross-branch/cross-scheme MOVE. Realigns the moving students' profiles
--    to the destination class (only when p_mode = 'move'), inserts them into
--    the target class, and (for 'move') removes them from the source class —
--    all inside this single function call, so any failure (including the
--    strict trigger above rejecting something unexpected) rolls back every
--    part of it. Called from app/api/class-students/transfer/route.js.
create or replace function public.transfer_class_students(
    p_usns            text[],
    p_source_class_id uuid,
    p_target_class_id uuid,
    p_mode            text,
    p_added_by        text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
    v_target             public.classes%rowtype;
    v_target_branch_label text;
    v_inserted_count      integer := 0;
    v_removed_count       integer := 0;
begin
    select * into v_target from public.classes where id = p_target_class_id;
    if v_target.id is null then
        raise exception 'Destination class not found or invalid.'
            using errcode = 'foreign_key_violation';
    end if;

    v_target_branch_label := v_target.branch;
    if v_target.branch_code is not null then
        select coalesce(label, v_target.branch) into v_target_branch_label
        from public.branches where code = v_target.branch_code;
    end if;

    if p_mode = 'move' then
        update public.students s
        set branch_code = coalesce(v_target.branch_code, s.branch_code),
            branch       = case when v_target.branch_code is not null
                                then coalesce(v_target_branch_label, s.branch)
                                else s.branch end,
            scheme       = case when v_target.scheme is not null and btrim(v_target.scheme) <> ''
                                then btrim(v_target.scheme)
                                else s.scheme end
        where upper(btrim(s.usn)) = any(p_usns)
          and (
                (v_target.branch_code is not null and s.branch_code is distinct from v_target.branch_code)
             or (v_target.scheme is not null and btrim(v_target.scheme) <> ''
                 and btrim(coalesce(s.scheme, '')) is distinct from btrim(v_target.scheme))
          );
    end if;

    with ins as (
        insert into public.class_students (class_id, usn, student_id, added_by)
        select v_target.id, upper(btrim(s.usn)), s.id, p_added_by
        from public.students s
        where upper(btrim(s.usn)) = any(p_usns)
        on conflict (class_id, student_id) do nothing
        returning 1
    )
    select count(*) into v_inserted_count from ins;

    if p_mode = 'move' and p_source_class_id is not null then
        with del as (
            delete from public.class_students
            where class_id = p_source_class_id
              and usn = any(p_usns)
            returning 1
        )
        select count(*) into v_removed_count from del;
    end if;

    return jsonb_build_object(
        'added_to_target', v_inserted_count,
        'removed_from_source', v_removed_count,
        'target_branch_label', v_target_branch_label
    );
end;
$$;

revoke execute on function public.transfer_class_students(text[], uuid, uuid, text, text) from anon, authenticated;
