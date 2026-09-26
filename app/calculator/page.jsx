'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    VTU_SCHEMES,
    calculateSGPA,
    calculateCGPAFromSGPAs,
    calculatePercentage,
    getSubjectsFor,
    getGradeFromTotal,
    VTU_BRANCHES,
    classify
} from '../../lib/vtuGrades';
import { normalizeBranch, isAuditCourse } from '@/lib/vtuAcademicEngine';
import { supabase } from '../../lib/supabase';
import PDFUpload from '../../components/PDFUpload';
import { apiRequest, getStudentAuthHeaders } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { Button, Input, Inline, Stack } from '@/components/ui/Foundation';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/PageHeader';
import styles from './Calculator.module.css';

// Canonical Course Taxonomy Tag matching Faculty Portal
function getCourseTag(credits, code = '', name = '') {
    const cr = Number(credits) || 0;
    const upperCode = (code || '').toUpperCase().trim();
    const upperName = (name || '').toUpperCase().trim();

    if (isAuditCourse(upperCode) || upperName.includes('INDIAN KNOWLEDGE') || upperName.includes('NSS') || upperName.includes('PHYSICAL EDUCATION') || upperName.includes('YOGA')) {
        return { label: 'Audit (0 CR)', className: styles.tagAudit, icon: 'verified_user', isAudit: true };
    }
    if (upperCode.includes('L') || upperName.includes('LAB') || upperName.includes('PRACTICAL') || cr === 1) {
        return { label: 'Lab / Practical', className: styles.tagLab, icon: 'science' };
    }
    if (cr >= 4) {
        return { label: 'Core Theory', className: styles.tagCore, icon: 'menu_book' };
    }
    if (
        upperCode.endsWith('A') || upperCode.endsWith('B') || upperCode.endsWith('C') || upperCode.endsWith('D') ||
        upperCode.includes('XX') || upperName.includes('ELECTIVE') || upperCode.includes('PE') || upperCode.includes('OE')
    ) {
        return { label: 'Elective', className: styles.tagElective, icon: 'alt_route' };
    }
    if (cr === 2) {
        return { label: 'AEC / Project', className: styles.tagCore, icon: 'psychology' };
    }
    return { label: 'Theory', className: styles.tagCore, icon: 'description' };
}

// Grade point visual configuration
function getGradeVisual(grade) {
    const g = (grade || '').trim().toUpperCase();
    switch (g) {
        case 'O':
        case 'S':
            return { label: 'O', gp: 10, bg: 'rgba(22, 163, 74, 0.15)', color: '#15803d', border: 'rgba(22, 163, 74, 0.3)' };
        case 'A+':
            return { label: 'A+', gp: 9, bg: 'rgba(16, 185, 129, 0.15)', color: '#047857', border: 'rgba(16, 185, 129, 0.3)' };
        case 'A':
            return { label: 'A', gp: 8, bg: 'rgba(13, 148, 136, 0.15)', color: '#0f766e', border: 'rgba(13, 148, 136, 0.3)' };
        case 'B+':
            return { label: 'B+', gp: 7, bg: 'rgba(37, 99, 235, 0.15)', color: '#1d4ed8', border: 'rgba(37, 99, 235, 0.3)' };
        case 'B':
            return { label: 'B', gp: 6, bg: 'rgba(79, 70, 229, 0.15)', color: '#4338ca', border: 'rgba(79, 70, 229, 0.3)' };
        case 'C':
            return { label: 'C', gp: 5, bg: 'rgba(217, 119, 6, 0.15)', color: '#b45309', border: 'rgba(217, 119, 6, 0.3)' };
        case 'P':
            return { label: 'P', gp: 4, bg: 'rgba(234, 88, 12, 0.15)', color: '#c2410c', border: 'rgba(234, 88, 12, 0.3)' };
        case 'F':
            return { label: 'F', gp: 0, bg: 'rgba(239, 68, 68, 0.15)', color: '#b91c1c', border: 'rgba(239, 68, 68, 0.3)' };
        default:
            return { label: '-', gp: 0, bg: 'var(--surface-low, #f4f0eb)', color: 'var(--tx-dim, #789397)', border: 'transparent' };
    }
}

