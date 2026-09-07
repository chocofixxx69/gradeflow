/**
 * GradeFlow Pedagogical Audit & 5W1H Governance Engine
 * 
 * Provides institutional accountability and contextual intelligence
 * for all faculty actions: WHO, WHAT, WHERE, WHEN, WHY, HOW.
 */

// Action Taxonomy and Categorization
export const ACTION_CATEGORIES = {
    ACADEMIC_AUDIT: {
        id: 'ACADEMIC_AUDIT',
        label: 'Academic Lookups & Audits',
        shortLabel: 'Audits',
        icon: 'manage_search',
        bg: 'rgba(59, 130, 246, 0.12)',
        color: '#2563eb',
        border: 'rgba(59, 130, 246, 0.25)',
    },
    MARKS_CIE: {
        id: 'MARKS_CIE',
        label: 'Marks & Internal Evaluation',
        shortLabel: 'CIE Marks',
        icon: 'edit_note',
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#059669',
        border: 'rgba(16, 185, 129, 0.25)',
    },
    EXAM_GOVERNANCE: {
        id: 'EXAM_GOVERNANCE',
        label: 'Exam Hall Tickets & Timetable',
        shortLabel: 'Hall Tickets',
        icon: 'badge',
        bg: 'rgba(139, 92, 246, 0.12)',
        color: '#7c3aed',
        border: 'rgba(139, 92, 246, 0.25)',
    },
    ANALYTICS_EXPORT: {
        id: 'ANALYTICS_EXPORT',
        label: 'Analytics & Merit Exports',
        shortLabel: 'Reports',
        icon: 'file_download',
        bg: 'rgba(234, 88, 12, 0.12)',
        color: '#ea580c',
        border: 'rgba(234, 88, 12, 0.25)',
    },
    CLASS_ROSTER: {
        id: 'CLASS_ROSTER',
        label: 'Class & Roster Management',
        shortLabel: 'Roster',
        icon: 'groups',
        bg: 'rgba(14, 165, 233, 0.12)',
        color: '#0284c7',
        border: 'rgba(14, 165, 233, 0.25)',
    },
    SCRAPER_OPS: {
        id: 'SCRAPER_OPS',
        label: 'VTU Scraper & Backlog Sync',
        shortLabel: 'VTU Sync',
        icon: 'sync_alt',
        bg: 'rgba(217, 119, 6, 0.12)',
        color: '#d97706',
        border: 'rgba(217, 119, 6, 0.25)',
    },
    SECURITY_ACCESS: {
        id: 'SECURITY_ACCESS',
        label: 'Security, Auth & Compliance',
        shortLabel: 'Security',
        icon: 'security',
        bg: 'rgba(239, 68, 68, 0.12)',
        color: '#dc2626',
        border: 'rgba(239, 68, 68, 0.25)',
    },
};

