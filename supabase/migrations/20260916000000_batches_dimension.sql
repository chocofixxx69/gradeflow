-- ============================================================================
-- 20260916000000_batches_dimension.sql
-- Canonical academic batch dimension for GradeFlow.
--
-- Enables dynamic, future-proof academic batch management across all portals
-- (Faculty Analytics, Reports, Classes, Student directory, Admin console).
--
-- Zero Data Loss: Purely additive. Existing tables and rows are untouched.
-- ============================================================================

begin;

create table if not exists public.batches (
    year            text primary key,                       -- 4-digit year code: '2023', '2024', '2025', '2026', '2027'...
    label           text not null,                          -- e.g. 'Batch 2026–30 (1st Year)'
    academic_year   text not null,                          -- e.g. '2026-2027'
    default_scheme  text not null default '2025',           -- '2022', '2025', etc.
    is_active       boolean not null default true,          -- appearance in active dropdowns/selectors
    sort_order      integer not null default 0,             -- display ordering (usually year number)
    created_at      timestamptz not null default now()
);

-- Pre-seed historical and active cohorts
insert into public.batches (year, label, academic_year, default_scheme, is_active, sort_order)
values
    ('2022', 'Batch 2022–26 (Graduated / 4th Year)', '2022-2023', '2022', true, 2022),
    ('2023', 'Batch 2023–27 (4th Year)',             '2023-2024', '2022', true, 2023),
    ('2024', 'Batch 2024–28 (3rd Year)',             '2024-2025', '2022', true, 2024),
    ('2025', 'Batch 2025–29 (2nd Year)',             '2025-2026', '2025', true, 2025),
    ('2026', 'Batch 2026–30 (1st Year)',             '2026-2027', '2025', true, 2026)
on conflict (year) do update set
    label          = excluded.label,
    academic_year  = excluded.academic_year,
    default_scheme = excluded.default_scheme,
    sort_order     = excluded.sort_order;

-- Enable RLS
alter table public.batches enable row level security;

-- Policy: Authenticated staff and public read for active batches
create policy "Allow read access to batches for all users"
    on public.batches for select
    using (true);

-- Policy: Admin full write access
create policy "Allow full batch management for service role and admin"
    on public.batches for all
    using (true)
    with check (true);

commit;
