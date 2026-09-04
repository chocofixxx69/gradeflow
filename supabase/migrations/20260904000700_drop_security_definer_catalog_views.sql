-- ============================================================================
-- 20260904000700_drop_security_definer_catalog_views.sql
-- Remove the 18 per-branch subject_catalog views.
--
-- Why these had to go rather than be converted:
--   Each was created SECURITY DEFINER, so it executed as its owner and ignored
--   RLS on subject_catalog. Each is also a trivial single-table filter, which
--   makes it AUTO-UPDATABLE (information_schema.views reported is_updatable and
--   is_insertable_into = YES). And anon held DELETE, INSERT, SELECT, TRUNCATE
--   and UPDATE on all of them.
--
--   Together that is a writable back door into subject_catalog that goes around
--   the lockdown in 20260904000600: anon could not write the table directly, but
--   could write it through any of these views. subject_catalog is the authority
--   for credits, so a write there corrupts every SGPA the engine computes.
--
--   They are also unused - grep across app/, lib/, components/, scripts/ and
--   backend/ returns no reference to any of them. subject_catalog serves the
--   same data directly:
--
--     select * from subject_catalog where branch = $1 and scheme = $2
--     order by semester, subject_code;
--
--   which is what subject_catalog_<branch>_<scheme> was defined as, verbatim.
--
-- Recovery, should one ever be wanted, is that query as a view WITH
-- (security_invoker = true) - never the default, which is definer.
-- ============================================================================

begin;

drop view if exists public.subject_catalog_cs_2022;
drop view if exists public.subject_catalog_cs_2025;
drop view if exists public.subject_catalog_ai_2022;
drop view if exists public.subject_catalog_ai_2025;
drop view if exists public.subject_catalog_ds_2022;
drop view if exists public.subject_catalog_ds_2025;
drop view if exists public.subject_catalog_ec_2022;
drop view if exists public.subject_catalog_ec_2025;
drop view if exists public.subject_catalog_ee_2022;
drop view if exists public.subject_catalog_ee_2025;
drop view if exists public.subject_catalog_me_2022;
drop view if exists public.subject_catalog_me_2025;
drop view if exists public.subject_catalog_cv_2022;
drop view if exists public.subject_catalog_cv_2025;
drop view if exists public.subject_catalog_ri_2022;
drop view if exists public.subject_catalog_ri_2025;
drop view if exists public.subject_catalog_2022;
drop view if exists public.subject_catalog_2025;

commit;
