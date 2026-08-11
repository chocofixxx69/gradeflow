'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Navbar';
import { shouldHideNavigation } from './navigationConfig';

function Footer() {
    return (
        <footer style={{
            textAlign: 'center',
            padding: '40px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
            marginTop: 'auto'
        }}>
            <p style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 500, marginBottom: '12px' }}>
                © 2026 GradeFlow · Academic Intelligence System · Private Institutional Network
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ fontSize: '11px', color: 'var(--tx-muted)', opacity: 0.7, fontWeight: 600 }}>
                    Developed by <strong>Mohammed Ainan Armar</strong> & <strong>Rawahah Ruknuddin</strong>
                </p>
                <p style={{ fontSize: '12px', color: 'var(--tx-muted)', opacity: 0.9 }}>
                    Powered by{' '}
                    <a href="https://automaticxai.online" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}>
                        automaticxai.online
                    </a>
                </p>
            </div>
        </footer>
    );
}

export default function ClientLayoutWrapper({ children }) {
    const pathname = usePathname();
    const isLandingPage = pathname === '/';
    const hideSidebar = shouldHideNavigation(pathname);

    return (
        <div className={`app-layout ${hideSidebar ? 'app-layout-public' : 'app-layout-authenticated'}`}>
            {!hideSidebar && <Sidebar />}
            <div
                className={`main-content ${hideSidebar ? 'full-width' : ''}`}
            >
                <div className="main-content-body">
                    {children}
                </div>
                {!isLandingPage && <Footer />}
            </div>
        </div>
    );
}
