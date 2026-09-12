-- Migration: 20260912000000_students_phone_and_default_email.sql
-- Description: Add phone column to students if not exists and backfill default institutional email (@anjuman.edu.in)

-- 1. Ensure phone column exists on students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone text;

-- 2. Backfill institutional email based on student USN
UPDATE students
SET email = LOWER(TRIM(usn)) || '@anjuman.edu.in'
WHERE email IS NULL OR TRIM(email) = '';

-- 3. Add column comment for clarity
COMMENT ON COLUMN students.phone IS 'Contact phone number for the student';
COMMENT ON COLUMN students.email IS 'Institutional email address formatted as <usn>@anjuman.edu.in';