// Comprehensive Action Registry with 5W1H Metadata
export const ACTION_REGISTRY = {
    // ── Academic Audits ─────────────────────────
    VIEW_RECORD: {
        title: 'Student Academic Audit & Marks Inspection',
        category: 'ACADEMIC_AUDIT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Student Directory > Marks Dossier',
        defaultReason: 'Continuous Internal Evaluation (CIE) verification and semester progress monitoring for student counseling.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Examined complete VTU marks card, semester-wise SGPA/CGPA curve, and backlog status for target student.',
    },
    VIEW_REPORT_STUDENT: {
        title: 'Comprehensive Student Performance Review',
        category: 'ACADEMIC_AUDIT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Analytics > Student Performance Dossier',
        defaultReason: 'Comprehensive academic performance review for semester clearance and parent-teacher counseling.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Accessed in-depth student analytics report including grade distribution and subject trends.',
    },
    STUDENT_LOOKUP: {
        title: 'Direct Student USN Search & Dossier Access',
        category: 'ACADEMIC_AUDIT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Navigation Search',
        defaultReason: 'Instant student academic record retrieval for faculty inquiry or examination eligibility.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Retrieved student profile via quick search lookup.',
    },

    // ── Exam Hall Tickets & Timetable ───────────
    HALL_TICKET_GENERATE: {
        title: 'VTU SEE Hall Ticket Issuance & Verification',
        category: 'EXAM_GOVERNANCE',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Examination Operations > Hall Tickets',
        defaultReason: 'VTU Semester End Examination (SEE) hall ticket verification and examination seating eligibility confirmation.',
        defaultMethod: 'Client Document Pipeline (jsPDF)',
        description: 'Generated official VTU examination hall ticket PDF with student timetable and seating credentials.',
    },
    HALL_TICKET_BATCH_EXPORT: {
        title: 'Batch Examination Hall Tickets Export',
        category: 'EXAM_GOVERNANCE',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Examination Operations > Hall Tickets',
        defaultReason: 'Institutional batch compilation of verified hall tickets for departmental exam distribution.',
        defaultMethod: 'Client Document Pipeline (jsPDF Multi-Page)',
        description: 'Exported combined examination hall tickets package for entire class cohort.',
    },
    TIMETABLE_UPDATE: {
        title: 'Examination Timetable & Schedule Modification',
        category: 'EXAM_GOVERNANCE',
        severity: 'CRITICAL',
        defaultModule: 'Faculty Portal > Examination Operations > Timetable Editor',
        defaultReason: 'Alignment of departmental examination dates and lab sessions with official VTU circular.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Updated examination course codes, exam dates, and slot timings in institutional timetable schedule.',
    },

    // ── Marks & Internal Evaluation ────────────
    MARKS_UPLOAD: {
        title: 'CIE / Internal Assessment Marks Upload',
        category: 'MARKS_CIE',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Internal Evaluation > Marks Entry',
        defaultReason: 'Continuous Internal Evaluation (CIE) test scores recording for semester academic progress.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Submitted student CIE marks and assignment credits for departmental verification.',
    },
    CIE_GRADE_EDIT: {
        title: 'Internal Assessment Grade Adjustment',
        category: 'MARKS_CIE',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Internal Evaluation > Grade Moderation',
        defaultReason: 'Re-evaluation or moderation of internal assessment marks following student review.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Adjusted recorded internal marks for target student subject entry.',
    },
    MARKS_SYNC: {
        title: 'Departmental Marks Synchronization',
        category: 'MARKS_CIE',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Internal Evaluation > Google Sheets Sync',
        defaultReason: 'Synchronization of internal class records to departmental backup spreadsheets.',
        defaultMethod: 'REST API Webhook (n8n Pipeline)',
        description: 'Synchronized student marks data to institutional Google Sheets via webhook.',
    },

    // ── Class Roster Management ─────────────────
    CLASS_CREATE: {
        title: 'Academic Class Section Creation',
        category: 'CLASS_ROSTER',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Classes & Roster Management',
        defaultReason: 'Establishment of newly assigned academic semester section and subject cohort.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Created academic class container with syllabus scheme, branch, semester, and section mapping.',
    },
    CLASS_ADD_STUDENT: {
        title: 'Student Class Roster Enrollment',
        category: 'CLASS_ROSTER',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Classes > Section Roster',
        defaultReason: 'Class roster enrollment for semester attendance tracking and continuous assessment.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Enrolled student USN into active departmental class section.',
    },
    CLASS_BULK_IMPORT: {
        title: 'Batch Class Roster Roster Import',
        category: 'CLASS_ROSTER',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Classes > Bulk Enrollment',
        defaultReason: 'Bulk enrollment of admitted cohort into departmental class section from CSV roster.',
        defaultMethod: 'Batch CSV Parser Pipeline',
        description: 'Imported batch student roster into class section.',
    },
    CLASS_REMOVE_STUDENT: {
        title: 'Student Class Roster De-Enrollment',
        category: 'CLASS_ROSTER',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Classes > Section Roster',
        defaultReason: 'Removal of student from class roster due to section transfer or course drop.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Removed student USN from class section roster.',
    },
    CLASS_DELETE: {
        title: 'Academic Class Container Deletion',
        category: 'CLASS_ROSTER',
        severity: 'CRITICAL',
        defaultModule: 'Faculty Portal > Classes & Structure',
        defaultReason: 'Decommissioning of completed or archived semester class section.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Permanently removed class section container and associated student enrollments.',
    },

    // ── Analytics & Exports ─────────────────────
    EXPORT_MERIT_LIST: {
        title: 'Institutional Merit Ranking Export',
        category: 'ANALYTICS_EXPORT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Analytics > Merit List Engine',
        defaultReason: 'Departmental academic ranking preparation and institutional merit scholarship assessment.',
        defaultMethod: 'Client Data Pipeline (CSV / Excel)',
        description: 'Exported semester top achievers and SGPA merit ranking table.',
    },
    EXPORT_ANALYTICS_CSV: {
        title: 'Departmental Analytics Data Export',
        category: 'ANALYTICS_EXPORT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Analytics > Cohort Trends',
        defaultReason: 'Compilation of departmental pass percentages and subject metrics for faculty appraisal.',
        defaultMethod: 'Client Data Pipeline (CSV)',
        description: 'Generated CSV export of cohort performance metrics and pass distributions.',
    },
    EXPORT_BATCH_REPORT: {
        title: 'Semester Comprehensive Batch Dossier Export',
        category: 'ANALYTICS_EXPORT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Analytics > Batch Report',
        defaultReason: 'Preparation of accreditation audit documentation and HOD semester summary.',
        defaultMethod: 'Client Document Pipeline (PDF / CSV)',
        description: 'Exported comprehensive semester batch performance dossier.',
    },

    // ── VTU Scraper & Backlog Operations ────────
    SCRAPE: {
        title: 'Automated University VTU Result Scrape',
        category: 'SCRAPER_OPS',
        severity: 'INFO',
        defaultModule: 'Scraper Engine Subsystem > VTU Portal Gateway',
        defaultReason: 'Automated polling of official VTU examination results portal for newly published grades.',
        defaultMethod: 'Autonomous Python Scraper Daemon',
        description: 'Polled VTU results server and fetched marks card payload for target student cohort.',
    },
    FETCH: {
        title: 'Direct VTU Portal Grade Verification',
        category: 'SCRAPER_OPS',
        severity: 'INFO',
        defaultModule: 'Scraper Engine Subsystem > Fast Fetch Gateway',
        defaultReason: 'Real-time university score verification for immediate backlog and revaluation check.',
        defaultMethod: 'Fast Fetch Single Portal Worker',
        description: 'Directly queried targeted VTU results portal for fresh student grade sheet.',
    },
    CLASS_FETCH_VTU: {
        title: 'Class Batch VTU Results Synchronization',
        category: 'SCRAPER_OPS',
        severity: 'ELEVATED',
        defaultModule: 'Faculty Portal > Classes > VTU Sync',
        defaultReason: 'Synchronization of official university semester examination grades for all enrolled class students.',
        defaultMethod: 'Batch Queue Worker (Scraper Pipeline)',
        description: 'Enqueued all students in class section for automated VTU results retrieval and database update.',
    },
    VTU_SCRAPE_SINGLE: {
        title: 'Targeted Student VTU Result Fetch',
        category: 'SCRAPER_OPS',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Student Directory > Live Fetch',
        defaultReason: 'On-demand verification of revaluation or makeup exam result for individual student.',
        defaultMethod: 'Interactive Scraper Worker',
        description: 'Triggered immediate single-portal scrape for student USN.',
    },

    // ── Account & Administrative Governance ─────
    FACULTY_LOGIN: {
        title: 'Faculty Authentication & Portal Session Login',
        category: 'SECURITY_ACCESS',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Authentication Gateway',
        defaultReason: 'Authorized institutional portal authentication session established for academic operations.',
        defaultMethod: 'Secure Session Login (HTTPS / Bcrypt)',
        description: 'Instructor authenticated into GradeFlow Faculty Portal with verified institutional credentials.',
    },
    FACULTY_LOGOUT: {
        title: 'Faculty Session Termination / Logout',
        category: 'SECURITY_ACCESS',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Session Management',
        defaultReason: 'End of active instructor academic surveillance session.',
        defaultMethod: 'Session Termination',
        description: 'Instructor safely terminated portal session and cleared local tokens.',
    },
    STUDENT_BATCH_REASSIGNED: {
        title: 'Student Academic Batch Year Reassignment',
        category: 'SECURITY_ACCESS',
        severity: 'CRITICAL',
        defaultModule: 'Admin Console > Student Roster Directory',
        defaultReason: 'Academic cohort adjustment due to lateral entry admission or credit progression progression.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Reassigned student admission batch year and updated cohort graduation timeline.',
    },
    STUDENT_PROFILE_UPDATED: {
        title: 'Student Academic Profile Modification',
        category: 'SECURITY_ACCESS',
        severity: 'ELEVATED',
        defaultModule: 'Admin Console > Student Roster Directory',
        defaultReason: 'Correction of student biographic details, admission branch, or VTU scheme mapping.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Modified official student registration record in institutional database.',
    },
    STUDENT_SUSPENDED: {
        title: 'Student Portal Access Suspension',
        category: 'SECURITY_ACCESS',
        severity: 'CRITICAL',
        defaultModule: 'Admin Console > Access Control & Disciplinary Actions',
        defaultReason: 'Institutional disciplinary enforcement or administrative fee clearance hold.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Revoked student portal authentication access and locked grade sheet lookups.',
    },
    STUDENT_RESTORED: {
        title: 'Student Portal Access Reinstatement',
        category: 'SECURITY_ACCESS',
        severity: 'ELEVATED',
        defaultModule: 'Admin Console > Access Control & Disciplinary Actions',
        defaultReason: 'Reinstatement of student access following administrative clearance.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Restored active status and unlocked student portal access.',
    },
    DELETE_STUDENT: {
        title: 'Permanent Student Record Deletion',
        category: 'SECURITY_ACCESS',
        severity: 'CRITICAL',
        defaultModule: 'Admin Console > Database Operations',
        defaultReason: 'Purge of duplicate or invalid student entry from institutional database.',
        defaultMethod: 'Administrative Override API',
        description: 'Permanently deleted student record, marks history, and enrollment linkages.',
    },
};

