'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Input, Select } from '@/components/ui/Foundation';

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

    const alertStyle = {
        error: {
            background: 'var(--red-bg)',
            border: '1px solid var(--red-border)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '13px',
            color: 'var(--red)',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.45,
        }
    };

    if (submitted) {
        return (
            <div className="gf-auth-page gf-fade-up">
                <div className="gf-auth-card gf-auth-card-lg">
                    <div style={{
                        width: '56px',
                        height: '56px',
                        background: 'var(--surface-low)',
                        borderRadius: 'var(--radius-4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        marginBottom: '20px',
                    }}>
                        <span className="material-icons-round" style={{ fontSize: '28px' }}>mark_email_read</span>
                    </div>
                    <h1 className="gf-auth-heading">Your request has been received.</h1>
                    <p className="gf-auth-subtext">
                        We review every faculty application personally. You will hear from us within 24 hours on the email address you provided.
                    </p>
                    <Link href="/auth" style={{ textDecoration: 'none' }}>
                        <Button fullWidth variant="primary" as="span" size="lg">
                            Back to portal
                        </Button>
                    </Link>
                    <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 }}>
                        Requests are reviewed by the platform administrator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="gf-auth-page gf-fade-up">
            <div className="gf-auth-card gf-auth-card-lg">
                <Link href="/auth" className="gf-auth-back">
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_back</span>
                    <span>Back to portal options</span>
                </Link>

                <div className="gf-auth-brand">
                    <div className="gf-auth-brand-logo">G</div>
                    <span className="gf-auth-brand-title">GradeFlow</span>
                    <span className="gf-auth-brand-badge">Access Request</span>
                </div>

                <h1 className="gf-auth-heading">Request faculty access.</h1>
                <p className="gf-auth-subtext">
                    We review every request personally. You will hear back within 24 hours. Fill in the form accurately — we use it to verify your institutional role.
                </p>

                {error && (
                    <div style={alertStyle.error}>
                        <span className="material-icons-round" style={{ fontSize: '18px', flexShrink: 0 }}>error_outline</span>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <Input
                            label="Full Name"
                            placeholder="Dr. Priya Nair"
                            value={form.full_name}
                            onChange={handleChange('full_name')}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <Input
                            label="Institutional Email"
                            type="email"
                            placeholder="priya@anjuman.edu.in"
                            value={form.email}
                            onChange={handleChange('email')}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', letterSpacing: '-0.01em' }}>
                                Department <span style={{ color: 'var(--red)' }}>*</span>
                            </label>
                            <button
                                type="button"
                                onClick={handleToggleCustom}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '4px 6px',
                                    margin: '-4px -6px',
                                    color: 'var(--primary)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>
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

                    <div style={{ marginBottom: '20px' }}>
                        <Input
                            label="Account Password"
                            type="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={handleChange('password')}
                            required
                        />
                    </div>

                    <div className="gf-auth-divider" />

                    <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading} size="lg">
                        {loading ? 'Submitting...' : 'Submit Request'}
                    </Button>
                </form>
                <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 }}>
                    Requests are reviewed by the platform administrator.
                </p>
            </div>
        </div>
    );
}
