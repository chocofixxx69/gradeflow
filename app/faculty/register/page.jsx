'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Input, Select } from '@/components/ui/Foundation';
import { Card, CardContent } from '@/components/ui/Card';

const ALL_GRADEFLOW_BRANCHES = [
    { code: 'CS', label: 'Computer Science & Engineering (CS)', name: 'Computer Science & Engineering' },
    { code: 'DS', label: 'Computer Science & Engineering - Data Science (DS)', name: 'Computer Science & Engineering (Data Science)' },
    { code: 'AI', label: 'AI & Machine Learning (AIML)', name: 'AI & Machine Learning' },
    { code: 'IS', label: 'Information Science & Engineering (IS)', name: 'Information Science & Engineering' },
    { code: 'EC', label: 'Electronics & Communication Engineering (EC)', name: 'Electronics & Communication Engineering' },
    { code: 'EE', label: 'Electrical & Electronics Engineering (EE)', name: 'Electrical & Electronics Engineering' },
    { code: 'ME', label: 'Mechanical Engineering (ME)', name: 'Mechanical Engineering' },
    { code: 'CV', label: 'Civil Engineering (CV)', name: 'Civil Engineering' },
    { code: 'RI', label: 'Robotics & Artificial Intelligence (RI)', name: 'Robotics & Artificial Intelligence' },
    { code: 'MCA', label: 'Master of Computer Applications (MCA)', name: 'Master of Computer Applications' },
    { code: 'MBA', label: 'Master of Business Administration (MBA)', name: 'Master of Business Administration' },
    { code: 'BSH', label: 'Basic Science & Humanities (Maths / Physics / Chem)', name: 'Basic Science & Humanities' }
];