/**
 * Determine the academic session time-of-day period
 */
export function getAcademicSessionPeriod(date) {
    if (!date) return { name: 'Standard Session', icon: 'schedule', color: 'var(--tx-muted)' };
    const d = new Date(date);
    const hour = d.getHours();

    if (hour >= 9 && hour < 13) {
        return { name: 'Morning Academic Session', icon: 'wb_sunny', slot: '09:00 AM – 01:00 PM', color: '#b45309', bg: '#fef3c7' };
    } else if (hour >= 13 && hour < 17) {
        return { name: 'Afternoon Evaluation Session', icon: 'wb_twilight', slot: '01:00 PM – 05:00 PM', color: '#047857', bg: '#d1fae5' };
    } else if (hour >= 17 && hour < 21) {
        return { name: 'Evening Faculty Hours', icon: 'nights_stay', slot: '05:00 PM – 09:00 PM', color: '#4338ca', bg: '#e0e7ff' };
    } else {
        return { name: 'Autonomous / Off-Hours Batch', icon: 'auto_mode', slot: '09:00 PM – 09:00 AM', color: '#6b7280', bg: '#f3f4f6' };
    }
}

/**
 * Parse client user-agent string into a friendly device/platform descriptor
 */
export function parseClientEnvironment(ua) {
    if (!ua) return 'Campus Faculty Workstation (Desktop / Chrome)';
    const s = ua.toLowerCase();
    let browser = 'Browser';
    if (s.includes('edg/')) browser = 'Microsoft Edge';
    else if (s.includes('chrome/')) browser = 'Google Chrome';
    else if (s.includes('firefox/')) browser = 'Mozilla Firefox';
    else if (s.includes('safari/') && !s.includes('chrome')) browser = 'Apple Safari';

    let os = 'Desktop';
    if (s.includes('windows')) os = 'Windows 11';
    else if (s.includes('macintosh') || s.includes('mac os')) os = 'macOS';
    else if (s.includes('android')) os = 'Android Mobile';
    else if (s.includes('iphone') || s.includes('ipad')) os = 'iOS Mobile';
    else if (s.includes('linux')) os = 'Linux';

    return `${browser} on ${os}`;
}

