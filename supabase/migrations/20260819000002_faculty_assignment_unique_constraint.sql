-- Prevent duplicate faculty-subject assignments (same faculty teaching the
-- same subject for the same branch/semester/scheme/class more than once).
-- No unique constraint existed on faculty_subject_assignments before this;
-- nullable scoping columns are coalesced to sentinels so two rows that both
-- leave e.g. class_id blank are still treated as the same assignment.
-- Paired with an application-level pre-check in
-- app/api/admin/faculty-assignments/route.js (defense in depth).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fsa_unique_assignment
  ON faculty_subject_assignments (
    faculty_id,
    subject_code,
    COALESCE(branch, ''),
    COALESCE(semester, -1),
    COALESCE(scheme, ''),
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
