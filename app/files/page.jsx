'use client';

import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import { Button, Inline, Stack } from '@/components/ui/Foundation';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';

function ResourcesContent() {
    const resources = [
        { name: 'Official VTU 2022 NEP Scheme PDF', type: 'PDF', size: '1.2 MB', icon: 'file_download' },
        { name: 'GradeFlow Scraper Integration Guide', type: 'Markdown', size: '15 KB', icon: 'description' },
        { name: 'Excel Template for Batch Upload', type: 'XLSX', size: '45 KB', icon: 'table_view' },
        { name: 'Deployment Script (vps-setup.sh)', type: 'SH', size: '4 KB', icon: 'code' }
    ];

    const s = {
        item: { padding: 'var(--space-6)', background: 'var(--surface)', borderRadius: 'var(--radius-6)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s', minWidth: 0 },
        left: { minWidth: 0 },
        iconBox: { width: '44px', height: '44px', background: 'var(--surface-low)', borderRadius: 'var(--radius-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' },
        resName: { fontWeight: 800, fontSize: '15px', color: 'var(--tx-main)', marginBottom: 'var(--space-1)', overflowWrap: 'anywhere' },
        resMeta: { fontSize: '12px', fontWeight: 600, color: 'var(--tx-dim)' },
        footer: { marginTop: 'var(--space-9)', textAlign: 'center' },
        backBtn: { color: 'var(--tx-dim)', textDecoration: 'none', fontSize: '14px', fontWeight: 700, transition: 'color 0.2s' }
    };

    return (
        <div className="gf-page gf-page-narrow gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Central Archive</PageHeaderEyebrow>
                <PageHeaderTitle>Resources <span style={{ color: 'var(--primary)' }}>& Files</span></PageHeaderTitle>
                <PageHeaderSubtitle>
                    Access essential documents, templates, and scripts required for GradeFlow setup and academic compliance.
                </PageHeaderSubtitle>
            </PageHeader>

            <Stack size="sm">
                {resources.map((res, i) => (
                    <div key={i} style={s.item} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--primary)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                        <Inline align="between" stackMobile style={{ width: '100%' }}>
                        <Inline style={s.left}>
                            <div style={s.iconBox}>
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>{res.icon}</span>
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={s.resName}>{res.name}</div>
                                <div style={s.resMeta}>{res.type} · {res.size}</div>
                            </div>
                        </Inline>
                        <Button variant="ghost" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                            Download
                        </Button>
                        </Inline>
                    </div>
                ))}
            </Stack>

            <div style={s.footer}>
                <Link href="/" style={s.backBtn} onMouseEnter={e => e.target.style.color = 'var(--tx-main)'} onMouseLeave={e => e.target.style.color = 'var(--tx-dim)'}>
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    );
}

export default function ResourcesPage() {
    return (
        <AuthGuard role="any">
            <ResourcesContent />
        </AuthGuard>
    );
}
