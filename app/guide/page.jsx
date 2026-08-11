'use client';

import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { TableWrapper, Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';

function GuideContent() {
    const sections = [
        {
            title: "Standard SGPA Protocol",
            content: "SGPA (Semester Grade Point Average) is the fundamental metric of academic velocity within a single term. It is calculated as the weighted average of grade points earned relative to their assigned credit weightage.",
            formula: "Si = Σ(Ci × Gi) / ΣCi"
        },
        {
            title: "Grading Spectrum (NEP 2022/2025)",
            table: [
                { range: "90-100", grade: "O", level: "Outstanding", points: "10" },
                { range: "80-89", grade: "A+", level: "Excellent", points: "9" },
                { range: "70-79", grade: "A", level: "Very Good", points: "8" },
                { range: "60-69", grade: "B+", level: "Good", points: "7" },
                { range: "55-59", grade: "B", level: "Above Average", points: "6" },
                { range: "50-54", grade: "C", level: "Average", points: "5" },
                { range: "40-49", grade: "P", level: "Pass", points: "4" },
                { range: "< 40", grade: "F", level: "Fail", points: "0" }
            ]
        },
        {
            title: "Cumulative Synthesis (CGPA)",
            content: "CGPA (Cumulative Grade Point Average) represents the aggregate trajectory across the entire engineering cycle.",
            formula: "CGPA = Σ(C_sem × S_sem) / ΣC_total"
        },
        {
            title: "Yield Conversion",
            content: "VTU employs a linear transformation to convert cumulative averages into standard percentages.",
            formula: "Yield % = [CGPA - 0.75] × 10"
        }
    ];

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        num: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-low)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 },
        text: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.7, marginBottom: 'var(--space-6)' },
        formulaBox: { background: 'var(--surface-low)', borderRadius: 'var(--radius-6)', padding: 'clamp(var(--space-4), 3vw, var(--space-6))', textAlign: 'center', border: '1.5px solid var(--border)' },
        formula: { fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 900, color: 'var(--primary)', fontFamily: 'monospace' },
        callout: { background: 'var(--primary)', borderRadius: 'var(--radius-7)', padding: 'clamp(var(--space-8), 6vw, var(--space-10))', textAlign: 'center', color: 'var(--bg)', marginTop: 'clamp(var(--space-9), 8vw, var(--space-11))', border: 'none' },
        calloutTitle: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, marginBottom: 'var(--space-4)' },
        calloutSub: { fontSize: 'clamp(13px, 2.5vw, 16px)', fontWeight: 500, marginBottom: 'var(--space-8)', opacity: 0.8 },
        whiteBtn: { background: 'var(--bg)', color: 'var(--primary)', padding: 'var(--space-4) var(--space-9)', borderRadius: 'var(--radius-6)', fontWeight: 800, fontSize: '15px', textDecoration: 'none', transition: 'all 0.2s', display: 'inline-block' }
    };

    return (
        <div className="gf-fade-up" style={s.page}>
            <PageHeader style={{ textAlign: 'center', marginBottom: 'clamp(var(--space-8), 6vw, var(--space-10))' }}>
                <PageHeaderEyebrow>Platform intelligence</PageHeaderEyebrow>
                <PageHeaderTitle>Academic <span style={{ color: 'var(--primary)' }}>Standards</span></PageHeaderTitle>
                <PageHeaderSubtitle style={{ margin: '0 auto' }}>Deep dive into the official formulas and logic patterns that govern your VTU trajectory.</PageHeaderSubtitle>
            </PageHeader>

            <div className="gf-guide-grid">
                {sections.map((sec, i) => (
                    <Card key={i} style={{ padding: 'clamp(var(--space-5), 4vw, var(--space-8))' }}>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                                <div style={s.num}>{i + 1}</div>
                                {sec.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {sec.content && <p style={s.text}>{sec.content}</p>}

                            {sec.formula && (
                                <div style={s.formulaBox}>
                                    <code style={s.formula}>{sec.formula}</code>
                                </div>
                            )}

                            {sec.table && (
                                <TableWrapper style={{ marginTop: 'var(--space-4)', fontSize: '12px' }}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableHeader>Marks Range</TableHeader>
                                                <TableHeader>Grade</TableHeader>
                                                <TableHeader align="right">Points</TableHeader>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {sec.table.map((row, r) => (
                                                <TableRow key={r}>
                                                    <TableCell>{row.range}%</TableCell>
                                                    <TableCell style={{ color: 'var(--primary)', fontWeight: 800 }}>{row.grade}</TableCell>
                                                    <TableCell align="right" style={{ fontWeight: 800 }}>{row.points}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableWrapper>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div style={s.callout}>
                <h2 style={s.calloutTitle}>Ready to Calculate?</h2>
                <p style={s.calloutSub}>Equipped with the logic, you can now input your grades with complete confidence in the result.</p>
                <Link href="/calculator" style={s.whiteBtn}>
                    Initialize Portal
                </Link>
            </div>
        </div>
    );
}

export default function GuidePage() {
    return (
        <AuthGuard role="any">
            <GuideContent />
        </AuthGuard>
    );
}