export default function FacultyRegister() {
    const [form, setForm] = useState({ full_name: '', email: '', department: '', password: '' });
    const [branches, setBranches] = useState(ALL_GRADEFLOW_BRANCHES);
    const [selectedBranchCode, setSelectedBranchCode] = useState('');
    const [isCustomDept, setIsCustomDept] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Dynamically load any active branches from system meta
        fetch('/api/system/meta')
            .then(res => res.json())
            .then(json => {
                const apiBranches = json?.data?.branches || [];
                if (apiBranches.length > 0) {
                    const branchMap = new Map();
                    ALL_GRADEFLOW_BRANCHES.forEach(b => branchMap.set(b.code, b));
                    apiBranches.forEach(b => {
                        const code = (b.code || b.name || '').toUpperCase().trim();
                        if (code && !branchMap.has(code)) {
                            branchMap.set(code, {
                                code,
                                label: `${b.label || b.name || code}${b.code ? ` (${b.code})` : ''}`,
                                name: b.name || b.label || code
                            });
                        }
                    });
                    setBranches(Array.from(branchMap.values()));
                }
            })
            .catch(() => {});
    }, []);

    const handleChange = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleBranchSelect = (e) => {
        const val = e.target.value;
        setSelectedBranchCode(val);
        if (val === '__CUSTOM__') {
            setIsCustomDept(true);
            setForm(f => ({ ...f, department: '' }));
        } else {
            setIsCustomDept(false);
            const found = branches.find(b => b.code === val);
            setForm(f => ({ ...f, department: found ? found.name : val }));
        }
    };

    const handleToggleCustom = () => {
        setIsCustomDept(prev => {
            const next = !prev;
            if (!next && selectedBranchCode && selectedBranchCode !== '__CUSTOM__') {
                const found = branches.find(b => b.code === selectedBranchCode);
                if (found) setForm(f => ({ ...f, department: found.name }));
            }
            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            // Use API route to bypass any client-side RLS / anon key restrictions
            const res = await fetch('/api/faculty/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.full_name.trim(),
                    email: form.email.trim().toLowerCase(),
                    department: form.department.trim(),
                    password: form.password,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                if (json.code === 'DUPLICATE_EMAIL') {
                    setError('A request with this email is already on file.');
                } else {
                    setError(json.error || 'Something went wrong. Please try again.');
                }
                return;
            }

            setSubmitted(true);
        } catch (err) {
            console.error('Faculty registration network error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const s = {
        page: {
            minHeight: '100dvh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-10) var(--page-px)',
        },
        backLink: {
            display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            color: 'var(--tx-muted)', marginBottom: 'var(--space-10)',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-8)' },
        logoBox: {
            width: '36px', height: '36px', background: 'var(--primary)',
            borderRadius: 'var(--radius-3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        heading: { fontSize: '26px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-2)' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', fontWeight: 500, lineHeight: 1.6, marginBottom: 'var(--space-8)' },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: 'var(--radius-2)', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: 'var(--space-5)',
        },
        divider: { height: '1px', background: 'var(--border)', margin: 'var(--space-7) 0' },
        footer: { textAlign: 'center', marginTop: 'var(--space-6)', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 },
        successIcon: {
            width: '56px', height: '56px', background: 'var(--surface-low)',
            borderRadius: 'var(--radius-4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tx-main)', marginBottom: 'var(--space-6)',
        },
        successHeading: { fontSize: '24px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-3)' },
        successText: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: 'var(--space-8)' },
    };

    if (submitted) {
        return (
            <div style={s.page} className="gf-fade-up">
                <Card style={{ width: '100%', maxWidth: '520px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                    <CardContent>
                        <div style={s.successIcon}>
                            <span className="material-icons-round" style={{ fontSize: '28px' }}>mark_email_read</span>
                        </div>
                        <h1 style={s.successHeading}>Your request has been received.</h1>
                        <p style={s.successText}>
                            We review every faculty application personally. You will hear from us within 24 hours on the email address you provided.
                        </p>
                        <Link href="/auth" style={{ textDecoration: 'none' }}>
                            <Button fullWidth variant="primary" as="span">
                                Back to portal
                            </Button>
                        </Link>
                        <p style={{ ...s.footer, marginTop: '20px' }}>Requests are reviewed by the platform administrator.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div style={s.page} className="gf-fade-up">
            <Card style={{ width: '100%', maxWidth: '520px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                <CardContent>
                    <Link href="/auth" style={s.backLink}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                        Back to portal options
                    </Link>

                    <div style={s.logoRow}>
                        <div style={s.logoBox}>G</div>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                    </div>

                    <h1 style={s.heading}>Request faculty access.</h1>
                    <p style={s.subtext}>
                        We review every request personally. You will hear back within 24 hours. Fill in the form accurately — we use it to verify your institutional role.
                    </p>

                    {error && <div style={s.errorBox}>{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Full Name"
                                placeholder="Dr. Priya Nair"
                                value={form.full_name}
                                onChange={handleChange('full_name')}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Institutional Email"
                                type="email"
                                placeholder="priya@anjuman.edu.in"
                                value={form.email}
                                onChange={handleChange('email')}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', letterSpacing: '-0.01em' }}>
                                    Department <span style={{ color: 'var(--red)' }}>*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleToggleCustom}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--primary)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                        {isCustomDept ? 'list' : 'edit_note'}
                                    </span>
                                    {isCustomDept ? 'Select from list' : 'Write custom'}
                                </button>
                            </div>

                            {isCustomDept ? (
                                <div>
                                    <Input
                                        hideLabel
                                        id="custom-dept-input"
                                        placeholder="e.g. Department of Cyber Security, Mathematics, etc."
                                        value={form.department}
                                        onChange={handleChange('department')}
                                        required
                                        list="faculty-branches-datalist"
                                        helperText="Type custom department or select from autosuggestions"
                                        autoFocus
                                    />
                                    <datalist id="faculty-branches-datalist">
                                        {branches.map(b => (
                                            <option key={b.code} value={b.name}>{b.label}</option>
                                        ))}
                                    </datalist>
                                </div>
                            ) : (
                                <Select
                                    hideLabel
                                    id="department-select"
                                    value={selectedBranchCode}
                                    onChange={handleBranchSelect}
                                    required={!form.department}
                                >
                                    <option value="">Select your department / branch...</option>
                                    {branches.map(b => (
                                        <option key={b.code} value={b.code}>
                                            {b.label}
                                        </option>
                                    ))}
                                    <option value="__CUSTOM__">✍️ Other / Write custom department...</option>
                                </Select>
                            )}
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Account Password"
                                type="password"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={handleChange('password')}
                                required
                            />
                        </div>

                        <div style={s.divider} />

                        <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </Button>
                    </form>
                    <p style={s.footer}>Requests are reviewed by the platform administrator.</p>
                </CardContent>
            </Card>
        </div>
    );
}
