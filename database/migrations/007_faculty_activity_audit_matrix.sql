-- 007_faculty_activity_audit_matrix.sql
-- Adds 5W1H (Who, What, Where, When, Why, How) governance audit fields to faculty_activity

ALTER TABLE faculty_activity 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ip_address text,
ADD COLUMN IF NOT EXISTS user_agent text,
ADD COLUMN IF NOT EXISTS context_module text,
ADD COLUMN IF NOT EXISTS reason text,
ADD COLUMN IF NOT EXISTS method text DEFAULT 'Web UI';

CREATE INDEX IF NOT EXISTS idx_faculty_activity_action ON faculty_activity(action_type);
CREATE INDEX IF NOT EXISTS idx_faculty_activity_module ON faculty_activity(context_module);
CREATE INDEX IF NOT EXISTS idx_faculty_activity_target ON faculty_activity(target_usn);

COMMENT ON COLUMN faculty_activity.context_module IS 'Where the action was executed (e.g. Faculty Portal > Student Analytics)';
COMMENT ON COLUMN faculty_activity.reason IS 'Why the action was performed (Pedagogical intent / institutional justification)';
COMMENT ON COLUMN faculty_activity.method IS 'How the action was performed (e.g. Web UI, Batch Export, VTU Engine, REST API)';
COMMENT ON COLUMN faculty_activity.metadata IS 'Structured contextual payload (query parameters, modified entities, filter states)';
