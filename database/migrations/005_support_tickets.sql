-- database/migrations/005_support_tickets.sql
-- Support Ticket & Issue Reporting System for Students and Faculty

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE NOT NULL,
    user_type TEXT NOT NULL, -- 'student' | 'faculty'
    user_identifier TEXT NOT NULL, -- USN or Email
    user_name TEXT,
    user_email TEXT,
    issue_type TEXT NOT NULL, -- 'password_reset' | 'login_issue' | 'marks_dispute' | 'profile_correction' | 'other'
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved' | 'rejected'
    admin_notes TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_identifier);
