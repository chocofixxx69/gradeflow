-- ============================================================================
-- 20260904000500_function_search_path.sql
-- Pin search_path on every function added in this series.
--
-- A function with a role-mutable search_path resolves unqualified object names
-- against whatever schema list the caller happens to have set. These functions
-- all schema-qualify their references, so pinning the path costs nothing and
-- closes the Supabase linter's function_search_path_mutable warning.
-- ============================================================================

begin;

alter function public.fn_normalize_branch(text, text)            set search_path = public, pg_temp;
alter function public.fn_admission_year_from_usn(text)           set search_path = public, pg_temp;
alter function public.trg_set_branch_code()                      set search_path = public, pg_temp;
alter function public.trg_validate_class_membership()            set search_path = public, pg_temp;
alter function public.trg_resync_semester_mismatch()             set search_path = public, pg_temp;
alter function public.trg_touch_updated_at()                     set search_path = public, pg_temp;
alter function public.add_students_to_class(uuid, text[], text)  set search_path = public, pg_temp;
alter function public.remove_students_from_class(uuid, text[])   set search_path = public, pg_temp;
alter function public.transfer_students_to_class(uuid, uuid, text[], text) set search_path = public, pg_temp;
alter function public.create_class_with_students(text, text, integer, text, text, text, text, uuid, text[], text) set search_path = public, pg_temp;

commit;
