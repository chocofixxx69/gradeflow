---
description: How to manage the GradeFlow Institutional Platform
---

# GradeFlow Admin Guide

## Admin Login
1. Navigate to `/admin/login`
2. **Email:** `admin@gradeflow.in`
3. **Password:** `gradeflow_admin_2026`
4. Click "Authenticate" to access the admin panel

## Admin Panel Tabs

### Overview Tab
- View total students, pending faculty requests, active faculty count, and academic records
- See recent student registrations at a glance
- Click any student row to open their detailed profile drawer

### Students Tab
- Full searchable directory of all registered students
- **Add Student**: Click "Add Student" button to create a new USN profile
  - Enter USN, name, branch → creates the student in the database
  - When this student logs in later, they connect to this profile automatically
- Click any student to open their detail drawer showing:
  - Semester-wise marks with SGPA per semester
  - Uploaded documents

### Faculty Access Tab
- Review pending faculty onboarding requests
- **Approve**: Generates a unique access key (e.g., `GF-ABC123-...`)
- **Decline**: Rejects the request
- Copy access keys with one click to share with faculty members

### Settings Tab
- View system information
- Reload data manually if needed

## Key Workflows

### Auto-Create USN (Faculty side)
// turbo
1. Faculty logs into their dashboard at `/faculty/dashboard`
2. Faculty enters any USN in the search bar
3. If the USN doesn't exist, it is **automatically created** in the database
4. The student can later log in at `/auth/student` and activate their account with a password

### Student Activation Flow
1. Student goes to `/auth/student`
2. Clicks "First Time? Activate" tab
3. Enters their USN (pre-created by faculty/admin) and sets a password
4. Account is activated — student can now sign in

### PDF Transcript Download
1. Available on Student Dashboard (`/dashboard`) and Faculty Dashboard (`/faculty/dashboard`)
2. Click "Download PDF Transcript" button
3. Generates a branded GradeFlow PDF with all semester marks, SGPA, and CGPA

### Manual Marks Entry
1. Go to Academic Matrix (`/calculator`)
2. Select Branch, Scheme, Semester
3. Enter marks for each subject
4. Click "SYNC TO INSTITUTION" to save to database
5. SGPA is calculated automatically
