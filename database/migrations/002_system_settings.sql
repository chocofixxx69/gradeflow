-- Migration: 002_system_settings.sql
-- Description: Creates persistent system_settings table for institutional profile and admin access tokens

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

-- Insert default institutional profile and security token configurations
INSERT INTO system_settings (key, value)
VALUES 
  ('institutional_profile', '{"institution_name": "Anjuman Institute of Technology and Management", "institution_code": "AITM", "affiliation": "Visvesvaraya Technological University (VTU)", "environment": "GradeFlow Intelligence Suite", "primary_region": "South Asia (VTU-HQ)", "academic_year": "2024-2025", "default_scheme": "2022"}'::jsonb),
  ('security_auth', '{"system_access_token": "GF-ADMIN-PROD", "session_expiry_hours": 24, "require_gatekeeper": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow staff full access to system_settings" ON system_settings;
CREATE POLICY "Allow staff full access to system_settings" ON system_settings FOR ALL USING (true);