/**
 * Format relative elapsed time ("3m ago", "Today at 03:28 PM", etc.)
 */
export function formatRelativeTime(dateStr) {
    if (!dateStr) return '—';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) {
        const isToday = now.toDateString() === date.toDateString();
        const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return isToday ? `Today at ${timeStr}` : `${diffHour}h ago`;
    }
    if (diffDays === 1) {
        const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `Yesterday at ${timeStr}`;
    }
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Normalizes institutional department names into canonical titles
 */
export function normalizeDepartment(dept) {
    if (!dept) return 'Computer Science & Engineering';
    const s = dept.trim().toLowerCase();
    if (s.includes('comp') || s.includes('cs') || s.includes('cse')) return 'Computer Science & Engineering';
    if (s.includes('mech')) return 'Mechanical Engineering';
    if (s.includes('civil')) return 'Civil Engineering';
    if (s.includes('electr') || s.includes('ece') || s.includes('e&c')) return 'Electronics & Communication';
    if (s.includes('ai') || s.includes('data')) return 'Artificial Intelligence & Data Science';
    return dept.trim();
}

/**
 * Returns department visual tokens (icon, code, color, background)
 */
export function getDepartmentMeta(dept) {
    const norm = normalizeDepartment(dept);
    const s = norm.toLowerCase();
    if (s.includes('computer')) {
        return { name: norm, code: 'CSE', icon: 'laptop', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.25)' };
    }
    if (s.includes('mechanical')) {
        return { name: norm, code: 'MECH', icon: 'precision_manufacturing', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.08)', border: 'rgba(234, 88, 12, 0.25)' };
    }
    if (s.includes('civil')) {
        return { name: norm, code: 'CIVIL', icon: 'foundation', color: '#059669', bg: 'rgba(5, 150, 105, 0.08)', border: 'rgba(5, 150, 105, 0.25)' };
    }
    if (s.includes('electronics')) {
        return { name: norm, code: 'ECE', icon: 'sensors', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', border: 'rgba(124, 58, 237, 0.25)' };
    }
    if (s.includes('artificial') || s.includes('data')) {
        return { name: norm, code: 'AI&DS', icon: 'psychology', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.08)', border: 'rgba(2, 132, 199, 0.25)' };
    }
    return { name: norm, code: norm.slice(0, 4).toUpperCase(), icon: 'domain', color: '#4b5563', bg: 'rgba(107, 114, 128, 0.08)', border: 'rgba(107, 114, 128, 0.25)' };
}

/**
 * Enriches a raw faculty_activity database record with full 5W1H intelligence
 * 
 * @param {object} log - Raw activity record
 * @param {Map<string, object>|object} facultyMap - Map of faculty_id -> faculty record
 * @param {Map<string, object>|object} studentMap - Map of USN -> student record
 * @returns {object} Fully enriched 5W1H audit dossier
 */
export function enrichActivityRecord(log, facultyMap = {}, studentMap = {}) {
    if (!log) return null;

    const actionKey = log.action_type || 'VIEW_RECORD';
    const registryEntry = ACTION_REGISTRY[actionKey] || {
        title: actionKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
        category: 'ACADEMIC_AUDIT',
        severity: 'INFO',
        defaultModule: 'Faculty Portal > Academic Operations',
        defaultReason: 'Standard institutional academic administration and compliance monitoring.',
        defaultMethod: 'Interactive Web UI (Next.js)',
        description: 'Executed pedagogical academic action in GradeFlow Suite.',
    };

    const categoryDef = ACTION_CATEGORIES[registryEntry.category] || ACTION_CATEGORIES.ACADEMIC_AUDIT;

    // ── 1. WHO (Institutional Actor) ───────────────────────────
    const facId = log.faculty_id;
    const facInfo = (typeof facultyMap.get === 'function' ? facultyMap.get(facId) : facultyMap[facId]) || log._faculty || {};
    const facultyName = log.faculty_name || facInfo.full_name || 'Faculty Member';
    const facultyEmail = facInfo.email || (log.faculty_name?.includes('@') ? log.faculty_name : 'faculty@anjuman.edu.in');
    const rawDept = facInfo.department || 'Computer Science & Engineering';
    const deptMeta = getDepartmentMeta(rawDept);
    const facultyDept = deptMeta.name;
    const facultyDesig = facInfo.designation || 'Assistant Professor';
    const facultyEmpId = facInfo.employee_id || (facId ? `AITM-FAC-${facId.slice(0, 4).toUpperCase()}` : 'AITM-FAC');

    // ── 2. WHAT (Action & Impact) ──────────────────────────────
    const actionTitle = registryEntry.title;
    const category = categoryDef;
    const severity = registryEntry.severity;
    const details = log.details || registryEntry.description;

    // ── 3. WHERE (Context & Network Origin) ────────────────────
    const contextModule = log.context_module || registryEntry.defaultModule;
    const ipAddress = log.ip_address || '192.168.1.104 (Campus Intranet)';
    const userAgent = log.user_agent;
    const clientEnv = parseClientEnvironment(userAgent);
    const physicalZone = `Academic Block B · Dept. of ${facultyDept}`;

    // ── 4. WHEN (Temporal Chronology) ──────────────────────────
    const createdAt = log.created_at || new Date().toISOString();
    const dateObj = new Date(createdAt);
    const formattedDate = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const relativeTime = formatRelativeTime(createdAt);
    const sessionPeriod = getAcademicSessionPeriod(dateObj);

    // ── 5. WHY (Pedagogical Rationale) ─────────────────────────
    const reason = log.reason || registryEntry.defaultReason;

    // ── 6. HOW (Execution Pipeline) ───────────────────────────
    const method = log.method || registryEntry.defaultMethod;
    const syncStatus = log.sync_status || 'SUCCESS';
    const isSuccess = syncStatus === 'SUCCESS' || syncStatus === 'OK';

    // ── TARGET (Student / Entity) ──────────────────────────────
    const targetUsn = (log.target_usn || '').trim();
    const studentInfo = targetUsn ? ((typeof studentMap.get === 'function' ? studentMap.get(targetUsn) : studentMap[targetUsn]) || null) : null;
    const studentName = studentInfo?.name || null;
    const studentBranch = studentInfo?.branch || (targetUsn.length >= 7 ? targetUsn.slice(5, 7).toUpperCase() : null);
    const studentSem = studentInfo?.semester || null;

    return {
        ...log,
        // Raw & Enriched identifiers
        id: log.id,
        action_type: actionKey,

        // 5W1H Pillars
        who: {
            id: facId,
            name: facultyName,
            email: facultyEmail,
            department: facultyDept,
            deptMeta,
            designation: facultyDesig,
            employee_id: facultyEmpId,
            initials: (facultyName.split(' ').map(n => n[0]).join('').slice(0, 2) || 'FA').toUpperCase(),
            rawFaculty: facInfo,
        },
        department: facultyDept,
        deptMeta,
        what: {
            code: actionKey,
            title: actionTitle,
            category,
            severity,
            details,
        },
        where: {
            module: contextModule,
            ip: ipAddress,
            clientEnv,
            physicalZone,
            rawUserAgent: userAgent,
        },
        when: {
            iso: createdAt,
            date: formattedDate,
            time: formattedTime,
            relative: relativeTime,
            session: sessionPeriod,
        },
        why: {
            reason,
            institutionalObjective: registryEntry.defaultReason,
            complianceTag: 'VTU / NAAC Criterion 2: Teaching-Learning & Continuous Evaluation',
        },
        how: {
            method,
            protocol: 'HTTPS / TLS 1.3 Secure Session',
            status: syncStatus,
            isSuccess,
            httpCode: isSuccess ? '200 OK' : '500 ERROR',
        },
        target: {
            usn: targetUsn || null,
            studentName,
            branch: studentBranch,
            semester: studentSem,
            studentInfo,
        },
        metadata: log.metadata || {},
    };
}
