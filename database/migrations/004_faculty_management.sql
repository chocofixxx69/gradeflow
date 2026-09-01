-- Migration: 004_faculty_management.sql
-- Description: Adds employee_id, designation, phone, and suspension tracking to faculty_onboarding

ALTER TABLE faculty_onboarding
ADD COLUMN IF NOT EXISTS employee_id TEXT,
ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT 'Assistant Professor',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
