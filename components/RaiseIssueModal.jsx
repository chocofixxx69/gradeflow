'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api/client';

export default function RaiseIssueModal({
    isOpen,
    onClose,
    defaultUserType = 'student',
    defaultIdentifier = '',
    lockUserType = true
}) {
    const [userType, setUserType] = useState(defaultUserType);
    const [identifier, setIdentifier] = useState(defaultIdentifier);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [priority, setPriority] = useState('normal');
    const [issueType, setIssueType] = useState('password_reset');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [successData, setSuccessData] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setUserType(defaultUserType);
            setIdentifier(defaultIdentifier || '');
            setName('');
            setEmail('');
            setContactInfo('');
            setPriority('normal');
            setError('');
            setSuccessData(null);
            setSubject('');
            setDescription('');
            setIssueType('password_reset');
        }
    }, [isOpen, defaultUserType, defaultIdentifier]);

    if (!isOpen) return null;

    const getSubjectPlaceholder = () => {
        switch (issueType) {
            case 'password_reset':
                return 'e.g. Please reset my account password';
            case 'login_issue':
                return userType === 'faculty' ? 'e.g. Cannot sign in with institutional credentials' : 'e.g. Account activation key expired / Login error';
            case 'subject_allocation':
                return 'e.g. Subject 21CS52 not visible in my assigned courses';
            case 'marks_dispute':
                return userType === 'faculty' ? 'e.g. Need to unlock IA-2 marks for Section A' : 'e.g. IA-1 score discrepancy in Data Structures';
            case 'attendance_issue':
                return userType === 'faculty' ? 'e.g. Attendance locked for 5th semester Section B' : 'e.g. Attendance percentage mismatch in Operating Systems';
            case 'profile_correction':
                return userType === 'faculty' ? 'e.g. Designation update to Associate Professor' : 'e.g. Spelling error in registered name';
            case 'student_record':
                return 'e.g. USN 2AB23CS045 missing from class roster';
            case 'grade_card_issue':
                return 'e.g. Grade card download generates blank PDF';
            case 'reval_query':
                return 'e.g. Re-evaluation status query for 3rd semester';
            case 'course_registration':
                return 'e.g. Unable to select open elective subject';
            case 'report_issue':
                return 'e.g. Excel export error for semester result sheet';
            default:
                return 'e.g. Summary of the problem or request';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);

        let fullDescription = description.trim();
        const metaNotes = [];
        if (priority && priority !== 'normal') {
            metaNotes.push(`Priority: ${priority.toUpperCase()}`);
        }
        if (contactInfo && contactInfo.trim()) {
            metaNotes.push(`Contact: ${contactInfo.trim()}`);
        }
        if (metaNotes.length > 0) {
            fullDescription = `[${metaNotes.join(' | ')}]\n\n${fullDescription}`;
        }

        try {
            const res = await apiRequest('/api/support/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    user_type: userType,
                    user_identifier: identifier,
                    user_name: name.trim() || undefined,
                    user_email: userType === 'faculty' ? (identifier.includes('@') ? identifier.trim() : undefined) : (email.trim() || undefined),
                    issue_type: issueType,
                    subject: subject || (issueType === 'password_reset' ? 'Password Reset Request' : 'Support Request'),
                    description: fullDescription
                })
            });

            setSuccessData(res);
        } catch (err) {
            setError(err.message || 'Failed to submit issue ticket. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const handleReset = () => {
        setSuccessData(null);
        setError('');
        setSubject('');
        setDescription('');
        onClose();
    };

    return (
        <>
        {/* Inject mobile styles */}
        <style>{`
            @keyframes raiseFadeIn { from { opacity:0; transform: scale(0.97); } to { opacity:1; transform: scale(1); } }
            @keyframes raiseSlideUp { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform: translateY(0); } }
            .ri-overlay {
                position: fixed; inset: 0; left: 0; top: 0;
                width: 100vw; height: 100dvh;
                z-index: 9999;
                background: rgba(10, 24, 28, 0.65);
                backdrop-filter: blur(6px);
                display: flex; align-items: center; justify-content: center;
                padding: 16px;
                box-sizing: border-box;
            }
            .ri-dialog {
                background: var(--surface, #ffffff);
                border: 1px solid var(--border, #d1d8da);
                border-radius: 16px;
                max-width: 520px; width: 100%;
                max-height: 90dvh;
                display: flex; flex-direction: column;
                box-shadow: 0 20px 48px rgba(0,0,0,0.22);
                overflow: hidden;
                animation: raiseFadeIn 0.18s ease-out;
            }
            @media (max-width: 600px) {
                .ri-overlay {
                    align-items: flex-end;
                    padding: 0;
                }
                .ri-dialog {
                    border-radius: 20px 20px 0 0;
                    max-width: 100%;
                    max-height: 92dvh;
                    animation: raiseSlideUp 0.22s ease-out;
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                .ri-drag-handle {
                    display: flex !important;
                }
            }
        `}</style>
        <div className="ri-overlay" onClick={onClose}>
            <div className="ri-dialog" role="dialog" aria-modal="true" aria-labelledby="ri-title" onClick={e => e.stopPropagation()}>
                {/* Drag handle (mobile only) */}
                <div className="ri-drag-handle" style={{ display: 'none', justifyContent: 'center', paddingTop: '10px', flexShrink: 0 }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--border, #d1d8da)' }} />
                </div>
                {/* Modal Header */}
                <div style={{
                    padding: '14px 18px', borderBottom: '1px solid var(--border, #d1d8da)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--surface-low, #fdf6ed)', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'var(--primary, #174B4D)', color: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>help_outline</span>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--tx-main, #0a181c)' }}>
                                Institutional Support Desk
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tx-muted, #586c6d)' }}>
                                Raise an issue or request password assistance
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--tx-muted, #586c6d)', borderRadius: '6px',
                            minWidth: '40px', minHeight: '40px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    {successData ? (
                        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
                            <div style={{
                                width: '56px', height: '56px', borderRadius: '50%',
                                background: 'var(--success-bg, #E8F5E9)', color: 'var(--success, #166534)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: '14px', border: '1px solid var(--success-border, #A5D6A7)'
                            }}>
                                <span className="material-icons-round" style={{ fontSize: '32px' }}>check_circle</span>
                            </div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: '700', color: 'var(--tx-main, #0a181c)' }}>
                                Ticket Raised Successfully!
                            </h4>
                            <div style={{
                                background: 'var(--surface-low, #fdf6ed)', border: '1px solid var(--border, #d1d8da)',
                                borderRadius: '10px', padding: '12px 16px', margin: '14px 0 18px 0',
                                display: 'inline-block'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--tx-muted, #586c6d)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Ticket Reference ID
                                </div>
                                <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--primary, #174B4D)', fontFamily: 'monospace' }}>
                                    {successData.ticketNumber}
                                </div>
                            </div>
                            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--tx-muted, #586c6d)', lineHeight: '1.5' }}>
                                Your problem has been queued in the Administrator Terminal. The admin can solve or reset your password immediately.
                            </p>
                            <button
                                onClick={handleReset}
                                style={{
                                    background: 'var(--primary, #174B4D)', color: '#ffffff',
                                    border: 'none', borderRadius: '8px', padding: '10px 24px',
                                    fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {error && (
                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#b91c1c', padding: '10px 14px', borderRadius: '8px',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>error_outline</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* User Type Switcher / Indicator */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '6px' }}>
                                    {lockUserType ? 'Raising issue as:' : 'I am raising this as a:'}
                                </label>
                                {lockUserType ? (
                                    <div
                                        style={{
                                            padding: '8px 14px', minHeight: '44px', borderRadius: '8px', fontSize: '0.88rem', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            border: '2px solid var(--primary, #174B4D)',
                                            background: 'var(--surface-low, #fdf6ed)',
                                            color: 'var(--primary, #174B4D)',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '20px' }}>
                                            {userType === 'faculty' ? 'badge' : 'school'}
                                        </span>
                                        <span style={{ fontWeight: 700 }}>
                                            {userType === 'faculty' ? 'Faculty' : 'Student'}
                                        </span>
                                        <span style={{
                                            marginLeft: 'auto',
                                            fontSize: '0.72rem',
                                            fontWeight: '600',
                                            color: 'var(--tx-muted, #586c6d)',
                                            background: 'rgba(23, 75, 77, 0.08)',
                                            padding: '3px 8px',
                                            borderRadius: '6px'
                                        }}>
                                            {userType === 'faculty' ? 'Faculty Portal' : 'Student Portal'}
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setUserType('student')}
                                            style={{
                                                padding: '8px 12px', minHeight: '44px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                border: userType === 'student' ? '2px solid var(--primary, #174B4D)' : '1px solid var(--border, #d1d8da)',
                                                background: userType === 'student' ? 'var(--surface-low, #fdf6ed)' : '#ffffff',
                                                color: userType === 'student' ? 'var(--primary, #174B4D)' : 'var(--tx-muted, #586c6d)'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>school</span>
                                            Student
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setUserType('faculty')}
                                            style={{
                                                padding: '8px 12px', minHeight: '44px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                border: userType === 'faculty' ? '2px solid var(--primary, #174B4D)' : '1px solid var(--border, #d1d8da)',
                                                background: userType === 'faculty' ? 'var(--surface-low, #fdf6ed)' : '#ffffff',
                                                color: userType === 'faculty' ? 'var(--primary, #174B4D)' : 'var(--tx-muted, #586c6d)'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>badge</span>
                                            Faculty
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Identifier Input */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                    {userType === 'student' ? 'University Seat Number (USN) *' : 'Institutional Email *'}
                                </label>
                                <input
                                    type={userType === 'student' ? 'text' : 'email'}
                                    required
                                    placeholder={userType === 'student' ? 'e.g. 2AB23CS063' : 'e.g. faculty@institution.edu'}
                                    value={identifier}
                                    onChange={(e) => setIdentifier(userType === 'student' ? e.target.value.toUpperCase() : e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                                        border: '1px solid var(--border, #d1d8da)', fontSize: '0.9rem',
                                        background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Contact & Name Details (2-Column Grid) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                        Full Name <span style={{ color: 'var(--tx-muted, #586c6d)', fontWeight: '400' }}>(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={userType === 'faculty' ? 'e.g. Dr. A. K. Sharma' : 'e.g. Rahul Sharma'}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid var(--border, #d1d8da)', fontSize: '0.88rem',
                                            background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                        Contact Phone / Alt. Email <span style={{ color: 'var(--tx-muted, #586c6d)', fontWeight: '400' }}>(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. +91 98765 43210 or personal@gmail.com"
                                        value={contactInfo}
                                        onChange={(e) => setContactInfo(e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid var(--border, #d1d8da)', fontSize: '0.88rem',
                                            background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Issue Category */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                    Issue Category *
                                </label>
                                <select
                                    value={issueType}
                                    onChange={(e) => setIssueType(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                                        border: '1px solid var(--border, #d1d8da)', fontSize: '0.9rem',
                                        background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    {userType === 'faculty' ? (
                                        <>
                                            <option value="password_reset">🔑 Password Reset / Forgot Password</option>
                                            <option value="login_issue">🔒 Account Login / Access Problem</option>
                                            <option value="subject_allocation">📚 Subject Assignment / Missing Subject</option>
                                            <option value="marks_dispute">📊 Marks Submission / IA Entry Discrepancy</option>
                                            <option value="attendance_issue">📅 Attendance Entry / Freeze Issue</option>
                                            <option value="profile_correction">📝 Profile / Name / Department Correction</option>
                                            <option value="student_record">🎓 Student Lookup / Class Roster Issue</option>
                                            <option value="report_issue">📑 Report Card / Excel Export Error</option>
                                            <option value="other">💬 Other Inquiry / Technical Issue</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="password_reset">🔑 Password Reset / Forgot Password</option>
                                            <option value="login_issue">🔒 Account Activation / Login Problem</option>
                                            <option value="marks_dispute">📊 Internal / External Marks Discrepancy</option>
                                            <option value="attendance_issue">📅 Attendance Shortage / Discrepancy</option>
                                            <option value="profile_correction">📝 Profile / Name / USN Correction</option>
                                            <option value="grade_card_issue">📄 Grade Sheet / Transcript Download Issue</option>
                                            <option value="reval_query">🔄 Re-evaluation / Make-up Exam Query</option>
                                            <option value="course_registration">📋 Course / Elective Registration Issue</option>
                                            <option value="other">💬 Other Inquiry / Technical Issue</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {/* Urgency / Priority */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '6px' }}>
                                    Urgency Level
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setPriority('normal')}
                                        style={{
                                            padding: '7px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                                            cursor: 'pointer', border: priority === 'normal' ? '2px solid #059669' : '1px solid var(--border, #d1d8da)',
                                            background: priority === 'normal' ? '#ecfdf5' : '#ffffff',
                                            color: priority === 'normal' ? '#047857' : 'var(--tx-muted, #586c6d)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                                        Normal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPriority('high')}
                                        style={{
                                            padding: '7px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                                            cursor: 'pointer', border: priority === 'high' ? '2px solid #d97706' : '1px solid var(--border, #d1d8da)',
                                            background: priority === 'high' ? '#fffbeb' : '#ffffff',
                                            color: priority === 'high' ? '#b45309' : 'var(--tx-muted, #586c6d)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                                        High
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPriority('urgent')}
                                        style={{
                                            padding: '7px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                                            cursor: 'pointer', border: priority === 'urgent' ? '2px solid #dc2626' : '1px solid var(--border, #d1d8da)',
                                            background: priority === 'urgent' ? '#fef2f2' : '#ffffff',
                                            color: priority === 'urgent' ? '#b91c1c' : 'var(--tx-muted, #586c6d)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                                        Urgent
                                    </button>
                                </div>
                            </div>

                            {/* Subject */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                    Brief Summary / Subject *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder={getSubjectPlaceholder()}
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                                        border: '1px solid var(--border, #d1d8da)', fontSize: '0.9rem',
                                        background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--tx-main, #0a181c)', marginBottom: '4px' }}>
                                    Description of the Problem *
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Provide any details that will help the administrator assist you (e.g. subject code, semester, error message, exact details)..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                                        border: '1px solid var(--border, #d1d8da)', fontSize: '0.9rem',
                                        background: '#ffffff', color: 'var(--tx-main, #0a181c)',
                                        fontFamily: 'inherit', resize: 'vertical',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Submit Button */}
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        flex: 1, padding: '11px', minHeight: '44px', borderRadius: '8px',
                                        border: '1px solid var(--border, #d1d8da)', background: '#ffffff',
                                        color: 'var(--tx-muted, #586c6d)', fontWeight: '600',
                                        cursor: 'pointer', fontSize: '0.9rem'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={busy}
                                    style={{
                                        flex: 2, padding: '11px', minHeight: '44px', borderRadius: '8px',
                                        border: 'none', background: 'var(--primary, #174B4D)',
                                        color: '#ffffff', fontWeight: '600',
                                        cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
                                        opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: '8px'
                                    }}
                                >
                                    {busy ? (
                                        <>
                                            <span className="material-icons-round" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>send</span>
                                            Submit to Admin
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
        </>
    );
}
