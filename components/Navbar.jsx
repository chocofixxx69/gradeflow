'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getBreadcrumbs,
    getNavGroups,
    getRouteLabel,
    isNavItemActive,
    resolveRoleFromPath,
    shouldHideNavigation,
} from './navigationConfig';

function parseSession(value) {
    if (!value) return null;

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function getInitial(value, fallback = 'U') {
    return String(value || fallback).trim().charAt(0).toUpperCase();
}

function getRoleLabel(role) {
    if (role === 'admin') return 'Admin';
    if (role === 'faculty') return 'Faculty';
    return 'Student';
}

export default function Navbar() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState(null);
    const [dark, setDark] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [sessionRole, setSessionRole] = useState('student');
    const [collapsed, setCollapsed] = useState(false);
    const sidebarRef = useRef(null);
    const mobileMenuButtonRef = useRef(null);

    const toggleSidebarCollapse = useCallback(() => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('gf_sidebar_collapsed', String(next));
            document.documentElement.classList.toggle('gf-sidebar-is-collapsed', next);
            return next;
        });
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('theme');
        const nextDark = stored === 'dark';
        setDark(nextDark);
        document.documentElement.setAttribute('data-theme', nextDark ? 'dark' : 'light');

        const isCollapsed = localStorage.getItem('gf_sidebar_collapsed') === 'true';
        setCollapsed(isCollapsed);
        document.documentElement.classList.toggle('gf-sidebar-is-collapsed', isCollapsed);

        const student = parseSession(localStorage.getItem('student_session'));
        const faculty = parseSession(localStorage.getItem('faculty_session'));
        const admin = parseSession(localStorage.getItem('admin_session'));

        if (pathname?.startsWith('/admin')) {
            if (admin) {
                setUser(admin);
                setSessionRole('admin');
            } else {
                setUser(null);
                setSessionRole('admin');
            }
        } else if (pathname?.startsWith('/faculty')) {
            if (faculty) {
                setUser(faculty);
                setSessionRole('faculty');
            } else {
                setUser(null);
                setSessionRole('faculty');
            }
        } else {
            if (faculty) {
                setUser(faculty);
                setSessionRole('faculty');
            } else if (student) {
                setUser(student);
                setSessionRole('student');
            } else if (admin) {
                setUser(admin);
                setSessionRole('admin');
            } else {
                setUser(null);
                setSessionRole(resolveRoleFromPath(pathname));
            }
        }
    }, [pathname]);

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        document.body.classList.toggle('gf-drawer-open', menuOpen);
        return () => document.body.classList.remove('gf-drawer-open');
    }, [menuOpen]);

    const closeMobileMenu = useCallback((returnFocus = true) => {
        setMenuOpen(false);

        if (returnFocus) {
            window.requestAnimationFrame(() => {
                mobileMenuButtonRef.current?.focus();
            });
        }
    }, []);

    useEffect(() => {
        if (!menuOpen) return;

        const focusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');

        const getFocusableItems = () => Array.from(sidebarRef.current?.querySelectorAll(focusableSelector) || [])
            .filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');

        const focusableItems = getFocusableItems();
        focusableItems[0]?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMobileMenu();
                return;
            }

            if (event.key !== 'Tab') return;

            const items = getFocusableItems();
            if (items.length === 0) {
                event.preventDefault();
                return;
            }

            const firstItem = items[0];
            const lastItem = items[items.length - 1];

            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [closeMobileMenu, menuOpen]);

    const isHiddenRoute = shouldHideNavigation(pathname);
    const activeRole = resolveRoleFromPath(pathname, sessionRole);
    const navGroups = useMemo(() => getNavGroups(activeRole), [activeRole]);
    const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);
    const pageTitle = getRouteLabel(pathname);

    const userLabel = useMemo(() => {
        if (!user) return '';
        if (activeRole === 'admin') return user.name || user.email || 'Admin';
        if (activeRole === 'faculty') return user.full_name || user.name || user.email || 'Faculty';
        return user.name && user.name !== user.usn ? user.name : user.usn || 'Student';
    }, [activeRole, user]);

    const userMeta = useMemo(() => {
        if (!user) return '';
        if (activeRole === 'admin') return user.email || 'Administrator';
        if (activeRole === 'faculty') return user.department || user.email || 'Faculty';
        return user.usn || user.email || 'Student';
    }, [activeRole, user]);

    const toggleTheme = useCallback(() => {
        const next = dark ? 'light' : 'dark';
        setDark(!dark);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    }, [dark]);

    const logout = useCallback(() => {
        localStorage.removeItem('student_session');
        localStorage.removeItem('faculty_session');
        localStorage.removeItem('admin_session');

        if (activeRole === 'admin') {
            router.push('/admin/gateway');
        } else if (activeRole === 'faculty') {
            router.push('/faculty/login');
        } else {
            router.push('/auth');
        }
    }, [activeRole, router]);

    if (isHiddenRoute) return null;

    return (
        <>
            <aside
                ref={sidebarRef}
                className={`gf-sidebar${menuOpen ? ' active' : ''}`}
                id="gf-sidebar"
                aria-label={`${getRoleLabel(activeRole)} navigation`}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 'var(--space-5)' }}>
                    <Link href="/" className="gf-sidebar-header" style={{ marginBottom: 0 }}>
                        <div className="gf-logo-box">G</div>
                        {!collapsed && (
                            <div className="gf-sidebar-header-info">
                                <div className="gf-sidebar-title">GradeFlow</div>
                                <div className="gf-sidebar-role">
                                    {getRoleLabel(activeRole)}
                                </div>
                            </div>
                        )}
                    </Link>
                    <button
                        onClick={toggleSidebarCollapse}
                        className="gf-hamburger-toggle-btn"
                        title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--tx-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px',
                            borderRadius: '6px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>menu</span>
                    </button>
                </div>

                <nav className="gf-sidebar-nav" aria-label="Primary">
                    {navGroups.map(group => (
                        <div key={group.label}>
                            <div className="gf-nav-group-title">
                                {group.label}
                            </div>
                            <div className="gf-nav-group-items">
                                {group.items.map(link => {
                                    const active = isNavItemActive(pathname, link.href);

                                    return (
                                        <Link
                                            key={link.key}
                                            href={link.href}
                                            className={`gf-nav-link${active ? ' active' : ''}`}
                                            aria-current={active ? 'page' : undefined}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">{link.icon}</span>
                                            {link.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="gf-sidebar-footer">
                    <button
                        onClick={toggleTheme}
                        className="gf-nav-link"
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">
                            {dark ? 'light_mode' : 'dark_mode'}
                        </span>
                        {dark ? 'Light Mode' : 'Dark Mode'}
                    </button>

                    {user && (
                        <div className="gf-sidebar-user">
                            <div className="gf-avatar" aria-hidden="true">
                                {getInitial(userLabel)}
                            </div>
                            <div className="gf-user-info">
                                <div className="gf-user-name">
                                    {userLabel}
                                </div>
                                <div className="gf-user-meta">
                                    {userMeta}
                                </div>
                            </div>
                        </div>
                    )}

                    {user && (
                        <button
                            onClick={logout}
                            className="gf-nav-link gf-nav-link-danger"
                            style={{ marginTop: '2px' }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">logout</span>
                            Sign out
                        </button>
                    )}
                </div>

                <button
                    onClick={() => closeMobileMenu()}
                    className="gf-mobile-close"
                    aria-label="Close navigation menu"
                >
                    <span className="material-icons-round" aria-hidden="true">close</span>
                </button>
            </aside>

            <header className="gf-mobile-header">
                <button
                    ref={mobileMenuButtonRef}
                    onClick={() => setMenuOpen(open => !open)}
                    className="gf-mobile-menu-btn"
                    aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={menuOpen}
                    aria-controls="gf-sidebar"
                >
                    <span className="material-icons-round" style={{ fontSize: '26px' }} aria-hidden="true">
                        {menuOpen ? 'close' : 'menu'}
                    </span>
                </button>

                <div className="gf-mobile-header-title-box">
                    <div className="gf-mobile-header-title">
                        {pageTitle}
                    </div>
                    <div className="gf-mobile-header-role">
                        {getRoleLabel(activeRole)}
                    </div>
                </div>

                <button
                    onClick={toggleTheme}
                    className="gf-mobile-theme-btn"
                    aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    <span className="material-icons-round" style={{ fontSize: '22px' }} aria-hidden="true">
                        {dark ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </header>

            <div className="gf-shell-topbar" role="banner">
                <div className="gf-topbar-left">
                    {collapsed && (
                        <button 
                            onClick={toggleSidebarCollapse}
                            title="Expand Navigation Menu"
                            style={{ 
                                background: 'var(--surface)', 
                                border: '1px solid var(--border)', 
                                color: 'var(--tx-main)', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                padding: '6px 12px', 
                                borderRadius: 'var(--radius-4)', 
                                fontWeight: 700, 
                                fontSize: '13px',
                                marginRight: '12px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>menu</span>
                            Menu
                        </button>
                    )}
                    {breadcrumbs.length > 0 && (
                        <nav aria-label="Breadcrumb" className="gf-breadcrumbs">
                            {breadcrumbs.map((crumb, index) => (
                                <span key={crumb.href} className="gf-breadcrumb-item">
                                    {index > 0 && <span aria-hidden="true">/</span>}
                                    {crumb.current ? (
                                        <span aria-current="page" className="gf-breadcrumb-current">{crumb.label}</span>
                                    ) : (
                                        <Link href={crumb.href} className="gf-breadcrumb-link">{crumb.label}</Link>
                                    )}
                                </span>
                            ))}
                        </nav>
                    )}
                    <div className="gf-topbar-title-row">
                        <h1 className="gf-topbar-title">
                            {pageTitle}
                        </h1>
                        <span className="gf-topbar-role">
                            {getRoleLabel(activeRole)}
                        </span>
                    </div>
                </div>

                <div className="gf-topbar-actions">
                    <button
                        onClick={toggleTheme}
                        className="gf-topbar-btn"
                        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">
                            {dark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    {user && (
                        <div className="gf-topbar-user">
                            <div className="gf-topbar-user-info">
                                <div className="gf-user-name">
                                    {userLabel}
                                </div>
                                <div className="gf-user-meta">
                                    {userMeta}
                                </div>
                            </div>
                            <div className="gf-avatar" aria-hidden="true">
                                {getInitial(userLabel)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {menuOpen && (
                <div
                    onClick={() => closeMobileMenu()}
                    className="gf-drawer-backdrop"
                    aria-hidden="true"
                />
            )}

        </>
    );
}