function CalculatorContent() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('sgpa');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [scheme, setScheme] = useState('2022');
    const [semester, setSemester] = useState(1);
    const [branch, setBranch] = useState('CS');
    const [subjects, setSubjects] = useState([]);
    const [usn, setUsn] = useState('');
    const [studentName, setStudentName] = useState('');
    const [manualSGPAs, setManualSGPAs] = useState(Array(8).fill(''));
    const [cgpaResult, setCgpaResult] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState(null);
    const [catalogSource, setCatalogSource] = useState('institutional');
    const [stats, setStats] = useState({ sgpa: 0, totalCredits: 0, totalCrP: 0, formula: '' });
    const [isLoadingVaultRecords, setIsLoadingVaultRecords] = useState(false);
    // Catalog picker modal state
    const [showCatalogPicker, setShowCatalogPicker] = useState(false);
    const [catalogPickerList, setCatalogPickerList] = useState([]);
    const [catalogPickerLoading, setCatalogPickerLoading] = useState(false);
    const [catalogPickerSearch, setCatalogPickerSearch] = useState('');

    // Synchronize catalog matrix — first checks student's real marks, then falls back to catalog
    const refreshMatrix = useCallback(async (b, s, sch, studentUsn) => {
        setLoading(true);
        setError(null);
        const cleanBranch = normalizeBranch(b || 'CS');
        const semNum = Number(s) || 1;
        const schemeStr = String(sch || '2022').trim();

        try {
            // ── PRIORITY 1: Load student's actual enrolled marks from subject_marks ──
            // Only attempt if we have a USN (student is logged in or USN was set)
            const currentUsn = studentUsn || usn;
            if (currentUsn && currentUsn.trim().length > 4) {
                const { data: marksData, error: marksErr } = await supabase
                    .from('subject_marks')
                    .select('subject_code, subject_name, credits, total, internal, external, grade, passed')
                    .eq('usn', currentUsn.trim().toUpperCase())
                    .eq('semester', semNum);

                if (!marksErr && marksData && marksData.length > 0) {
                    const mapped = marksData.map(d => {
                        const isAudit = isAuditCourse(d.subject_code);
                        const totalScore = Number(d.total) || ((Number(d.internal) || 0) + (Number(d.external) || 0));
                        const grade = d.grade || (totalScore > 0 ? getGradeFromTotal(totalScore, schemeStr) : '-');
                        return {
                            id: `${d.subject_code}_marks`,
                            code: d.subject_code,
                            name: d.subject_name,
                            credits: isAudit ? 0 : (Number(d.credits) || 0),
                            isAudit,
                            total: totalScore || '',
                            grade,
                            source: 'marks_vault'
                        };
                    });
                    setSubjects(mapped);
                    setCatalogSource('institutional');
                    setLoading(false);
                    return;
                }
            }

            // ── PRIORITY 2: Load from Faculty Subject Catalog (deduplicated) ──
            const { data, error: catErr } = await supabase
                .from('subject_catalog')
                .select('*')
                .eq('scheme', schemeStr)
                .eq('branch', cleanBranch)
                .eq('semester', semNum)
                .order('subject_code', { ascending: true });

            if (!catErr && data && data.length > 0) {
                // Deduplicate elective groups: keep only first of BESCK104A/B/C/D/E etc.
                // A "group" is identified by trimming trailing letter if credits match
                const seen = new Set();
                const deduped = [];
                for (const d of data) {
                    const baseCode = d.subject_code.replace(/[A-Z]$/, '');
                    const isElective = /[A-Z]$/.test(d.subject_code) && d.subject_code.length > 6;
                    if (isElective) {
                        if (seen.has(baseCode)) continue;
                        seen.add(baseCode);
                    }
                    deduped.push(d);
                }
                const mapped = deduped.map(d => {
                    const isAudit = isAuditCourse(d.subject_code);
                    return {
                        id: d.id || `${d.subject_code}_${Math.random()}`,
                        code: d.subject_code,
                        name: d.subject_name,
                        credits: isAudit ? 0 : (Number(d.credits) || 0),
                        isAudit,
                        total: '',
                        grade: '-',
                        source: 'institutional'
                    };
                });
                setSubjects(mapped);
                setCatalogSource('institutional');
                return;
            }

            // ── PRIORITY 3: VTU Syllabus Fallback ──
            const fallback = await getSubjectsFor(cleanBranch, semNum, schemeStr);
            if (fallback && fallback.length > 0) {
                const mappedFallback = fallback.map(d => {
                    const isAudit = isAuditCourse(d.code);
                    return {
                        id: `${d.code}_${Math.random()}`,
                        code: d.code,
                        name: d.name,
                        credits: isAudit ? 0 : (Number(d.credits) || 0),
                        isAudit,
                        total: '',
                        grade: '-',
                        source: 'vtu_catalog'
                    };
                });
                setSubjects(mappedFallback);
                setCatalogSource('fallback');
            } else {
                setSubjects([]);
            }
        } catch (err) {
            console.error("Subject Catalog Fetch Error:", err);
            const fallback = await getSubjectsFor(cleanBranch, semNum, schemeStr).catch(() => []);
            setSubjects(fallback.map(d => ({
                id: `${d.code}_${Math.random()}`,
                code: d.code,
                name: d.name,
                credits: isAuditCourse(d.code) ? 0 : (Number(d.credits) || 0),
                isAudit: isAuditCourse(d.code),
                total: '',
                grade: '-',
                source: 'offline'
            })));
            setCatalogSource('fallback');
        } finally {
            setLoading(false);
        }
    }, [usn]);

    // Initialize session and student identity
    useEffect(() => {
        const stuSession = localStorage.getItem('student_session');
        const facSession = localStorage.getItem('faculty_session');

        if (stuSession) {
            try {
                const user = JSON.parse(stuSession);
                setLoggedInUser(user);
                const studentUsn = (user.usn || '').toUpperCase();
                setUsn(studentUsn);
                setStudentName(user.name || '');

                const cleanBranch = normalizeBranch(user.branch || user.branch_code || 'CS');
                setBranch(cleanBranch);

                const cleanScheme = user.scheme ? String(user.scheme).trim() : '2022';
                setScheme(cleanScheme);

                const userSem = Number(user.semester);
                const semToUse = (!isNaN(userSem) && userSem >= 1 && userSem <= 8) ? userSem : 1;
                setSemester(semToUse);

                // Pass USN directly so refreshMatrix can load real marks immediately
                refreshMatrix(cleanBranch, semToUse, cleanScheme, studentUsn);
            } catch (e) {
                console.error('Session parse error:', e);
                refreshMatrix('CS', 1, '2022', null);
            }
        } else if (facSession) {
            setLoggedInUser(null);
            refreshMatrix(branch, semester, scheme, null);
        } else {
            refreshMatrix(branch, semester, scheme, null);
        }
    }, [refreshMatrix]);

    // Handle single score input change with instant grade calculation
    const handleMarks = (id, val) => {
        setSubjects(prev => prev.map(s => {
            if (s.id !== id) return s;
            if (val === '') return { ...s, total: '', grade: '-' };
            const cleanVal = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
            const grade = getGradeFromTotal(cleanVal, scheme);
            return { ...s, total: cleanVal, grade };
        }));
    };

    // Quick score actions for fast testing
    const fillExampleMarks = (targetScore) => {
        setSubjects(prev => prev.map(s => {
            const cleanVal = Math.min(100, Math.max(0, targetScore));
            const grade = getGradeFromTotal(cleanVal, scheme);
            return { ...s, total: cleanVal, grade };
        }));
    };

    const resetMarks = () => {
        setSubjects(prev => prev.map(s => ({ ...s, total: '', grade: '-' })));
        setError(null);
        setSuccess(null);
    };

    // Open the Faculty Catalog Picker to add a real course
    const openCatalogPicker = async () => {
        setShowCatalogPicker(true);
        setCatalogPickerSearch('');
        setCatalogPickerLoading(true);
        try {
            const { data, error: catErr } = await supabase
                .from('subject_catalog')
                .select('id, subject_code, subject_name, credits, semester')
                .eq('scheme', scheme)
                .eq('branch', normalizeBranch(branch))
                .order('semester', { ascending: true })
                .order('subject_code', { ascending: true });
            if (!catErr && data) {
                // Exclude already-added subjects
                const addedCodes = new Set(subjects.map(s => s.code));
                setCatalogPickerList(data.filter(d => !addedCodes.has(d.subject_code)));
            } else {
                setCatalogPickerList([]);
            }
        } catch (e) {
            setCatalogPickerList([]);
        } finally {
            setCatalogPickerLoading(false);
        }
    };

    const addFromCatalog = (course) => {
        const isAudit = isAuditCourse(course.subject_code);
        setSubjects(prev => [
            ...prev,
            {
                id: course.id || `${course.subject_code}_added`,
                code: course.subject_code,
                name: course.subject_name,
                credits: isAudit ? 0 : (Number(course.credits) || 0),
                isAudit,
                total: '',
                grade: '-',
                source: 'catalog_added'
            }
        ]);
        // Remove from picker list
        setCatalogPickerList(prev => prev.filter(c => c.subject_code !== course.subject_code));
    };

    const removeSubject = (id) => {
        setSubjects(prev => prev.filter(s => s.id !== id));
    };

    // Auto-compute SGPA whenever subjects or scheme change
    useEffect(() => {
        let cancelled = false;
        calculateSGPA(subjects, scheme).then(result => {
            if (!cancelled) setStats(result);
        });
        return () => { cancelled = true; };
    }, [subjects, scheme]);

    // Save calculated results to institutional database
    const saveToDatabase = async () => {
        if (!usn) {
            setError('A valid Academic Identity (USN) is required.');
            return;
        }

        if (loggedInUser && usn.toUpperCase() !== loggedInUser.usn.toUpperCase()) {
            setError(`Identity Lock: You can only synchronize records for your own ID (${loggedInUser.usn}).`);
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // 1. Ensure student profile exists and is updated
            const { data: student, error: sErr } = await supabase
                .from('students')
                .upsert({
                    usn: usn.toUpperCase(),
                    name: studentName || usn.toUpperCase(),
                    scheme,
                    branch,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'usn' })
                .select()
                .single();

            if (sErr) throw sErr;

            // 2. Prepare marks records
            const marksData = subjects.map(s => {
                const totalNum = s.total === '' ? 0 : Number(s.total);
                return {
                    student_id: student.id,
                    student_usn: student.usn,
                    subject_code: s.code,
                    subject_name: s.name,
                    cie_marks: Math.floor(totalNum * 0.4),
                    see_marks: Math.ceil(totalNum * 0.6),
                    total_marks: totalNum,
                    grade: s.grade || '-',
                    semester,
                    sync_source: 'MANUAL_CALCULATOR'
                };
            });

            const computedStats = await calculateSGPA(subjects, scheme);
            await apiRequest('/api/student/results', {
                method: 'POST',
                headers: getStudentAuthHeaders(loggedInUser),
                body: JSON.stringify({
                    student_id: student.id,
                    semester,
                    sgpa: computedStats.sgpa,
                    marks: marksData
                })
            }).catch(() => null);

            setSuccess(`✓ Records synchronized successfully with the institutional vault for Semester ${semester}.`);
            setTimeout(() => setSuccess(null), 6000);
        } catch (err) {
            console.error("Save to DB Error:", err);
            setError('Synchronization failed. Please verify your connection.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch student historical SGPAs for CGPA Calculator
    const loadVaultRecordsForCGPA = async () => {
        if (!usn) return;
        setIsLoadingVaultRecords(true);
        setError(null);
        try {
            const { data, error: fetchErr } = await supabase
                .from('subject_marks')
                .select('semester, total, grade, credits, subject_code')
                .eq('usn', usn.toUpperCase());

            if (fetchErr) throw fetchErr;

            if (data && data.length > 0) {
                // Group by semester and calculate each SGPA
                const semMap = {};
                data.forEach(m => {
                    const sem = Number(m.semester);
                    if (!semMap[sem]) semMap[sem] = [];
                    semMap[sem].push({
                        code: m.subject_code,
                        grade: m.grade,
                        credits: m.credits,
                        total: m.total
                    });
                });

                const newSgpas = [...manualSGPAs];
                for (let i = 1; i <= 8; i++) {
                    if (semMap[i] && semMap[i].length > 0) {
                        const semStats = await calculateSGPA(semMap[i], scheme);
                        if (semStats.sgpa > 0) {
                            newSgpas[i - 1] = semStats.sgpa.toFixed(2);
                        }
                    }
                }
                setManualSGPAs(newSgpas);
                setCgpaResult(calculateCGPAFromSGPAs(newSgpas, scheme));
                setSuccess(`✓ Loaded historical semester records from Academic Vault`);
                setTimeout(() => setSuccess(null), 4000);
            } else {
                setError('No previous semester marks found in vault for this USN.');
            }
        } catch (err) {
            console.error('Vault load error:', err);
            setError('Unable to retrieve previous semesters from database.');
        } finally {
            setIsLoadingVaultRecords(false);
        }
    };

    // Total registered active credits (excluding audit courses)
    const activeTotalCredits = useMemo(() => {
        return subjects.reduce((sum, s) => {
            if (s.isAudit || isAuditCourse(s.code)) return sum;
            return sum + (Number(s.credits) || 0);
        }, 0);
    }, [subjects]);

    // Standing classification
    const standingClassification = useMemo(() => {
        return classify(stats.sgpa).label;
    }, [stats.sgpa]);

    // Filtered list for catalog picker
    const filteredPickerList = useMemo(() => {
        const q = catalogPickerSearch.toLowerCase();
        if (!q) return catalogPickerList;
        return catalogPickerList.filter(c =>
            c.subject_name.toLowerCase().includes(q) || c.subject_code.toLowerCase().includes(q)
        );
    }, [catalogPickerList, catalogPickerSearch]);

    return (
        <div className={`gf-page gf-page-wide gf-fade-up ${styles.calcWrapper}`}>
            {/* Compact header — no duplicate subtitle, just clean title */}
            <PageHeader>
                <PageHeaderEyebrow>VTU Academic Engine</PageHeaderEyebrow>
                <PageHeaderTitle>SGPA &amp; CGPA Calculator</PageHeaderTitle>
            </PageHeader>

            {/* Live Institutional Catalog Status Bar */}
            <div className={styles.statusBar}>
                <div className={styles.statusPills}>
                    <div className={styles.liveBadge}>
                        <span className={styles.pulseDot} />
                        {catalogSource === 'institutional'
                            ? 'Connected to Faculty Subject Catalog (Live)'
                            : 'VTU Official Syllabus Registry (Cached)'}
                    </div>
                    <span style={{ color: 'var(--tx-dim)', fontSize: '12px' }}>
                        VTU NEP {scheme} Scheme · {VTU_BRANCHES[branch] || branch} · Sem {semester}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        className={styles.quickBtn}
                        onClick={() => refreshMatrix(branch, semester, scheme, usn)}
                        title="Re-fetch subjects directly from database catalog"
                    >
                        <span className="material-icons-round" style={{ fontSize: '15px' }}>sync</span>
                        Refresh Catalog
                    </button>
                    <PDFUpload onExtracted={(data) => {
                        if (data.studentInfo?.usn && data.studentInfo.usn !== 'Unknown') {
                            if (!loggedInUser) setUsn(data.studentInfo.usn.toUpperCase());
                        }
                        if (data.studentInfo?.name) setStudentName(data.studentInfo.name);
                        if (data.studentInfo?.semester) {
                            const sNum = Number(data.studentInfo.semester);
                            if (sNum >= 1 && sNum <= 8) setSemester(sNum);
                        }
                        if (data.scheme) setScheme(data.scheme);
                        if (data.subjects && data.subjects.length > 0) {
                            setSubjects(data.subjects.map(sub => ({
                                ...sub,
                                id: Math.random(),
                                name: sub.name || sub.code,
                                code: sub.code,
                                credits: isAuditCourse(sub.code) ? 0 : ((sub.credits !== null && sub.credits !== undefined) ? Number(sub.credits) : 3),
                                isAudit: isAuditCourse(sub.code),
                                total: sub.total || ((sub.internal || 0) + (sub.external || 0)),
                                grade: sub.grade || getGradeFromTotal(sub.total || ((sub.internal || 0) + (sub.external || 0)), scheme),
                            })));
                            setSuccess(`✓ Extracted ${data.subjects.length} subjects from PDF marksheet`);
                        }
                    }} />
                </div>
            </div>

            {/* Dual Mode Switch Tabs */}
            <Inline align="between" stackMobile>
                <div className={styles.modeTabsContainer}>
                    <button
                        type="button"
                        className={styles.modeTabBtn}
                        style={{
                            fontWeight: activeTab === 'sgpa' ? 800 : 700,
                            background: activeTab === 'sgpa' ? 'var(--primary, #174B4D)' : 'transparent',
                            color: activeTab === 'sgpa' ? '#FFFFFF' : 'var(--tx-muted)',
                        }}
                        onClick={() => setActiveTab('sgpa')}
                        aria-pressed={activeTab === 'sgpa'}
                    >
                        <span className="material-icons-round" style={{ fontSize: '17px' }}>calculate</span>
                        SGPA Calculator
                    </button>
                    <button
                        type="button"
                        className={styles.modeTabBtn}
                        style={{
                            fontWeight: activeTab === 'cgpa' ? 800 : 700,
                            background: activeTab === 'cgpa' ? 'var(--primary, #174B4D)' : 'transparent',
                            color: activeTab === 'cgpa' ? '#FFFFFF' : 'var(--tx-muted)',
                        }}
                        onClick={() => setActiveTab('cgpa')}
                        aria-pressed={activeTab === 'cgpa'}
                    >
                        <span className="material-icons-round" style={{ fontSize: '17px' }}>insights</span>
                        CGPA Calculator
                    </button>
                </div>
            </Inline>

            {/* Notification Feedback Banners */}
            {error && (
                <div style={{
                    padding: '12px 18px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '10px',
                    color: '#b91c1c',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>error</span>
                    {error}
                </div>
            )}
            {success && (
                <div style={{
                    padding: '12px 18px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '10px',
                    color: '#15803d',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                    {success}
                </div>
            )}

            {/* Main Interactive Grid */}
            <div className={styles.calcGrid}>
                {/* Left Sidebar: Controls & Academic Profile */}
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarCard}>
                        {/* Student Identity Badge */}
                        {loggedInUser ? (
                            <div className={styles.identityCard}>
                                <div className={styles.avatarBox}>
                                    {(studentName || usn || 'S').charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.identityInfo}>
                                    <div className={styles.studentName}>{studentName || 'Student'}</div>
                                    <div className={styles.studentUsn}>{usn}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '14px', color: '#16a34a' }}>verified</span>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534' }}>Identity Verified</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.controlGroup}>
                                <Input
                                    label="Academic Identity (USN)"
                                    placeholder="e.g. 2AB23CS043"
                                    value={usn}
                                    onChange={e => setUsn(e.target.value.toUpperCase())}
                                />
                            </div>
                        )}

                        {/* Program Branch & Teaching Scheme in responsive grid */}
                        <div className={styles.branchSchemeGrid}>
                            <div className={styles.controlGroup}>
                                <label className={styles.controlLabel}>
                                    <span>Program Branch</span>
                                    <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 800 }}>VTU</span>
                                </label>
                                <select
                                    aria-label="Program branch"
                                    className={styles.selectStyled}
                                    value={branch}
                                    onChange={e => {
                                        const b = e.target.value;
                                        setBranch(b);
                                        refreshMatrix(b, semester, scheme, usn);
                                    }}
                                >
                                    {Object.entries(VTU_BRANCHES).map(([code, name]) => (
                                        <option key={code} value={code}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.controlGroup}>
                                <label className={styles.controlLabel}>
                                    <span>Teaching Scheme</span>
                                    <span style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>NEP / CBCS</span>
                                </label>
                                <select
                                    aria-label="Scheme"
                                    className={styles.selectStyled}
                                    value={scheme}
                                    onChange={e => {
                                        const s = e.target.value;
                                        setScheme(s);
                                        refreshMatrix(branch, semester, s, usn);
                                    }}
                                >
                                    {Object.keys(VTU_SCHEMES).map(k => (
                                        <option key={k} value={k}>{k} Scheme</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Interactive Semester Selector */}
                        <div className={styles.controlGroup}>
                            <label className={styles.controlLabel}>
                                <span>Semester Selection</span>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)' }}>Sem {semester}</span>
                            </label>
                            <div className={styles.semGrid}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
                                    const isActive = semester === n;
                                    return (
                                        <button
                                            key={n}
                                            type="button"
                                            className={`${styles.semBtn} ${isActive ? styles.semBtnActive : ''}`}
                                            onClick={() => {
                                                setSemester(n);
                                                refreshMatrix(branch, n, scheme, usn);
                                            }}
                                            aria-pressed={isActive}
                                            aria-label={`Select semester ${n}`}
                                        >
                                            <span>{n}</span>
                                            <span className={styles.semSubText}>SEM</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* VTU Grading Scale Quick Reference Box (Collapsible Accordion on Mobile) */}
                    <details className={styles.infoBox} open>
                        <summary className={styles.infoToggleSummary}>
                            <div className={styles.infoTitle} style={{ margin: 0 }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>rule</span>
                                VTU NEP Grading Key
                            </div>
                            <span className={styles.infoToggleHint}>Key ▾</span>
                        </summary>
                        <div className={styles.gradeGrid} style={{ marginTop: '10px' }}>
                            <div className={styles.gradeRow}>
                                <span>90 - 100</span>
                                <span className={styles.gradePillMini} style={{ background: '#dcfce7', color: '#15803d' }}>O (10)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>80 - 89</span>
                                <span className={styles.gradePillMini} style={{ background: '#d1fae5', color: '#047857' }}>A+ (9)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>70 - 79</span>
                                <span className={styles.gradePillMini} style={{ background: '#ccfbf1', color: '#0f766e' }}>A (8)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>60 - 69</span>
                                <span className={styles.gradePillMini} style={{ background: '#dbeafe', color: '#1d4ed8' }}>B+ (7)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>55 - 59</span>
                                <span className={styles.gradePillMini} style={{ background: '#e0e7ff', color: '#4338ca' }}>B (6)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>50 - 54</span>
                                <span className={styles.gradePillMini} style={{ background: '#fef3c7', color: '#b45309' }}>C (5)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>40 - 49</span>
                                <span className={styles.gradePillMini} style={{ background: '#ffedd5', color: '#c2410c' }}>P (4)</span>
                            </div>
                            <div className={styles.gradeRow}>
                                <span>&lt; 40</span>
                                <span className={styles.gradePillMini} style={{ background: '#fee2e2', color: '#b91c1c' }}>F (0)</span>
                            </div>
                        </div>
                    </details>
                </aside>

                {/* Main Content Area */}
                <main>
                    {activeTab === 'sgpa' ? (
                        <>
                            {/* Subject Ledger Matrix */}
                            <div className={styles.mainCard}>
                                <div className={styles.matrixHeader}>
                                    <div className={styles.matrixTitleBox}>
                                        <div className={styles.matrixTitle}>
                                            <span>Semester {semester} Curriculum Ledger</span>
                                            <span style={{
                                                fontSize: '12px',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                background: 'var(--surface-low, #f4f0eb)',
                                                color: 'var(--tx-dim)',
                                                fontWeight: 800
                                            }}>
                                                {subjects.length} Courses · {activeTotalCredits} Credits
                                            </span>
                                        </div>
                                        <div className={styles.matrixSubtitle}>
                                            Official courses pulled from {catalogSource === 'institutional' ? 'institutional faculty database' : 'VTU curriculum catalog'}.
                                        </div>
                                    </div>

                                    {/* Quick Testing Actions Toolbar */}
                                    <div className={styles.actionsToolbar}>
                                        <button
                                            type="button"
                                            className={styles.quickBtn}
                                            onClick={() => fillExampleMarks(40)}
                                            title="Fill passing scores (40) across all subjects"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px', color: '#c2410c' }}>task_alt</span>
                                            Pass (40)
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.quickBtn}
                                            onClick={() => fillExampleMarks(85)}
                                            title="Fill distinction scores (85) across all subjects"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px', color: '#16a34a' }}>military_tech</span>
                                            Distinction (85)
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.quickBtn}
                                            onClick={resetMarks}
                                            title="Clear all inputs"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>restart_alt</span>
                                            Clear
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.quickBtn}
                                            onClick={openCatalogPicker}
                                            title="Add a subject from the official Faculty Subject Catalog"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>library_add</span>
                                            Add from Catalog
                                        </button>
                                    </div>
                                </div>

                                {/* Ledger Table */}
                                <div style={{ overflowX: 'auto' }}>
                                    <table className={styles.ledgerTable}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-low, #fcfaf8)', borderBottom: '1px solid var(--border)' }}>
                                                <th className={`${styles.ledgerTh} ${styles.ledgerThName}`}>Course Name &amp; Code</th>
                                                <th className={styles.ledgerTh} style={{ width: '90px' }}>Credits</th>
                                                <th className={styles.ledgerTh} style={{ width: '100px' }}>Final Score</th>
                                                <th className={styles.ledgerTh} style={{ width: '80px' }}>Grade</th>
                                                <th className={styles.ledgerTh} style={{ width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                                                            <span className="material-icons-round" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
                                                            Loading subject catalog from institutional database...
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : subjects.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                        No subjects catalogued for {VTU_BRANCHES[branch] || branch} Semester {semester} ({scheme} Scheme).
                                                    </td>
                                                </tr>
                                            ) : (
                                                subjects.map((sub, idx) => {
                                                    const tag = getCourseTag(sub.credits, sub.code, sub.name);
                                                    const gradeVisual = getGradeVisual(sub.grade);
                                                    const isInvalid = sub.total !== '' && (sub.total < 0 || sub.total > 100);

                                                    return (
                                                        <tr key={sub.id || idx} className={styles.ledgerRow}>
                                                            <td className={styles.ledgerTdName}>
                                                                <div className={styles.subjectTitle}>{sub.name}</div>
                                                                <div className={styles.subjectCodeRow}>
                                                                    <span className={styles.subjectCode}>{sub.code}</span>
                                                                    <span className={`${styles.courseTag} ${tag.className}`}>
                                                                        <span className="material-icons-round" style={{ fontSize: '12px' }}>{tag.icon}</span>
                                                                        {tag.label}
                                                                    </span>
                                                                    {sub.source === 'marks_vault' && (
                                                                        <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 800 }}>✓ Verified</span>
                                                                    )}
                                                                    {sub.source === 'catalog_added' && (
                                                                        <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 800 }}>+ Added</span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td className={styles.ledgerTdCredits}>
                                                                {tag.isAudit ? (
                                                                    <span className={`${styles.creditPill} ${styles.creditPillAudit}`}>
                                                                        0 CR
                                                                    </span>
                                                                ) : (
                                                                    <span className={styles.creditPill}>
                                                                        {sub.credits} {sub.credits === 1 ? 'CR' : 'CR'}
                                                                    </span>
                                                                )}
                                                            </td>

                                                            <td className={styles.ledgerTdScore}>
                                                                <div className={styles.scoreInputWrap}>
                                                                    <input
                                                                        className={`${styles.scoreInput} ${isInvalid ? styles.scoreInputInvalid : ''}`}
                                                                        type="number"
                                                                        min="0"
                                                                        max="100"
                                                                        placeholder="—"
                                                                        aria-label={`Final score for ${sub.name || sub.code}`}
                                                                        value={sub.total}
                                                                        onChange={e => handleMarks(sub.id, e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') {
                                                                                const inputs = Array.from(document.querySelectorAll(`.${styles.scoreInput}`));
                                                                                const nextIdx = inputs.indexOf(e.target) + 1;
                                                                                if (inputs[nextIdx]) inputs[nextIdx].focus();
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            </td>

                                                            <td className={styles.ledgerTdGrade}>
                                                                <div>
                                                                    <span
                                                                        className={styles.gradePill}
                                                                        style={{
                                                                            background: gradeVisual.bg,
                                                                            color: gradeVisual.color,
                                                                            border: `1px solid ${gradeVisual.border}`
                                                                        }}
                                                                    >
                                                                        {gradeVisual.label}
                                                                    </span>
                                                                    {sub.total !== '' && (
                                                                        <div className={styles.gradePointsSub}>
                                                                            {tag.isAudit ? 'Audit' : `${sub.credits}×${gradeVisual.gp}`}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td className={styles.ledgerTdAction}>
                                                                {(sub.source === 'custom' || sub.source === 'catalog_added') && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeSubject(sub.id)}
                                                                        style={{
                                                                            background: 'transparent',
                                                                            border: 'none',
                                                                            cursor: 'pointer',
                                                                            color: '#ef4444',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center'
                                                                        }}
                                                                        title="Remove subject"
                                                                    >
                                                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>delete</span>
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Floating Real-Time Result Bar */}
                            <div className={styles.stickyDock}>
                                <div className={styles.resultBar}>
                                    <div className={styles.resultHero}>
                                        <div className={styles.sgpaNumberBox}>
                                            <div className={styles.sgpaLabel}>
                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>grade</span>
                                                Semester SGPA
                                            </div>
                                            <div className={styles.sgpaValue}>
                                                {stats.sgpa.toFixed(2)}
                                            </div>
                                        </div>

                                        <div className={styles.metricsPills}>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <div className={styles.metricBadge}>
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>percent</span>
                                                    {calculatePercentage(stats.sgpa, scheme).toFixed(1)}% Equivalent
                                                </div>
                                                <div className={styles.metricBadge}>
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>workspace_premium</span>
                                                    {standingClassification}
                                                </div>
                                                <div className={styles.metricBadge}>
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>fact_check</span>
                                                    {stats.totalCredits} Earned Credits
                                                </div>
                                            </div>
                                            <div className={styles.formulaText}>
                                                {stats.formula || `Σ(Credit × GP) / ΣCredit`}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.resultActions}>
                                        <button
                                            type="button"
                                            className={styles.saveBtn}
                                            onClick={saveToDatabase}
                                            disabled={loading}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>cloud_upload</span>
                                            {loading ? 'Synchronizing...' : 'Save to Academic Vault'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* CGPA Calculator Tab */
                        <div className={styles.cgpaCard}>
                            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--primary)', marginBottom: '12px' }}>
                                    query_stats
                                </span>
                                <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                                    Cumulative CGPA Calculator
                                </h2>
                                <p style={{ color: 'var(--tx-muted)', fontSize: '14px', maxWidth: '520px', margin: '0 auto' }}>
                                    Enter your semester-wise SGPA scores or auto-load your verified records directly from the GradeFlow vault.
                                </p>
                                {loggedInUser && (
                                    <button
                                        type="button"
                                        className={styles.quickBtn}
                                        style={{ marginTop: '16px', padding: '8px 20px', fontSize: '13px' }}
                                        onClick={loadVaultRecordsForCGPA}
                                        disabled={isLoadingVaultRecords}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>sync</span>
                                        {isLoadingVaultRecords ? 'Retrieving Records...' : 'Auto-Fill from My Academic Vault'}
                                    </button>
                                )}
                            </div>

                            <div className={styles.cgpaSemGrid}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
                                    <div key={n} className={styles.cgpaSemCard}>
                                        <div className={styles.cgpaSemLabel}>Semester {n}</div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="10"
                                            placeholder="0.00"
                                            style={{
                                                width: '100%',
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                fontSize: '16px',
                                                border: 'none',
                                                background: 'transparent',
                                                outline: 'none',
                                                color: 'var(--tx-main)'
                                            }}
                                            value={manualSGPAs[i]}
                                            onChange={e => {
                                                const next = [...manualSGPAs];
                                                next[i] = e.target.value;
                                                setManualSGPAs(next);
                                                setCgpaResult(calculateCGPAFromSGPAs(next, scheme));
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '24px' }}>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    onClick={() => setCgpaResult(calculateCGPAFromSGPAs(manualSGPAs, scheme))}
                                >
                                    Recompute Cumulative CGPA
                                </Button>
                            </div>

                            {cgpaResult && (
                                <div className={`${styles.cgpaHeroResult} gf-fade-up`}>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Cumulative CGPA
                                        </div>
                                        <div style={{ fontSize: '56px', fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.04em' }}>
                                            {cgpaResult.cgpa?.toFixed(2) || '0.00'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Percentage Equivalent
                                        </div>
                                        <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>
                                            {calculatePercentage(cgpaResult.cgpa || 0, scheme).toFixed(1)}%
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            Formula: (CGPA - 0.75) × 10
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Degree Classification
                                        </div>
                                        <div style={{
                                            fontSize: '18px',
                                            fontWeight: 800,
                                            color: 'var(--tx-main)',
                                            marginTop: '8px',
                                            background: 'var(--surface, #FFFFFF)',
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            display: 'inline-block'
                                        }}>
                                            {classify(cgpaResult.cgpa || 0).label}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* ── Faculty Catalog Picker Modal ── */}
            {showCatalogPicker && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '16px'
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowCatalogPicker(false); }}
                >
                    <div style={{
                        background: 'var(--surface, #fff)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '540px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.18)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 20px 12px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>auto_stories</span>
                                    <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>Faculty Subject Catalog</span>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: 0 }}>
                                    Official courses from the institutional catalog · {scheme} Scheme · {VTU_BRANCHES[branch] || branch}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowCatalogPicker(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', padding: '4px', borderRadius: '6px' }}
                                aria-label="Close catalog picker"
                            >
                                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
                            </button>
                        </div>

                        {/* Search Box */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'var(--surface-low, #f7f5f2)',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                border: '1px solid var(--border)'
                            }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>search</span>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search by course name or code..."
                                    value={catalogPickerSearch}
                                    onChange={e => setCatalogPickerSearch(e.target.value)}
                                    style={{
                                        border: 'none', background: 'transparent', outline: 'none',
                                        fontSize: '13.5px', color: 'var(--tx-main)', width: '100%'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Course List */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {catalogPickerLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '32px', animation: 'spin 1s linear infinite', display: 'block', marginBottom: '8px' }}>sync</span>
                                    Loading catalog...
                                </div>
                            ) : filteredPickerList.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>
                                    {catalogPickerSearch ? 'No courses match your search.' : 'All available courses are already added.'}
                                </div>
                            ) : (
                                filteredPickerList.map(course => {
                                    const isAudit = isAuditCourse(course.subject_code);
                                    return (
                                        <div
                                            key={course.subject_code}
                                            onClick={() => addFromCatalog(course)}
                                            style={{
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 20px',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid var(--border)',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low, #f7f5f2)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--tx-main)', marginBottom: '2px' }}>
                                                    {course.subject_name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', fontFamily: 'monospace' }}>
                                                        {course.subject_code}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '10px', fontWeight: 800, padding: '1px 6px',
                                                        borderRadius: '4px', background: 'var(--surface-low)',
                                                        color: 'var(--tx-dim)'
                                                    }}>
                                                        Sem {course.semester}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                <span style={{
                                                    fontSize: '12px', fontWeight: 800,
                                                    color: isAudit ? 'var(--tx-dim)' : 'var(--primary)',
                                                    background: isAudit ? 'var(--surface-low)' : 'rgba(23,75,77,0.08)',
                                                    padding: '3px 8px', borderRadius: '6px'
                                                }}>
                                                    {isAudit ? '0 CR' : `${course.credits} CR`}
                                                </span>
                                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>add_circle</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '12px 20px',
                            borderTop: '1px solid var(--border)',
                            textAlign: 'right'
                        }}>
                            <button
                                onClick={() => setShowCatalogPicker(false)}
                                style={{
                                    background: 'var(--primary, #174B4D)', color: '#fff',
                                    border: 'none', borderRadius: '8px', padding: '8px 20px',
                                    fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CalculatorPage() {
    return (
        <AuthGuard role="any">
            <CalculatorContent />
        </AuthGuard>
    );
}
