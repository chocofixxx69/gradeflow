'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { SWRConfig } from 'swr';
import Sidebar from './Navbar';
import FacultyPresenceHeartbeat from './FacultyPresenceHeartbeat';
import { shouldHideNavigation } from './navigationConfig';
import { swrGlobalConfig } from '../lib/api/live';

function Footer({ isPublic = false }) {
    return (
        <footer className={`gf-footer ${isPublic ? 'gf-footer-public' : ''}`}>
            <div className="gf-footer-container">
                <p className="gf-footer-copy">
                    © 2026 GradeFlow · Academic Intelligence System · VTU Engine
                </p>

                {/* Highlighted Developer Box */}
                <div className="gf-dev-badge">
                    <span className="gf-dev-label">
                        Developed by
                    </span>
                    <a
                        href="https://ainanai.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Mohammed Ainan — AI Engineer & Full Stack Developer"
                        className="gf-dev-link"
                    >
                        Mohammed Ainan Armar
                    </a>
                    <span className="gf-dev-amp">&</span>
                    <a
                        href="https://rawahahruknuddin.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Rawahah Ruknuddin — AI Product Engineer"
                        className="gf-dev-link"
                    >
                        Rawahah Ruknuddin
                    </a>
                </div>

                {/* Academic Department */}
                <div className="gf-footer-dept">
                    Department of Computer Science & Engineering
                </div>
            </div>
        </footer>
    );
}

export default function ClientLayoutWrapper({ children }) {
    const pathname = usePathname();
    const isLandingPage = pathname === '/';
    const hideSidebar = shouldHideNavigation(pathname);

    return (
        <SWRConfig value={swrGlobalConfig}>
            <FacultyPresenceHeartbeat />
            <div className={`app-layout ${hideSidebar ? 'app-layout-public' : 'app-layout-authenticated'}`}>
                {!hideSidebar && (
                    <Suspense fallback={<aside className="gf-sidebar" />}>
                        <Sidebar />
                    </Suspense>
                )}
                <div
                    className={`main-content ${hideSidebar ? 'full-width' : ''}`}
                >
                    <div className="main-content-body">
                        {children}
                    </div>
                    {!isLandingPage && <Footer isPublic={hideSidebar} />}
                </div>
            </div>
        </SWRConfig>
    );
}
