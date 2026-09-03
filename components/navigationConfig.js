export const NAV_CONFIG = {
  student: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'space_dashboard', group: 'Academic Home' },
    { key: 'leaderboard', label: 'Class Leaderboard', href: '/leaderboard', icon: 'emoji_events', group: 'Academic Tools' },
    { key: 'analytics', label: 'Analytics', href: '/analytics', icon: 'insights', group: 'Academic Tools' },
    { key: 'calculator', label: 'Calculator', href: '/calculator', icon: 'calculate', group: 'Academic Tools' },
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  faculty: [
    { key: 'dashboard', label: 'Dashboard', href: '/faculty/dashboard', icon: 'space_dashboard', group: 'Faculty Home' },
    { key: 'classes', label: 'Classes', href: '/faculty/classes', icon: 'groups', group: 'Class Operations' },
    { key: 'students', label: 'Students', href: '/faculty/students', icon: 'badge', group: 'Class Operations' },
    { key: 'subjects', label: 'Subjects', href: '/faculty/subjects', icon: 'library_books', group: 'Academic Management' },
    { key: 'reports', label: 'Reports', href: '/faculty/reports', icon: 'analytics', group: 'Reporting' },
    // Result Sheets: the official, exam-cycle-driven documents (one per
    // semester/session declaration) — what you generate right after results
    // are announced or revalued.
    { key: 'semesterAnalysis', label: 'Semester Analysis', href: '/faculty/analytics/semester-analysis', icon: 'table_chart', group: 'Result Sheets' },
    { key: 'batchReport', label: 'Batch Report', href: '/faculty/analytics/batch-report', icon: 'view_timeline', group: 'Result Sheets' },
    { key: 'revalImpact', label: 'Reval Impact Delta', href: '/faculty/analytics/reval-impact', icon: 'published_with_changes', group: 'Result Sheets' },
    // Rankings & Merit: who's on top, for recognition/notice-board purposes.
    { key: 'classLeaderboard', label: 'Class Leaderboard', href: '/faculty/analytics/leaderboard', icon: 'emoji_events', group: 'Rankings & Merit' },
    { key: 'meritList', label: 'Batch Merit List', href: '/faculty/analytics/merit-list', icon: 'military_tech', group: 'Rankings & Merit' },
    // Comparative Analysis: X vs Y views across cohorts/sections/subjects/years.
    { key: 'compare', label: 'Compare Students', href: '/faculty/analytics/compare', icon: 'compare_arrows', group: 'Comparative Analysis' },
    { key: 'sectionsCompare', label: 'Sections Comparison', href: '/faculty/analytics/sections-compare', icon: 'view_column', group: 'Comparative Analysis' },
    { key: 'cohortTrends', label: 'Cohort Trends', href: '/faculty/analytics/cohort-trends', icon: 'insights', group: 'Comparative Analysis' },
    { key: 'deptOverview', label: 'Department Overview', href: '/faculty/analytics/department', icon: 'domain', group: 'Comparative Analysis' },
    // Risk & Compliance: who needs attention, institutionally.
    { key: 'eligibility', label: 'Eligibility Register', href: '/faculty/analytics/eligibility', icon: 'fact_check', group: 'Risk & Compliance' },
    { key: 'backlogRegister', label: 'Standing Backlogs', href: '/faculty/analytics/backlogs', icon: 'warning', group: 'Risk & Compliance' },
    // Insights: subject- and faculty-level performance breakdowns.
    { key: 'subjectAnalytics', label: 'Subject Analytics', href: '/faculty/analytics/subject', icon: 'bar_chart', group: 'Insights' },
    { key: 'facultyPerformance', label: 'Teaching Performance', href: '/faculty/analytics/faculty-performance', icon: 'supervisor_account', group: 'Insights' },
    { key: 'batchUpload', label: 'Batch Upload', href: '/faculty/batch-upload', icon: 'upload_file', group: 'Class Operations' },
    { key: 'vtuUrls', label: 'VTU Result URLs', href: '/faculty/vtu-urls', icon: 'link', group: 'Academic Management' },
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  admin: [
    { key: 'classes', label: 'Classes', href: '/admin/classes', icon: 'groups', group: 'Institution' },
    { key: 'examSessions', label: 'Exam Sessions', href: '/admin/exam-sessions', icon: 'event', group: 'Institution' },
    { key: 'facultyAssignments', label: 'Faculty Assignments', href: '/admin/faculty-assignments', icon: 'assignment_ind', group: 'Institution' },
    { key: 'analytics', label: 'Analytics', href: '/admin/analytics', icon: 'analytics', group: 'Institution' },
    { key: 'auditLog', label: 'Audit Log', href: '/admin/audit-log', icon: 'history', group: 'Governance' },
  ],
};

