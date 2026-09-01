-- Migration: 003_student_suspension.sql
-- Description: Adds account suspension and ban capability for students

ALTER TABLE students 
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
