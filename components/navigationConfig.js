export const NAV_CONFIG = {
  student: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'space_dashboard', group: 'Academic Home' },
    { key: 'calculator', label: 'Calculator', href: '/calculator', icon: 'calculate', group: 'Academic Tools' },
    { key: 'vault', label: 'Results Upload', href: '/vault', icon: 'drive_folder_upload', group: 'Records' },
    { key: 'analytics', label: 'Analytics', href: '/analytics', icon: 'insights', group: 'Academic Tools' },
    { key: 'guide', label: 'Guide', href: '/guide', icon: 'menu_book', group: 'Support' },
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  faculty: [
    { key: 'dashboard', label: 'Dashboard', href: '/faculty/dashboard', icon: 'space_dashboard', group: 'Faculty Home' },
    { key: 'classes', label: 'Classes', href: '/faculty/classes', icon: 'groups', group: 'Class Operations' },
    { key: 'subjects', label: 'Subjects', href: '/faculty/subjects', icon: 'library_books', group: 'Academic Management' },
    { key: 'reports', label: 'Reports', href: '/faculty/reports', icon: 'analytics', group: 'Reporting' },
    { key: 'batchUpload', label: 'Batch Upload', href: '/faculty/batch-upload', icon: 'upload_file', group: 'Class Operations' },
    { key: 'vtuUrls', label: 'VTU Result URLs', href: '/faculty/vtu-urls', icon: 'link', group: 'Academic Management' },
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'Account' },
  ],
  admin: [
    { key: 'classes', label: 'Classes', href: '/admin/classes', icon: 'groups', group: 'Institution' },
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
  '/calculator': 'Calculator',
  '/vault': 'Results Upload',
  '/analytics': 'Analytics',
  '/guide': 'Guide',
  '/curriculum': 'Curriculum',
  '/files': 'Files',
  '/settings': 'Settings',
  '/faculty': 'Faculty',
  '/faculty/dashboard': 'Dashboard',
  '/faculty/classes': 'Classes',
  '/faculty/subjects': 'Subjects',
  '/faculty/reports': 'Reports',
  '/faculty/batch-upload': 'Batch Upload',
  '/faculty/vtu-urls': 'VTU Result URLs',
  '/faculty/internal': 'Faculty Administration',
  '/faculty/login': 'Faculty Login',
  '/faculty/register': 'Faculty Registration',
  '/admin': 'Admin',
  '/admin/classes': 'Classes',
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
