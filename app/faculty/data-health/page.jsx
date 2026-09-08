'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { getXLSX } from '@/lib/lazy-export-libs';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

export default function FacultyDataHealthPage() {
    return (
        <AuthGuard role="faculty">
            <DataHealthContent />
        </AuthGuard>
    );
}

const SEVERITY_STYLE = {
    critical: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', icon: 'error', label: 'Critical' },
    warning: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', icon: 'warning', label: 'Warning' },
    info: { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', icon: 'info', label: 'Info' }
};

const GRADE_COLOR = { A: '#10B981', B: '#84CC16', C: '#F59E0B', D: '#F97316', E: '#EF4444' };

function DataHealthContent() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [report, setReport] = useState(null);
    const [severityFilter, setSeverityFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [expanded, setExpanded] = useState(() => new Set());

    const load = useCallback(async ({ fresh = false } = {}) => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiRequest('/api/faculty/data-health', { query: fresh ? { fresh: '1' } : {} });
            setReport(res);
        } catch (err) {
            console.error('Data health sweep failed:', err);
            setError(err?.message || 'Failed to run the integrity sweep.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = (code) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(code)) next.delete(code); else next.add(code);
        return next;
    });

    const categories = useMemo(() => Object.keys(report?.byCategory || {}), [report]);

    const visibleIssues = useMemo(() => {
        const all = report?.issues || [];
        return all.filter(i =>
            (severityFilter === 'all' || i.severity === severityFilter) &&
            (categoryFilter === 'all' || i.category === categoryFilter)
        );
    }, [report, severityFilter, categoryFilter]);

    const exportWorkbook = async () => {
        if (!report) return;
        const XLSX = await getXLSX();
        const wb = XLSX.utils.book_new();

        const summary = [
            ['GradeFlow — Institutional Data Integrity Report'],
            ['Generated', new Date(report.generatedAt).toLocaleString()],
            ['Score', `${report.score} / 100 (grade ${report.grade})`],
            [],
            ['Severity', 'Issues'],
            ['Critical', report.bySeverity.critical],
            ['Warning', report.bySeverity.warning],
            ['Info', report.bySeverity.info],
            [],
            ['Table', 'Rows'],
            ...Object.entries(report.totals).map(([k, v]) => [k, v])
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

        const issueRows = [['Code', 'Severity', 'Category', 'Title', 'Affected', 'Unit', '% of total', 'Impact', 'Remedy']];
        report.issues.forEach(i => issueRows.push([
            i.code, i.severity, i.category, i.title, i.count, i.unit,
            i.percent !== null ? `${i.percent}%` : '—', i.impact || '', i.remedy || ''
        ]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(issueRows), 'Issues');

        const batchRows = [['Batch', 'Total', 'Lateral', 'Department', 'Students', 'Lateral (dept)']];
        (report.batches || []).forEach(b => b.branches.forEach(br =>
            batchRows.push([b.label, b.total, b.lateral, br.code, br.total, br.lateral])
        ));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batchRows), 'Batches');

        // One sheet per issue that has samples, so the affected records travel too.
        report.issues.filter(i => i.samples?.length).forEach(i => {
            const keys = [...new Set(i.samples.flatMap(s => Object.keys(s)))];
            const rows = [keys, ...i.samples.map(s => keys.map(k => {
                const v = s[k];
                return Array.isArray(v) ? v.join(', ') : v ?? '';
            }))];
            const name = i.code.slice(0, 31);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
        });

        XLSX.writeFile(wb, `Data_Integrity_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const s = report;

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institution</PageHeaderEyebrow>
                    <PageHeaderTitle>Data Health</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Every invariant the academic pipeline depends on, checked against the live database —
                        identity and batch resolution, referential integrity, exam-attempt reconciliation, credit
                        coverage and record completeness.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={exportWorkbook} variant="ghost" disabled={!s}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Report
                    </Button>
                    <Button onClick={() => load({ fresh: true })} variant="primary" disabled={loading}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        {loading ? 'Sweeping…' : 'Re-run Sweep'}
                    </Button>
                </div>
            </div>

            {error && (
                <Card style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                    <CardContent style={{ padding: '14px 18px', color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>{error}</CardContent>
                </Card>
            )}

            {loading && !s && (
                <Card><CardContent style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                    Sweeping every table in the warehouse…
                </CardContent></Card>
            )}

            {s && (
                <>
                    {/* Headline */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', marginBottom: '20px' }}>
                        <Card>
                            <CardContent style={{ padding: '18px 20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-dim)' }}>Integrity Score</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                                    <span style={{ fontSize: '34px', fontWeight: 900, color: GRADE_COLOR[s.grade] || 'var(--tx-main)', lineHeight: 1 }}>{s.score}</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)' }}>/ 100 · grade {s.grade}</span>
                                </div>
                                <div style={{ marginTop: '10px', height: '6px', borderRadius: '999px', background: 'var(--surface-low)', overflow: 'hidden' }}>
                                    <div style={{ width: `${s.score}%`, height: '100%', background: GRADE_COLOR[s.grade] || 'var(--primary)' }} />
                                </div>
                            </CardContent>
                        </Card>
                        {['critical', 'warning', 'info'].map(sev => {
                            const st = SEVERITY_STYLE[sev];
                            return (
                                <Card key={sev} style={{ cursor: 'pointer', borderColor: severityFilter === sev ? st.border : undefined }}
                                    onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}>
                                    <CardContent style={{ padding: '18px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: st.color }}>
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>{st.icon}</span>
                                            {st.label}
                                        </div>
                                        <div style={{ fontSize: '34px', fontWeight: 900, marginTop: '6px', color: 'var(--tx-main)', lineHeight: 1 }}>
                                            {s.bySeverity[sev]}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                            {severityFilter === sev ? 'filtering — click to clear' : 'click to filter'}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Batch registry — the organised view of every batch and its departments */}
                    <Card style={{ marginBottom: '20px' }}>
                        <CardContent style={{ padding: '18px 20px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '4px' }}>Batch Registry</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '14px' }}>
                                Batch comes from the two digits after the college code in the USN, so every department in
                                an intake year sits together — <code style={{ fontFamily: 'monospace' }}>2AB23CS</code>,{' '}
                                <code style={{ fontFamily: 'monospace' }}>2AB23CD</code>,{' '}
                                <code style={{ fontFamily: 'monospace' }}>2AB23CI</code>,{' '}
                                <code style={{ fontFamily: 'monospace' }}>2AB23CV</code>,{' '}
                                <code style={{ fontFamily: 'monospace' }}>2AB23EE</code> and{' '}
                                <code style={{ fontFamily: 'monospace' }}>2AB23EC</code> are all 23 batch. Lateral entrants
                                stay in the batch their USN names.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '14px' }}>
                                {(s.batches || []).map(b => (
                                    <div key={b.year} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', background: 'var(--surface-low)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                                            <span style={{ fontWeight: 900, fontSize: '15px' }}>{b.label}</span>
                                            <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                {b.total} students{b.lateral > 0 ? ` · ${b.lateral} lateral` : ''}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                            {b.branches.map(br => (
                                                <Link key={br.code} href={`/faculty/students?batch=${b.year}&branch=${br.code}`}
                                                    style={{ textDecoration: 'none' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '11px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        {br.code}
                                                        <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>{br.total}</span>
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                            Records held for semester{' '}
                                            {b.semesters.length ? b.semesters.map(x => `${x.semester} (${x.count})`).join(', ') : '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Warehouse totals */}
                    <Card style={{ marginBottom: '20px' }}>
                        <CardContent style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '22px' }}>
                            {Object.entries(s.totals).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: '18px', fontWeight: 900 }}>{v.toLocaleString()}</div>
                                    <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {k.replace(/([A-Z])/g, ' $1')}
                                    </div>
                                </div>
                            ))}
                            <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '11px', color: 'var(--tx-dim)' }}>
                                Swept {new Date(s.generatedAt).toLocaleTimeString()}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <div style={{ minWidth: '220px' }}>
                            <Select
                                label="Category"
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                options={[
                                    { value: 'all', label: `All categories (${(s.issues || []).length})` },
                                    ...categories.map(c => ({ value: c, label: `${c} (${s.byCategory[c].total})` }))
                                ]}
                            />
                        </div>
                        <div style={{ minWidth: '180px' }}>
                            <Select
                                label="Severity"
                                value={severityFilter}
                                onChange={e => setSeverityFilter(e.target.value)}
                                options={[
                                    { value: 'all', label: 'All severities' },
                                    { value: 'critical', label: `Critical (${s.bySeverity.critical})` },
                                    { value: 'warning', label: `Warning (${s.bySeverity.warning})` },
                                    { value: 'info', label: `Info (${s.bySeverity.info})` }
                                ]}
                            />
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 700, paddingBottom: '10px' }}>
                            Showing {visibleIssues.length} of {(s.issues || []).length} findings
                        </div>
                    </div>

                    {/* Findings */}
                    {visibleIssues.length === 0 ? (
                        <Card><CardContent style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                            No findings match this filter.
                        </CardContent></Card>
                    ) : visibleIssues.map(issue => {
                        const st = SEVERITY_STYLE[issue.severity];
                        const open = expanded.has(issue.code);
                        const sampleKeys = issue.samples?.length ? [...new Set(issue.samples.flatMap(x => Object.keys(x)))] : [];

                        return (
                            <Card key={issue.code} style={{ marginBottom: '12px', borderLeft: `3px solid ${st.color}` }}>
                                <CardContent style={{ padding: '16px 20px' }}>
                                    <div
                                        onClick={() => toggle(issue.code)}
                                        style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', cursor: issue.samples?.length ? 'pointer' : 'default' }}
                                    >
                                        <span className="material-icons-round" style={{ color: st.color, fontSize: '20px', marginTop: '1px' }}>{st.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 800, fontSize: '14px' }}>{issue.title}</span>
                                                <span style={{ padding: '2px 8px', borderRadius: '999px', background: st.bg, color: st.color, fontSize: '10px', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                    {st.label}
                                                </span>
                                                <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontFamily: 'monospace', fontWeight: 700 }}>{issue.code}</span>
                                                <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 700 }}>{issue.category}</span>
                                            </div>
                                            <div style={{ fontSize: '12.5px', color: 'var(--tx-muted)', marginTop: '6px', lineHeight: 1.55 }}>
                                                {issue.detail}
                                            </div>
                                            {issue.impact && (
                                                <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--tx-main)' }}>
                                                    <strong style={{ color: st.color }}>Impact:</strong> {issue.impact}
                                                </div>
                                            )}
                                            {issue.remedy && (
                                                <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--tx-muted)' }}>
                                                    <strong>Fix:</strong> {issue.remedy}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: '22px', fontWeight: 900, color: st.color, lineHeight: 1 }}>
                                                {issue.count.toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                                                {issue.unit}{issue.percent !== null ? ` · ${issue.percent}%` : ''}
                                            </div>
                                            {issue.samples?.length > 0 && (
                                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)', marginTop: '6px', display: 'block' }}>
                                                    {open ? 'expand_less' : 'expand_more'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {open && issue.samples?.length > 0 && (
                                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-low)' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                                Affected records
                                                {issue.sampleTruncated && ` (first ${issue.samples.length} of ${issue.count.toLocaleString()})`}
                                            </div>
                                            <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border-low)', borderRadius: '8px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead style={{ background: 'var(--surface-low)', position: 'sticky', top: 0 }}>
                                                        <tr>
                                                            {sampleKeys.map(k => (
                                                                <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                                                                    {k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {issue.samples.map((row, i) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                                {sampleKeys.map(k => {
                                                                    const v = row[k];
                                                                    const text = Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '—' : String(v);
                                                                    const isUsn = k === 'usn' && typeof v === 'string';
                                                                    return (
                                                                        <td key={k} style={{ padding: '7px 12px', whiteSpace: 'nowrap', fontFamily: isUsn ? 'monospace' : 'inherit', fontWeight: isUsn ? 800 : 400 }}>
                                                                            {isUsn
                                                                                ? <Link href={`/faculty/students/${v}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{text}</Link>
                                                                                : text}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </>
            )}
        </div>
    );
}
