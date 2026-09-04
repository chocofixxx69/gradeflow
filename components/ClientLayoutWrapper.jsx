'use client';

import { usePathname } from 'next/navigation';
import { SWRConfig } from 'swr';
import Sidebar from './Navbar';
import { shouldHideNavigation } from './navigationConfig';
import { swrGlobalConfig } from '../lib/api/live';

function Footer() {
    return (
        <footer style={{
            textAlign: 'center',
            padding: '36px 20px 32px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            marginTop: 'auto'
        }}>
            <div style={{
                maxWidth: '680px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
            }}>
                <p style={{ fontSize: '12.5px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                    © 2026 GradeFlow · Academic Intelligence System · VTU Engine
                </p>

                {/* Highlighted Developer Box */}
                <div style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px 12px',
                    padding: '8px 18px',
                    background: 'var(--surface-low)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-full)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Engineered by
                    </span>
                    <a
                        href="https://ainanai.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Mohammed Ainan — AI Engineer & Full Stack Developer"
                        style={{
                            fontSize: '12.5px',
                            color: 'var(--tx-main)',
                            fontWeight: 800,
                            textDecoration: 'none',
                            transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-main)'}
                    >
                        Mohammed Ainan Armar
                    </a>
                    <span style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '13px' }}>&</span>
                    <a
                        href="https://rawahahruknuddin.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Rawahah Ruknuddin — AI Product Engineer"
                        style={{
                            fontSize: '12.5px',
                            color: 'var(--tx-main)',
                            fontWeight: 800,
                            textDecoration: 'none',
                            transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-main)'}
                    >
                        Rawahah Ruknuddin
                    </a>
                </div>

                {/* Academic Department */}
                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 600 }}>
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
        </SWRConfig>
    );
}
