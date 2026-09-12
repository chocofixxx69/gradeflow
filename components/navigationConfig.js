export const NAV_CONFIG = {
  student: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'space_dashboard', group: 'Academic Home' },
    { key: 'leaderboard', label: 'Class Leaderboard', href: '/leaderboard', icon: 'emoji_events', group: 'Academic Tools' },
    { key: 'analytics', label: 'Analytics', href: '/analytics', icon: 'insights', group: 'Academic Tools' },
    { key: 'calculator', label: 'Calculator', href: '/calculator', icon: 'calculate', group: 'Academic Tools' },
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  faculty: [
    { key: 'dashboard', label: 'Dashboard', href: '/faculty/dashboard', icon: 'space_dashboard', group: 'Home' },

    // Classes & Students
    { key: 'classes', label: 'Classes', href: '/faculty/classes', icon: 'groups', group: 'Classes & Students' },
    { key: 'students', label: 'Students', href: '/faculty/students', icon: 'badge', group: 'Classes & Students' },

    // Results & Analytics
    { key: 'resultsHub', label: 'Result Sheets', href: '/faculty/analytics/results', icon: 'table_chart', group: 'Results & Analytics' },
    { key: 'meritHub', label: 'Rankings & Toppers', href: '/faculty/analytics/merit', icon: 'military_tech', group: 'Results & Analytics' },
    { key: 'complianceHub', label: 'Backlogs & Eligibility', href: '/faculty/analytics/compliance', icon: 'fact_check', group: 'Results & Analytics' },
    { key: 'intelligenceHub', label: 'Performance Comparison', href: '/faculty/analytics/intelligence', icon: 'insights', group: 'Results & Analytics' },
    { key: 'reports', label: 'Department Reports', href: '/faculty/reports', icon: 'analytics', group: 'Results & Analytics' },

    // Teaching & Courses
    { key: 'subjectAnalytics', label: 'Subject Performance', href: '/faculty/analytics/subject', icon: 'bar_chart', group: 'Teaching & Courses' },
    { key: 'facultyPerformance', label: 'Teaching Performance', href: '/faculty/analytics/faculty-performance', icon: 'supervisor_account', group: 'Teaching & Courses' },
    { key: 'subjects', label: 'Subject Catalog', href: '/faculty/subjects', icon: 'library_books', group: 'Teaching & Courses' },

    // Exam Tools
    { key: 'hallTickets', label: 'Hall Tickets', href: '/faculty/hall-tickets', icon: 'confirmation_number', group: 'Exam Tools' },
    { key: 'vtuUrls', label: 'VTU Result Links', href: '/faculty/vtu-urls', icon: 'link', group: 'Exam Tools' },

    // Account
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  admin: [
    { key: 'terminal', label: 'Admin Console', href: '/admin/terminal', icon: 'dashboard', group: 'Institution' },
    { key: 'classes', label: 'Classes', href: '/admin/classes', icon: 'groups', group: 'Institution' },
    { key: 'examSessions', label: 'Exam Sessions', href: '/admin/exam-sessions', icon: 'event', group: 'Institution' },
    { key: 'facultyAssignments', label: 'Faculty Assignments', href: '/admin/faculty-assignments', icon: 'assignment_ind', group: 'Institution' },
    { key: 'facultyPerformance', label: 'Teaching Performance', href: '/admin/faculty-performance', icon: 'supervisor_account', group: 'Institution' },
    { key: 'subjects', label: 'Subject Catalog', href: '/admin/subjects', icon: 'library_books', group: 'Institution' },
    { key: 'vtuUrls', label: 'VTU Result Links', href: '/admin/vtu-urls', icon: 'link', group: 'Institution' },
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
  '/faculty/students': 'Students',
  '/faculty/subjects': 'Subject Catalog',
  '/faculty/reports': 'Department Reports',
  '/faculty/analytics/results': 'Result Sheets',
  '/faculty/analytics/merit': 'Rankings & Toppers',
  '/faculty/analytics/compliance': 'Backlogs & Eligibility',
  '/faculty/analytics/intelligence': 'Performance Comparison',
  '/faculty/analytics/semester-analysis': 'Semester Analysis Gazette',
  '/faculty/analytics/batch-report': 'Multi-Semester Batch Report',
  '/faculty/analytics/subject': 'Subject Performance',
  '/faculty/analytics/compare': 'Student Comparator',
  '/faculty/analytics/faculty-performance': 'Teaching Performance',
  '/faculty/analytics/eligibility': 'Eligibility Register',
  '/faculty/analytics/department': 'Department Overview',
  '/faculty/analytics/merit-list': 'Batch Merit List',
  '/faculty/analytics/leaderboard': 'Class Leaderboard & Toppers',
  '/faculty/analytics/reval-impact': 'Reval Impact Delta',
  '/faculty/analytics/backlogs': 'Standing Backlogs',
  '/faculty/analytics/cohort-trends': 'Cohort Trends',
  '/faculty/analytics/sections-compare': 'Sections Comparison',
  '/faculty/hall-tickets': 'Hall Tickets',
  '/faculty/vtu-urls': 'VTU Result Links',
  '/faculty/internal': 'Faculty Administration',
  '/faculty/login': 'Faculty Login',
  '/faculty/register': 'Faculty Registration',
  '/admin': 'Admin',
  '/admin/classes': 'Classes',
  '/admin/exam-sessions': 'Exam Sessions',
  '/admin/faculty-assignments': 'Faculty Assignments',
  '/admin/faculty-performance': 'Teaching Performance',
  '/admin/teaching-performance': 'Teaching Performance',
  '/admin/subjects': 'Subject Catalog',
  '/admin/vtu-urls': 'VTU Result Links',
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
