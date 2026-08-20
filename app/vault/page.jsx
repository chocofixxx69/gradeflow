'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { Button } from '@/components/ui/Foundation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { TableWrapper, Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';

const GP = { 'O': 10, 'S': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0, 'Ab': 0 };

function BatchUploadContent() {
    const router = useRouter();
    const [step, setStep] = useState(1); // 1=select, 2=upload, 3=results
    const [scheme, setScheme] = useState('2022');
    const [semesterCount, setSemesterCount] = useState(0);
    const [files, setFiles] = useState({});
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [errors, setErrors] = useState([]);
    const [progress, setProgress] = useState('');
    const inputRefs = useRef({});

    const handleFileSelect = useCallback((semester, file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.pdf')) return;
        if (file.size > 30 * 1024 * 1024) return;
        setFiles(prev => ({ ...prev, [semester]: file }));
    }, []);

    const removeFile = useCallback((semester) => {
        setFiles(prev => {
            const next = { ...prev };
            delete next[semester];
            return next;
        });
    }, []);

    const handleProceed = () => {
        if (!semesterCount || semesterCount < 1) return;
        setStep(2);
    };

    const handleBatchUpload = async () => {
        const fileEntries = Object.entries(files);
        if (fileEntries.length === 0) return;

        setLoading(true);
        setProgress('Preparing PDFs for analysis...');
        setErrors([]);
        setResults(null);

        try {
            const fd = new FormData();
            fd.append('scheme', scheme);

            // Add files in semester order
            let idx = 0;
            for (const [sem, file] of fileEntries.sort(([a], [b]) => a - b)) {
                fd.append('pdfs', file);
                fd.append(`semester_${idx}`, sem);
                idx++;
            }

            setProgress(`Processing ${fileEntries.length} PDF(s)... This may take a moment.`);

            const res = await fetch('/api/batch-parse', {
                method: 'POST',
                body: fd,
            });
            const json = await res.json();

            if (!json.success) {
                setErrors(json.errors || [{ error: json.error || 'Processing failed.' }]);
                setProgress('');
                setLoading(false);
                return;
            }

            const data = json.data;
            setResults(data);
            setErrors(data.errors || []);

            // Auto-save to database if student is logged in
            const stuSession = localStorage.getItem('student_session');
            if (stuSession && data.semesters?.length > 0) {
                setProgress('Saving results to your academic record...');
                const student = JSON.parse(stuSession);
                const usn = student.usn?.toUpperCase();

                if (usn) {
                    try {
                        // Ensure student profile exists
                        const { data: profile } = await supabase
                            .from('students')
                            .select('id')
                            .eq('usn', usn)
                            .maybeSingle();

                        if (profile) {
                            for (const semResult of data.semesters) {
                                const marksData = semResult.subjects.map(s => ({
                                    student_id: profile.id,
                                    student_usn: usn,
                                    subject_code: s.code,
                                    subject_name: s.name || s.code,
                                    cie_marks: s.internal || 0,
                                    see_marks: s.external || 0,
                                    total_marks: s.total || ((s.internal || 0) + (s.external || 0)),
                                    grade: s.grade || 'P',
                                    credits: s.credits || 3,
                                    semester: semResult.semester,
                                    sync_source: 'BATCH_PDF_UPLOAD',
                                }));

                                await supabase
                                    .from('marks')
                                    .upsert(marksData, { onConflict: 'student_id,subject_code,semester', ignoreDuplicates: true });
                            }

                            // Update student name if found
                            const firstName = data.studentInfo?.name;
                            if (firstName && firstName !== usn && firstName.length > 2) {
                                await apiRequest('/api/student/profile', {
                                    method: 'PATCH',
                                    headers: { 'x-student-usn': usn },
                                    body: JSON.stringify({ name: firstName, scheme })
                                });
                            }
                        }
                    } catch (saveErr) {
                        console.error('Auto-save error:', saveErr);
                    }
                }
            }

            setStep(3);
            setProgress('');
        } catch (err) {
            console.error('Batch upload error:', err);
            setErrors([{ error: 'Network error. Please try again.' }]);
        } finally {
            setLoading(false);
            setProgress('');
        }
    };

    const uploadedCount = Object.keys(files).length;

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1000px', margin: '0 auto' },
        label: { fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-2)', display: 'block' },
        select: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-4)', padding: 'var(--space-4)', fontSize: '15px', fontWeight: 600,
            color: 'var(--tx-main)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
            appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378716C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
        },
        semCard: (hasFile) => ({
            background: hasFile ? 'var(--green-bg)' : 'var(--surface-low)',
            border: `2px ${hasFile ? 'solid var(--green)' : 'dashed var(--border)'}`,
            borderRadius: 'var(--radius-6)', padding: 'var(--space-6)', cursor: 'pointer',
            transition: 'all 0.2s', textAlign: 'center',
            minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }),
        gradePill: (g) => ({
            display: 'inline-block', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-2)', fontSize: '9px', fontWeight: 900,
            background: (g === 'F' || g === 'Ab') ? 'var(--red-bg)' : (g === 'O' || g === 'S' || g === 'A+') ? 'var(--green-bg)' : 'var(--surface-low)',
            color: (g === 'F' || g === 'Ab') ? 'var(--red)' : (g === 'O' || g === 'S' || g === 'A+') ? 'var(--green)' : 'var(--tx-main)',
        }),
        cgpaBar: {
            background: 'var(--primary)', borderRadius: 'var(--radius-7)',
            padding: 'clamp(24px, 4vw, 40px)', color: 'var(--bg)', marginBottom: 'var(--space-8)',
        },
        steps: {
            display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px', marginBottom: 'var(--space-9)',
        },
        stepItem: (active, done) => ({
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-5)',
            fontSize: '13px', fontWeight: active ? 800 : 600,
            color: active ? 'var(--tx-main)' : done ? 'var(--green)' : 'var(--tx-dim)',
        }),
        stepDot: (active, done) => ({
            width: '28px', height: '28px', borderRadius: '50%',
            background: done ? 'var(--green)' : active ? 'var(--primary)' : 'var(--surface-low)',
            color: done || active ? 'var(--bg)' : 'var(--tx-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 900, flexShrink: 0,
        }),
        stepLine: (done) => ({
            width: '40px', height: '2px',
            background: done ? 'var(--green)' : 'var(--border)',
        }),
    };

    // STEP INDICATOR
    const StepIndicator = () => (
        <div style={s.steps}>
            <div style={s.stepItem(step === 1, step > 1)}>
                <div style={s.stepDot(step === 1, step > 1)}>
                    {step > 1 ? <span className="material-icons-round" style={{ fontSize: '16px' }}>check</span> : '1'}
                </div>
                <span>Configure</span>
            </div>
            <div style={s.stepLine(step > 1)} />
            <div style={s.stepItem(step === 2, step > 2)}>
                <div style={s.stepDot(step === 2, step > 2)}>
                    {step > 2 ? <span className="material-icons-round" style={{ fontSize: '16px' }}>check</span> : '2'}
                </div>
                <span>Upload</span>
            </div>
            <div style={s.stepLine(step > 2)} />
            <div style={s.stepItem(step === 3, false)}>
                <div style={s.stepDot(step === 3, false)}>3</div>
                <span>Results</span>
            </div>
        </div>
    );

    return (
        <div style={s.page} className="gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Batch Analysis Engine</PageHeaderEyebrow>
                <PageHeaderTitle>Multi-Semester CGPA Calculator</PageHeaderTitle>
                <PageHeaderSubtitle>
                    Upload result PDFs for multiple semesters at once. Get instant SGPA per semester and your overall CGPA — with duplicate detection and full validation.
                </PageHeaderSubtitle>
            </PageHeader>

            <StepIndicator />

            {/* STEP 1: Configuration */}
            {step === 1 && (
                <Card style={{ padding: 'clamp(24px, 4vw, 48px)' }} className="gf-fade-up">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                        <div>
                            <label style={s.label}>Select Scheme</label>
                            <select aria-label="Select scheme" style={s.select} value={scheme} onChange={e => setScheme(e.target.value)}>
                                <option value="">Choose Scheme</option>
                                <option value="2022">2022 Scheme (NEP)</option>
                                <option value="2025">2025 Scheme (Modern)</option>
                            </select>
                        </div>
                        <div>
                            <label style={s.label}>Number of Semesters</label>
                            <select aria-label="Number of semesters" style={s.select} value={semesterCount} onChange={e => setSemesterCount(parseInt(e.target.value) || 0)}>
                                <option value="0">Select semesters (1–8)</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                    <option key={n} value={n}>{n} Semester{n > 1 ? 's' : ''}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <Button
                        variant="primary"
                        fullWidth
                        onClick={handleProceed}
                        disabled={!scheme || !semesterCount}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>arrow_forward</span>
                        Proceed to Upload
                    </Button>
                </Card>
            )}

            {/* STEP 2: Upload PDFs */}
            {step === 2 && (
                <div className="gf-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)' }}>Upload Semester Results</div>
                            <div style={{ fontSize: '13px', color: 'var(--tx-muted)', marginTop: 'var(--space-1)' }}>Scheme: {scheme} · {uploadedCount}/{semesterCount} uploaded</div>
                        </div>
                        <Button
                            onClick={() => { setStep(1); setFiles({}); }}
                            variant="ghost"
                        >
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>arrow_back</span>
                            Back
                        </Button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
                        {Array.from({ length: semesterCount }, (_, i) => i + 1).map(sem => {
                            const file = files[sem];
                            return (
                                <div
                                    key={sem}
                                    style={s.semCard(!!file)}
                                    role="button"
                                    tabIndex={file ? -1 : 0}
                                    aria-label={file ? `Semester ${sem} PDF selected: ${file.name}` : `Choose PDF for semester ${sem}`}
                                    onClick={() => !file && inputRefs.current[sem]?.click()}
                                    onKeyDown={(event) => {
                                        if (!file && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            inputRefs.current[sem]?.click();
                                        }
                                    }}
                                >
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        ref={el => inputRefs.current[sem] = el}
                                        style={{ display: 'none' }}
                                        aria-label={`Semester ${sem} PDF`}
                                        onChange={e => handleFileSelect(sem, e.target.files[0])}
                                    />
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: file ? 'var(--green)' : 'var(--tx-main)', marginBottom: '8px' }}>
                                        Semester {sem}
                                    </div>
                                    {file ? (
                                        <>
                                            <span className="material-icons-round" style={{ fontSize: '24px', color: 'var(--green)', marginBottom: '6px' }}>check_circle</span>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {file.name}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); removeFile(sem); if (inputRefs.current[sem]) inputRefs.current[sem].value = ''; }}
                                                style={{ marginTop: '8px', minHeight: '44px', padding: '0 var(--space-3)', background: 'none', border: 'none', color: 'var(--red)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                                            >
                                                Remove
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)', marginBottom: '6px' }}>upload_file</span>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)' }}>Choose PDF</div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {progress && (
                        <div style={{
                            padding: '14px 20px', borderRadius: '12px', marginBottom: '24px', fontSize: '13px', fontWeight: 700,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
                            color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.2)',
                            display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                            <span className="material-icons-round gf-spin" style={{ fontSize: '18px' }}>sync</span>
                            {progress}
                        </div>
                    )}

                    {errors.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            {errors.map((e, i) => (
                                <div key={i} style={{
                                    padding: '10px 16px', borderRadius: '10px', marginBottom: '8px', fontSize: '12px', fontWeight: 700,
                                    background: 'var(--red-bg)', color: 'var(--red)',
                                }}>
                                    {e.semester ? `Semester ${e.semester}: ` : ''}{e.error}
                                </div>
                            ))}
                        </div>
                    )}

                    <Button
                        onClick={handleBatchUpload}
                        disabled={uploadedCount === 0 || loading}
                        loading={loading}
                        fullWidth
                    >
                        {loading ? 'Analyzing PDFs...' : (
                            <>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>insights</span>
                                Calculate CGPA ({uploadedCount} PDF{uploadedCount !== 1 ? 's' : ''})
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* STEP 3: Results */}
            {step === 3 && results && (
                <div className="gf-fade-up">
                    {/* CGPA Summary Bar */}
                    <div style={s.cgpaBar}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '4px' }}>
                                    Overall CGPA
                                </div>
                                <div style={{ fontSize: 'clamp(40px, 8vw, 64px)', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>
                                    {results.cgpa?.toFixed(2) || '0.00'}
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: 600, opacity: 0.5, marginTop: '8px' }}>
                                    {results.percentage}% · {results.classification}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.6 }}>
                                    {results.totalSemesters} Semester{results.totalSemesters > 1 ? 's' : ''} · {results.totalSubjects} Subjects · {results.totalCredits} Credits
                                </div>
                                {results.studentInfo?.name && (
                                    <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '8px' }}>
                                        {results.studentInfo.name}
                                        {results.studentInfo.usn && ` · ${results.studentInfo.usn}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SGPA per semester overview */}
                    <div className="gf-stats-grid" style={{ marginBottom: '32px' }}>
                        {results.semesters.map(sem => (
                            <div key={sem.semester} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: '16px', padding: '20px', textAlign: 'center',
                            }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                    Sem {sem.semester}
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: sem.sgpa >= 7.5 ? 'var(--green)' : sem.sgpa >= 5 ? 'var(--tx-main)' : 'var(--amber)', letterSpacing: '-0.03em' }}>
                                    {sem.sgpa.toFixed(2)}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px', fontWeight: 600 }}>
                                    {sem.subjectCount} subj · {sem.totalCredits} cr
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Per-Semester Detailed Tables */}
                    {results.semesters.map(sem => (
                        <Card key={sem.semester} style={{ marginBottom: 'var(--space-5)' }}>
                            <CardHeader style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    Semester {sem.semester}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>{sem.fileName}</span>
                                    <span style={{
                                        fontSize: '12px', fontWeight: 800, color: 'var(--primary)',
                                        background: 'var(--surface-low)', padding: '4px 12px', borderRadius: '8px',
                                    }}>
                                        SGPA: {sem.sgpa.toFixed(2)}
                                    </span>
                                </div>
                            </CardHeader>
                            <TableWrapper style={{ border: 'none', borderRadius: 0 }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            {['Subject', 'Credits', 'CIE', 'SEE', 'Total', 'Grade'].map((h, i) => (
                                                <TableHeader key={h} align={i > 0 ? 'center' : 'left'}>{h}</TableHeader>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sem.subjects.map((sub, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>
                                                    <div style={{ fontWeight: 700 }}>{sub.name || sub.code || 'Unknown'}</div>
                                                    <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--tx-dim)', marginTop: '2px' }}>{sub.code || ''}</div>
                                                </TableCell>
                                                <TableCell align="center">{sub.credits || 3}</TableCell>
                                                <TableCell align="center">{sub.internal ?? '—'}</TableCell>
                                                <TableCell align="center">{sub.external ?? '—'}</TableCell>
                                                <TableCell align="center" style={{ fontWeight: 800 }}>{sub.total ?? '—'}</TableCell>
                                                <TableCell align="center">
                                                    <span style={s.gradePill(sub.grade)}>{sub.grade || '—'}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableWrapper>
                        </Card>
                    ))}

                    {/* Actions */}
                    <div className="gf-actions" style={{ display: 'flex', justifyContent: 'center', marginTop: '32px', gap: '12px' }}>
                        <Button
                            variant="ghost"
                            onClick={() => { setStep(1); setFiles({}); setResults(null); setErrors([]); }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>refresh</span>
                            Start New Calculation
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => router.push('/dashboard')}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>space_dashboard</span>
                            Go to Dashboard
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BatchUploadPage() {
    return (
        <AuthGuard role="any">
            <BatchUploadContent />
        </AuthGuard>
    );
}
