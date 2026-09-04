-- ============================================================================
-- 20260904000100_class_roster_integrity.sql
-- Class ↔ student membership that cannot mismatch.
--
-- Problem this solves:
--   class_students links a class to a student by a bare text `usn` with no
--   foreign key. Nothing stops a typo'd USN, a duplicate membership, or a
--   Civil student being added to an AIML class. The API layer compensates by
--   querying both raw and uppercased USNs "to guarantee we match regardless of
--   case stored in each table" (app/api/class-students/route.js).
--
-- Approach:
--   Keep `usn` (the frontend still writes it, nothing breaks) but add a real
--   student_id foreign key that the database resolves and validates itself.
--   Branch and scheme mismatches are rejected with a readable error the UI can
--   display. Semester differences are ALLOWED — a backlog student legitimately
--   sits in a senior class — but recorded as a flag so the UI can show them.
-- ============================================================================

begin;

-- ── 1. Structural columns ──────────────────────────────────────────────────
alter table public.class_students
    add column if not exists student_id        uuid,
    add column if not exists added_at          timestamptz not null default now(),
    add column if not exists added_by          text,
    add column if not exists semester_mismatch boolean     not null default false;

-- Backfill the surrogate key from the USN (case/whitespace tolerant).
update public.class_students cs
set    student_id = s.id
from   public.students s
where  cs.student_id is null
  and  upper(btrim(s.usn)) = upper(btrim(cs.usn));

-- Record which existing memberships sit outside their class's semester.
update public.class_students cs
set    semester_mismatch = true
from   public.students s, public.classes c
where  cs.student_id = s.id
  and  cs.class_id   = c.id
  and  s.semester is distinct from c.semester;

-- ── 2. Constraints ─────────────────────────────────────────────────────────
-- student_id is only made NOT NULL if every row backfilled cleanly; the
-- migration fails loudly here rather than silently leaving orphans behind.
do $$
declare
    v_orphans integer;
begin
    select count(*) into v_orphans from public.class_students where student_id is null;
    if v_orphans > 0 then
        raise exception 'Cannot enforce class_students.student_id: % row(s) have a USN with no matching student. Resolve these first.', v_orphans;
    end if;
end;
$$;

alter table public.class_students
    alter column student_id set not null;

alter table public.class_students
    drop constraint if exists class_students_student_id_fkey,
    add  constraint class_students_student_id_fkey
         foreign key (student_id) references public.students(id)
         on update cascade on delete cascade;

-- One membership per student per class, however the USN was cased.
create unique index if not exists uq_class_students_class_student
    on public.class_students (class_id, student_id);

create index if not exists idx_class_students_student_id
    on public.class_students (student_id);

-- class_id already FKs to classes; make the delete behaviour explicit so
-- deleting a class cleans up its roster instead of erroring.
alter table public.class_students
    drop constraint if exists class_students_class_id_fkey,
    add  constraint class_students_class_id_fkey
         foreign key (class_id) references public.classes(id)
         on update cascade on delete cascade;

-- ── 3. The validation trigger ──────────────────────────────────────────────
-- Resolves student_id from the USN when the caller supplies only a USN (which
-- is what the current frontend does), then enforces alignment.
create or replace function public.trg_validate_class_membership()
returns trigger
language plpgsql
as $$
declare
    v_student  public.students%rowtype;
    v_class    public.classes%rowtype;
begin
    -- Normalize the USN once, here, so every table agrees on its shape.
    new.usn := upper(btrim(new.usn));

    -- Resolve the student: prefer an explicit student_id, else the USN.
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

    -- Branch must match. Both sides are compared on the canonical code, so
    -- "AI & Machine Learning (AIML)" and "AIML" are correctly treated as equal.
    if v_class.branch_code is not null
       and v_student.branch_code is not null
       and v_class.branch_code <> v_student.branch_code then
        raise exception 'Branch mismatch: student % is %, but class "%" is %',
                        v_student.usn, v_student.branch_code, v_class.name, v_class.branch_code
            using errcode = 'check_violation',
                  hint    = 'Add this student to a class of their own branch, or correct the student''s branch on their profile.';
    end if;

    -- Scheme must match: a 2025-scheme student cannot sit a 2022-scheme class.
    if v_class.scheme is not null
       and v_student.scheme is not null
       and btrim(v_class.scheme) <> btrim(v_student.scheme) then
        raise exception 'Scheme mismatch: student % is on the % scheme, but class "%" is % scheme',
                        v_student.usn, v_student.scheme, v_class.name, v_class.scheme
            using errcode = 'check_violation',
                  hint    = 'Schemes determine the subject catalog used for credits and SGPA — they must match.';
    end if;

    -- Semester difference is legal (backlog students sit in senior classes),
    -- but it is recorded so the roster can surface it.
    new.semester_mismatch := (v_student.semester is distinct from v_class.semester);

    return new;
end;
$$;

drop trigger if exists trg_class_students_validate on public.class_students;
create trigger trg_class_students_validate
    before insert or update on public.class_students
    for each row execute function public.trg_validate_class_membership();

-- ── 4. Keep the flag honest when the student or class moves semester ───────
create or replace function public.trg_resync_semester_mismatch()
returns trigger
language plpgsql
as $$
begin
    if tg_table_name = 'students' then
        update public.class_students cs
        set    semester_mismatch = (new.semester is distinct from c.semester)
        from   public.classes c
        where  cs.class_id = c.id
          and  cs.student_id = new.id;
    else
        update public.class_students cs
        set    semester_mismatch = (s.semester is distinct from new.semester)
        from   public.students s
        where  cs.student_id = s.id
          and  cs.class_id = new.id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_students_resync_roster on public.students;
create trigger trg_students_resync_roster
    after update of semester on public.students
    for each row execute function public.trg_resync_semester_mismatch();

drop trigger if exists trg_classes_resync_roster on public.classes;
create trigger trg_classes_resync_roster
    after update of semester on public.classes
    for each row execute function public.trg_resync_semester_mismatch();

commit;
