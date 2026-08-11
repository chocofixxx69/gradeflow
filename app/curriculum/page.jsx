'use client';

import { useState, useEffect } from 'react';
import { VTU_BRANCHES, VTU_SCHEMES, getSubjectsFor } from '../../lib/vtuGrades';
import AuthGuard from '../../components/AuthGuard';
import { Inline } from '@/components/ui/Foundation';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { TableWrapper, Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';

function CurriculumContent() {
    const [scheme, setScheme] = useState('2022');
    const [branch, setBranch] = useState('CSE');
    const [semester, setSemester] = useState(3);
    const [subjects, setSubjects] = useState([]);

    useEffect(() => {
        const list = getSubjectsFor(branch, semester, scheme);
        setSubjects(list);
    }, [scheme, branch, semester]);

    const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);

    const s = {
        filtersRow: { marginBottom: 'var(--space-8)' },
        filterGroup: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
        filterLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' },
        select: { background: 'var(--surface)', border: '1px solid var(--border)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-4)', fontWeight: 700, fontSize: '13px', color: 'var(--tx-main)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', minWidth: 0, width: '100%' },
        semRow: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' },
        semBtn: (active) => ({ minWidth: '44px', minHeight: '44px', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-4)', fontWeight: 800, fontSize: '12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active ? 'var(--primary)' : 'var(--surface)', color: active ? '#fff' : 'var(--tx-dim)', boxShadow: active ? '0 6px 16px rgba(79,110,247,0.25)' : '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s' }),
        statsRow: { marginBottom: 'var(--space-7)' },
        statPill: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--surface)', padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-4)', border: '1px solid var(--border)' },
        statPillVal: { fontWeight: 900, fontSize: '16px', color: 'var(--tx-main)' },
        statPillLabel: { fontWeight: 600, fontSize: '12px', color: 'var(--tx-dim)' },
        subCode: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: 'var(--space-1)' },
        creditBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: 'var(--radius-3)', background: 'var(--primary-glow)', color: 'var(--primary)', fontWeight: 900, fontSize: '14px' },
        empty: { padding: 'var(--space-10) var(--space-7)', textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 600, fontStyle: 'italic' },
    };

    return (
        <div className="gf-page gf-page-wide gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Academic Structure</PageHeaderEyebrow>
                <PageHeaderTitle>Curriculum Explorer</PageHeaderTitle>
                <PageHeaderSubtitle>Browse subject details, credits, and course codes for your VTU programme.</PageHeaderSubtitle>
            </PageHeader>

            {/* Filters */}
            <Inline align="start" stackMobile style={s.filtersRow}>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Scheme</label>
                    <select style={s.select} value={scheme} onChange={e => setScheme(e.target.value)}>
                        {Object.keys(VTU_SCHEMES).map(k => <option key={k} value={k}>{k} Scheme</option>)}
                    </select>
                </div>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Branch</label>
                    <select style={s.select} value={branch} onChange={e => setBranch(e.target.value)}>
                        {Object.entries(VTU_BRANCHES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                </div>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Semester</label>
                    <div style={s.semRow}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <button key={n} style={s.semBtn(semester === n)} onClick={() => setSemester(n)}>{n}</button>
                        ))}
                    </div>
                </div>
            </Inline>

            {/* Stats */}
            <Inline align="start" style={s.statsRow}>
                <div style={s.statPill}>
                    <div style={s.statPillVal}>{subjects.length}</div>
                    <div style={s.statPillLabel}>Subjects</div>
                </div>
                <div style={s.statPill}>
                    <div style={s.statPillVal}>{totalCredits}</div>
                    <div style={s.statPillLabel}>Total Credits</div>
                </div>
            </Inline>

            {/* Table */}
            <TableWrapper>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>#</TableHeader>
                            <TableHeader>Subject</TableHeader>
                            <TableHeader align="center">Code</TableHeader>
                            <TableHeader align="center">Credits</TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {subjects.length > 0 ? subjects.map((sub, i) => (
                            <TableRow key={i} style={{ transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <TableCell align="center" style={{ fontWeight: 800, color: 'var(--tx-dim)', width: '60px' }}>{String(i + 1).padStart(2, '0')}</TableCell>
                                <TableCell>
                                    <div style={{ fontWeight: 700 }}>{sub.name}</div>
                                </TableCell>
                                <TableCell align="center">
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: 'var(--tx-muted)' }}>{sub.code}</span>
                                </TableCell>
                                <TableCell align="center">
                                    <span style={s.creditBadge}>{sub.credits}</span>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={4} align="center" style={s.empty}>No subjects found for this combination.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableWrapper>
        </div>
    );
}

export default function CurriculumPage() {
    return (
        <AuthGuard role="any">
            <CurriculumContent />
        </AuthGuard>
    );
}