export const PUBLIC_ROUTES = [
  '/',
  '/landing',
  '/auth',
  '/auth/student',
  '/faculty/login',
  '/faculty/register',
  '/admin/gateway',
];

export const HIDE_SIDEBAR_ON = [
  '/',
  '/landing',
  '/auth',
  '/auth/student',
  '/sign-in',
  '/sign-up',
  '/faculty/login',
  '/faculty/register',
  '/admin/gateway',
  '/faculty/internal',
  '/admin/terminal',
];

export const HIDE_SIDEBAR_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/faculty/login',
  '/faculty/register',
  '/faculty/internal',
];

export const ROUTE_LABELS = {
  '/': 'Home',
  '/landing': 'Landing',
  '/auth': 'Access Portal',
  '/auth/student': 'Student Access',
  '/dashboard': 'Dashboard',
  '/leaderboard': 'Class Leaderboard & Toppers',
  '/calculator': 'Calculator',
  '/vault': 'Batch Results Upload',
  '/analytics': 'Analytics',
  '/guide': 'Guide',
  '/curriculum': 'Curriculum',
  '/files': 'Files',
  '/settings': 'Settings',
  '/faculty': 'Faculty',
  '/faculty/dashboard': 'Dashboard',
  '/faculty/classes': 'Classes',
  '/faculty/students': 'Students Directory',
  '/faculty/subjects': 'Subjects',
  '/faculty/reports': 'Reports',
  '/faculty/analytics/semester-analysis': 'Semester Analysis',
  '/faculty/analytics/batch-report': 'Batch Report',
  '/faculty/analytics/subject': 'Subject Analytics',
  '/faculty/analytics/compare': 'Compare Students',
  '/faculty/analytics/faculty-performance': 'Teaching Performance',
  '/faculty/analytics/eligibility': 'Eligibility Register',
  '/faculty/analytics/department': 'Department Overview',
  '/faculty/analytics/merit-list': 'Batch Merit List',
  '/faculty/analytics/leaderboard': 'Class Leaderboard & Toppers',
  '/faculty/analytics/reval-impact': 'Reval Impact Delta',
  '/faculty/analytics/backlogs': 'Standing Backlogs',
  '/faculty/analytics/cohort-trends': 'Cohort Trends',
  '/faculty/analytics/sections-compare': 'Sections Comparison',
  '/faculty/batch-upload': 'Batch Upload',
  '/faculty/vtu-urls': 'VTU Result URLs',
  '/faculty/internal': 'Faculty Administration',
  '/faculty/login': 'Faculty Login',
  '/faculty/register': 'Faculty Registration',
  '/admin': 'Admin',
  '/admin/classes': 'Classes',
  '/admin/exam-sessions': 'Exam Sessions',
  '/admin/faculty-assignments': 'Faculty Assignments',
  '/admin/analytics': 'Analytics',
  '/admin/audit-log': 'Audit Log',
  '/admin/gateway': 'Admin Gateway',
  '/admin/terminal': 'Admin Console',
};

export function resolveRoleFromPath(pathname, fallbackRole = 'student') {
  if (pathname?.startsWith('/admin')) return 'admin';
  if (pathname?.startsWith('/faculty')) return 'faculty';
  return fallbackRole || 'student';
}

export function isNavItemActive(pathname, href) {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function shouldHideNavigation(pathname) {
  if (!pathname) return false;
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (HIDE_SIDEBAR_ON.includes(pathname)) return true;
  return HIDE_SIDEBAR_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function getNavGroups(role) {
  const items = NAV_CONFIG[role] || NAV_CONFIG.student;

  return items.reduce((groups, item) => {
    const groupName = item.group || 'Navigation';
    const existing = groups.find(group => group.label === groupName);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label: groupName, items: [item] });
    }

    return groups;
  }, []);
}

export function getRouteLabel(pathname) {
  if (!pathname) return 'Dashboard';
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];

  const segment = pathname.split('/').filter(Boolean).at(-1) || 'Dashboard';
  return segment
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getBreadcrumbs(pathname) {
  if (!pathname || pathname === '/') return [];
  if (shouldHideNavigation(pathname)) return [];

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return [];

  return parts.map((_, index) => {
    const href = `/${parts.slice(0, index + 1).join('/')}`;
    return {
      href,
      label: getRouteLabel(href),
      current: index === parts.length - 1,
    };
  });
}
