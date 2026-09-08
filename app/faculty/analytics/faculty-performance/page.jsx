'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input, Badge, ConfirmDialog } from '@/components/ui';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { filterAndRank } from '@/lib/search-utils';

export default function FacultyPerformancePage() {
    return (
        <AuthGuard role="faculty">
            <FacultyPerformanceContent />
        </AuthGuard>
    );
}

function FacultyPerformanceContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Global session/identity
    const [currentFacultyId, setCurrentFacultyId] = useState(null);
    const [currentUserRole, setCurrentUserRole] = useState('faculty');

    // View Perspective & Filters
    const [viewPerspective, setViewPerspective] = useState('all'); // 'all' | 'my'
    const [branch, setBranch] = useState('');
    const [semester, setSemester] = useState('all');
    const [classFilter, setClassFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'remedial' | 'distinction' | 'unassigned'

    // Data
    const [facultyList, setFacultyList] = useState([]);
    const [classesList, setClassesList] = useState([]);
    const [expandedFacultyId, setExpandedFacultyId] = useState(null);

    // Subject Assignment Modal State (matching HOD / Accreditation Suite design)
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTargetFaculty, setAssignTargetFaculty] = useState(null);
    const [assignBranch, setAssignBranch] = useState('CS');
    const [assignSemester, setAssignSemester] = useState('6');
    const [assignScheme, setAssignScheme] = useState('2022');
    const [assignScope, setAssignScope] = useState('class'); // 'class' | 'shared'
    const [assignClassId, setAssignClassId] = useState('');
    const [assignSubjectCode, setAssignSubjectCode] = useState('');
    const [assignCustomCode, setAssignCustomCode] = useState('');
    const [assignCustomName, setAssignCustomName] = useState('');
    const [manualSubjectMode, setManualSubjectMode] = useState(false);
    const [assignSubjectsLoading, setAssignSubjectsLoading] = useState(false);
    const [assignAvailableSubjects, setAssignAvailableSubjects] = useState([]);
    const [assignSubmitting, setAssignSubmitting] = useState(false);
    const [assignError, setAssignError] = useState('');

    // Unassign Confirmation State
    const [unassignTarget, setUnassignTarget] = useState(null); // { id, code, name }
    const [unassignSubmitting, setUnassignSubmitting] = useState(false);

    // 1. Fetch metadata and local faculty profile
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) setMeta(res);
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();

        // Check local storage for faculty identity backup
        try {
            const stored = localStorage.getItem('gradeflow_faculty');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed?.id) setCurrentFacultyId(parsed.id);
            }
        } catch {
            // Ignore
        }
    }, []);

    // 2. Fetch faculty performance and classes
    const loadPerformance = useCallback(async () => {
        setLoading(true);
        try {
            const query = {};
            if (branch) query.branch = branch;
            if (semester && semester !== 'all') query.semester = semester;
            if (classFilter && classFilter !== 'all') query.classId = classFilter;

            const res = await apiRequest('/api/faculty/analytics/faculty-performance', { query });
            if (res) {
                setFacultyList(res.faculty || []);
                if (res.classes) setClassesList(res.classes);
                if (res.currentFacultyId) setCurrentFacultyId(res.currentFacultyId);
                if (res.currentUserRole) setCurrentUserRole(res.currentUserRole);
            }
        } catch (err) {
            console.error('Failed to load faculty performance:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester, classFilter]);

    useEffect(() => {
        loadPerformance();
    }, [loadPerformance]);

    // 3. Load subjects for assign modal when branch/semester/scheme changes
    useEffect(() => {
        if (!showAssignModal) return;

        async function fetchCatalogSubjects() {
            setAssignSubjectsLoading(true);
            setAssignError('');
            try {
                const query = {
                    branch: assignBranch || 'CS',
                    semester: assignSemester || '6',
                    scheme: assignScheme || '2022'
                };
                const res = await apiRequest('/api/subjects', { query });
                const subjects = res?.subjects || res?.data || (Array.isArray(res) ? res : []);
                setAssignAvailableSubjects(subjects);
                if (subjects.length > 0 && !assignSubjectCode && !manualSubjectMode) {
                    setAssignSubjectCode(subjects[0].subject_code || subjects[0].code);
                }
            } catch (err) {
                console.error('Failed to load catalog subjects:', err);
                setAssignError('Unable to load subjects for this branch and semester.');
            } finally {
                setAssignSubjectsLoading(false);
            }
        }

        fetchCatalogSubjects();
    }, [showAssignModal, assignBranch, assignSemester, assignScheme, manualSubjectMode]);

    // Filter classes matching the modal's selected branch and semester
    const modalAvailableClasses = useMemo(() => {
        const branchMatches = classesList.filter(c => {
            const cb = (c.branch || '').toUpperCase();
            const ab = (assignBranch || '').toUpperCase();
            const isBranchMatch = cb === ab || (ab === 'CS' && cb === 'CSE') || (ab === 'AI' && (cb === 'AIML' || cb === 'AI&ML')) || (ab === 'DS' && (cb === 'CD' || cb.includes('DATA')));
            const isSemMatch = !assignSemester || String(c.semester) === String(assignSemester);
            return isBranchMatch && isSemMatch;
        });

        if (branchMatches.length > 0) return branchMatches;

        // Fallback: any class for this semester
        const semMatches = classesList.filter(c => String(c.semester) === String(assignSemester));
        if (semMatches.length > 0) return semMatches;

        return classesList;
    }, [classesList, assignBranch, assignSemester]);

    // 4. Handle Open Assign Modal
    const handleOpenAssignModal = (faculty = null) => {
        const target = faculty || (currentFacultyId ? facultyList.find(f => f.faculty_id === currentFacultyId) : facultyList[0]);
        setAssignTargetFaculty(target);
        const facBranch = target?.department?.toUpperCase().slice(0, 2) || 'CS';
        setAssignBranch(facBranch);
        setAssignSemester(semester && semester !== 'all' ? String(semester) : '6');
        setAssignScheme('2022');
        setAssignScope('class');

        const initialClassId = classFilter && classFilter !== 'all'
            ? classFilter
            : (modalAvailableClasses.length > 0 ? modalAvailableClasses[0].id : '');
        setAssignClassId(initialClassId);

        setAssignSubjectCode('');
        setAssignCustomCode('');
        setAssignCustomName('');
        setManualSubjectMode(false);
        setAssignError('');
        setShowAssignModal(true);
    };

    // 5. Handle Submit Assignment
    const handleSaveAssignment = async (e) => {
        e?.preventDefault();
        if (!assignTargetFaculty?.faculty_id) {
            setAssignError('Please select a faculty member.');
            return;
        }

        const finalSubjectCode = manualSubjectMode ? assignCustomCode.trim().toUpperCase() : assignSubjectCode.trim().toUpperCase();
        if (!finalSubjectCode) {
            setAssignError('Please select or enter a subject code.');
            return;
        }

        const targetClassId = assignScope === 'class' ? assignClassId : null;
        if (assignScope === 'class' && !targetClassId && modalAvailableClasses.length > 0) {
            setAssignError('Please select which specific class section this faculty member teaches.');
            return;
        }

        setAssignSubmitting(true);
        setAssignError('');

        try {
            const payload = {
                faculty_id: assignTargetFaculty.faculty_id,
                subject_code: finalSubjectCode,
                branch: assignBranch,
                semester: parseInt(assignSemester, 10),
                scheme: assignScheme,
                class_id: targetClassId ? targetClassId : null
            };

            const res = await apiRequest('/api/admin/faculty-assignments', {
                method: 'POST',
                body: payload
            });

            if (res) {
                setShowAssignModal(false);
                await loadPerformance();
            }
        } catch (err) {
            console.error('Failed to assign subject:', err);
            setAssignError(err.message || 'Failed to assign subject. Check for duplicate assignment.');
        } finally {
            setAssignSubmitting(false);
        }
    };

    // 6. Handle Unassign Subject
    const handleConfirmUnassign = async () => {
        if (!unassignTarget?.id) return;
        setUnassignSubmitting(true);
        try {
            await apiRequest(`/api/admin/faculty-assignments/${unassignTarget.id}`, {
                method: 'DELETE'
            });
            setUnassignTarget(null);
            await loadPerformance();
        } catch (err) {
            console.error('Failed to unassign subject:', err);
            alert('Failed to remove subject assignment: ' + (err.message || err));
        } finally {
            setUnassignSubmitting(false);
        }
    };

    // 7. Download Remedial CSV for Failed Students
    const handleDownloadRemedial = (subject) => {
        const students = subject.failed_students || [];
        if (students.length === 0) {
            alert('No failed students recorded for this subject.');
            return;
        }

        const headers = ['USN', 'Subject Code', 'Subject Name', 'Class Section', 'Semester', 'Internal Marks', 'External Marks', 'Total Marks', 'Grade'];
        const rows = students.map(s => [
            s.usn,
            subject.subject_code,
            `"${subject.subject_name.replace(/"/g, '""')}"`,
            subject.class_name ? `"${subject.class_name}"` : 'All Sections',
            subject.semester,
            s.internal ?? '—',
            s.external ?? '—',
            s.total ?? '—',
            s.grade || 'F'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Remedial_Students_${subject.subject_code}_Sem${subject.semester}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 8. Excel Export
    const handleExportExcel = async () => {
        const XLSX = await getXLSX();
        const wb = XLSX.utils.book_new();

        const headers = ['#', 'Faculty Name', 'Department', 'Assigned Subjects', 'Students Appeared', 'Passed', 'Failed', 'Pass %', 'Average Score'];
        const rows = displayedFaculty.map((f, idx) => [
            idx + 1,
            f.faculty_name,
            f.department,
            f.subjects.map(s => `${s.subject_code}${s.class_name ? ` (${s.class_name})` : ''}`).join(', ') || 'None',
            f.total_appeared,
            f.total_passed,
            f.total_failed,
            `${f.pass_rate}%`,
            f.avg_score
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Teaching Performance');
        XLSX.writeFile(wb, `Faculty_Teaching_Performance_${branch || 'All'}.xlsx`);
    };

    // 9. PDF Export
    const handleExportPDF = async () => {
        const { jsPDF, autoTable } = await getJsPDF();
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('GradeFlow - Faculty Teaching Performance & Attribution Report', 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Department: ${branch || 'All'} | Semester: ${semester} | Class: ${classFilter || 'All'} | Total Faculty: ${displayedFaculty.length} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'Faculty Name', 'Department', 'Assigned Subjects & Classes', 'Appeared', 'Passed', 'Failed', 'Pass Rate', 'Avg Marks']];
        const tableBody = displayedFaculty.map((f, idx) => [
            idx + 1,
            f.faculty_name,
            f.department,
            f.subjects.map(s => `${s.subject_code}${s.class_name ? ` (${s.class_name})` : ''}`).join(', ') || '—',
            f.total_appeared,
            f.total_passed,
            f.total_failed,
            `${f.pass_rate}%`,
            f.avg_score
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Faculty_Performance_${branch || 'All'}.pdf`);
    };

    // 10. Filtered Faculty List
    const displayedFaculty = useMemo(() => {
        let list = facultyList;

        // Perspective filter: "My Teaching Portfolio"
        if (viewPerspective === 'my' && currentFacultyId) {
            list = list.filter(f => f.faculty_id === currentFacultyId);
        }

        // Quick filter
        if (quickFilter === 'remedial') {
            list = list.filter(f => f.total_appeared > 0 && f.pass_rate < 75);
        } else if (quickFilter === 'distinction') {
            list = list.filter(f => f.total_appeared > 0 && f.pass_rate >= 90);
        } else if (quickFilter === 'unassigned') {
            list = list.filter(f => f.subjects.length === 0);
        }

        // Text search query
        if (searchQuery.trim()) {
            list = filterAndRank(list, searchQuery, [
                'faculty_name',
                'email',
                'department',
                f => (f.subjects || []).map(s => `${s.subject_code || ''} ${s.subject_name || ''} ${s.class_name || ''}`).join(' ')
            ]);
        }

        return list;
    }, [facultyList, viewPerspective, currentFacultyId, quickFilter, searchQuery]);

    // 11. KPI Summary Aggregates
    const kpis = useMemo(() => {
        const targetList = viewPerspective === 'my'
            ? displayedFaculty
            : facultyList;

        let totalAppeared = 0;
        let totalPassed = 0;
        let totalFailed = 0;
        let activeAssignedCount = 0;
        let atRiskSubjectsCount = 0;
        const coveredClasses = new Set();

        targetList.forEach(f => {
            if (f.subjects.length > 0) activeAssignedCount++;
            totalAppeared += f.total_appeared || 0;
            totalPassed += f.total_passed || 0;
            totalFailed += f.total_failed || 0;

            f.subjects.forEach(s => {
                if (s.class_id) coveredClasses.add(s.class_id);
                if (s.appeared > 0 && s.pass_rate < 75) {
                    atRiskSubjectsCount++;
                }
            });
        });

        const passRate = totalAppeared > 0 ? ((totalPassed / totalAppeared) * 100).toFixed(1) : 0;

        return {
            totalFaculty: targetList.length,
            activeAssigned: activeAssignedCount,
            totalAppeared,
            totalPassed,
            totalFailed,
            passRate: Number(passRate),
            atRiskSubjectsCount,
            coveredClassesCount: coveredClasses.size
        };
    }, [facultyList, displayedFaculty, viewPerspective]);

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1440px', margin: '0 auto' }} className="gf-fade-up">
            {/* Top Navigation & Action Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Accreditation &amp; HOD Command Suite</PageHeaderEyebrow>
                    <PageHeaderTitle>Faculty Teaching Performance</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Attribution of student examination outcomes, pass percentages, and NAAC/NBA grade distribution across departments and classes.
                    </PageHeaderSubtitle>
                </PageHeader>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button onClick={() => handleOpenAssignModal()} variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>add_link</span>
                        + Assign Subject
                    </Button>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={displayedFaculty.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={displayedFaculty.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadPerformance} variant="secondary" title="Refresh Data">
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>sync</span>
                    </Button>
                </div>
            </div>

            {/* View Perspective Switcher: Department Overview vs My Teaching Portfolio */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'inline-flex', background: 'var(--surface-low)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <button
                        type="button"
                        onClick={() => setViewPerspective('all')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '7px',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: viewPerspective === 'all' ? 'var(--surface)' : 'transparent',
                            color: viewPerspective === 'all' ? 'var(--tx-main)' : 'var(--tx-muted)',
                            boxShadow: viewPerspective === 'all' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>account_balance</span>
                        Department Overview ({facultyList.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewPerspective('my')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '7px',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: viewPerspective === 'my' ? 'var(--primary)' : 'transparent',
                            color: viewPerspective === 'my' ? '#FFFFFF' : 'var(--tx-muted)',
                            boxShadow: viewPerspective === 'my' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>person</span>
                        My Teaching Portfolio
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <a
                        href="/faculty/classes"
                        style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: 'var(--primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            background: 'var(--surface-low)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                        Manage Classes &amp; Student Rosters ({classesList.length}) →
                    </a>
                </div>
            </div>

            {/* Executive KPI Scorecard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginBottom: '22px' }}>
                {/* 1. Overall Pass Average */}
                <Card style={{ borderLeft: `4px solid ${kpis.passRate >= 80 ? '#10B981' : kpis.passRate >= 70 ? 'var(--primary)' : '#EF4444'}` }}>
                    <CardContent style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-dim)' }}>
                                {viewPerspective === 'my' ? 'My Overall Pass Rate' : 'Dept Pass Average'}
                            </span>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: kpis.passRate >= 80 ? '#10B981' : 'var(--primary)' }}>
                                trending_up
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                {kpis.totalAppeared > 0 ? `${kpis.passRate}%` : '—'}
                            </div>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: kpis.passRate >= 80 ? '#10B981' : 'var(--tx-muted)' }}>
                                {kpis.totalPassed} of {kpis.totalAppeared} Passed
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Total Evaluated Students */}
                <Card>
                    <CardContent style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-dim)' }}>
                                Evaluated Students
                            </span>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: '#6366F1' }}>
                                groups
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                {kpis.totalAppeared}
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                {kpis.coveredClassesCount > 0 ? `Across ${kpis.coveredClassesCount} Classes` : 'Exam Records Analyzed'}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Active Assigned Faculty */}
                <Card>
                    <CardContent style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-dim)' }}>
                                Active Faculty Roster
                            </span>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: '#F59E0B' }}>
                                school
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                {kpis.activeAssigned} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--tx-dim)' }}>/ {kpis.totalFaculty}</span>
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                Teaching Assigned Classes
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. NBA Remedial Attention Count */}
                <Card style={{ borderLeft: kpis.atRiskSubjectsCount > 0 ? '4px solid #F59E0B' : '1px solid var(--border)' }}>
                    <CardContent style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-dim)' }}>
                                NBA Remedial Focus
                            </span>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: kpis.atRiskSubjectsCount > 0 ? '#F59E0B' : '#10B981' }}>
                                {kpis.atRiskSubjectsCount > 0 ? 'warning_amber' : 'check_circle'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: kpis.atRiskSubjectsCount > 0 ? '#F59E0B' : 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                {kpis.atRiskSubjectsCount}
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                Courses &lt; 75% Pass Benchmark
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter & Search Toolbar */}
            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'flex-end', marginBottom: '14px' }}>
                        {/* Instant Search Box */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Search Faculty, Class or Subject
                            </label>
                            <Input
                                placeholder="Search by name, class (e.g. CS-6A) or code..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Department / Branch Dropdown */}
                        <div>
                            <Select
                                label="Department / Branch"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={[{ value: '', label: 'All Departments' }, ...meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))]}
                            />
                        </div>

                        {/* Semester Filter Dropdown */}
                        <div>
                            <Select
                                label="Semester Filter"
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                options={[{ value: 'all', label: 'All Semesters' }, ...meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))]}
                            />
                        </div>

                        {/* Class Filter Dropdown */}
                        <div>
                            <Select
                                label="Class / Section Filter"
                                value={classFilter}
                                onChange={e => setClassFilter(e.target.value)}
                                options={[
                                    { value: 'all', label: 'All Class Sections' },
                                    ...classesList.map(c => ({
                                        value: c.id,
                                        label: `${c.name} (${c.branch} · Sem ${c.semester}${c.section ? ` · Sec ${c.section}` : ''})`
                                    }))
                                ]}
                            />
                        </div>
                    </div>

                    {/* Quick Filter Status Chips */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border-low)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginRight: '4px' }}>
                            Filter Views:
                        </span>
                        {[
                            { key: 'all', label: 'All Faculty', count: facultyList.length },
                            { key: 'remedial', label: '⚠️ Needs Remedial (<75%)', count: facultyList.filter(f => f.total_appeared > 0 && f.pass_rate < 75).length },
                            { key: 'distinction', label: '🏆 High Achievers (≥90%)', count: facultyList.filter(f => f.total_appeared > 0 && f.pass_rate >= 90).length },
                            { key: 'unassigned', label: '📝 Unassigned', count: facultyList.filter(f => f.subjects.length === 0).length }
                        ].map(chip => {
                            const active = quickFilter === chip.key;
                            return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onClick={() => setQuickFilter(chip.key)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                        background: active ? 'rgba(99, 102, 241, 0.12)' : 'var(--surface-low)',
                                        color: active ? 'var(--primary)' : 'var(--tx-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span>{chip.label}</span>
                                    <span style={{ opacity: 0.75, fontSize: '10.5px' }}>({chip.count})</span>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Performance Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px' }}>#</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Faculty Name</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px' }}>Department</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '260px' }}>Assigned Subjects &amp; Classes</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px' }}>Appeared</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px' }}>Passed</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px' }}>Failed</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '95px' }}>Pass Rate</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '130px' }}>Grade Spread</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '85px' }}>Avg Marks</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '80px' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedFaculty.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '48px 20px', textAlign: 'center' }}>
                                        {loading ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '28px', animation: 'spin 1s linear infinite' }}>sync</span>
                                                <span style={{ color: 'var(--tx-muted)' }}>Aggregating faculty teaching data...</span>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)' }}>person_search</span>
                                                <div style={{ fontWeight: 700, color: 'var(--tx-main)' }}>No faculty records found matching current criteria</div>
                                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', maxWidth: '400px' }}>
                                                    Try changing the branch, semester, or class filters, or click &quot;+ Assign Subject&quot; above to link faculty to VTU subjects and classes.
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                displayedFaculty.map((f, idx) => {
                                    const isExpanded = expandedFacultyId === f.faculty_id;
                                    const isSelf = currentFacultyId && f.faculty_id === currentFacultyId;
                                    const passColor = f.pass_rate >= 85 ? '#10B981' : f.pass_rate >= 70 ? 'var(--primary)' : f.pass_rate > 0 ? '#EF4444' : 'var(--tx-dim)';

                                    // Compute grade spread segments
                                    const gs = f.grade_spread || {};
                                    const distinction = (gs.O || 0) + (gs['A+'] || 0);
                                    const firstClass = (gs.A || 0) + (gs['B+'] || 0);
                                    const secondPass = (gs.B || 0) + (gs.C || 0) + (gs.P || 0);
                                    const failed = gs.F || 0;
                                    const totalGrades = distinction + firstClass + secondPass + failed;

                                    return (
                                        <span key={f.faculty_id || idx} style={{ display: 'contents' }}>
                                            <tr style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: isExpanded ? 'var(--surface-low)' : isSelf ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}>
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                    {idx + 1}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{f.faculty_name}</span>
                                                        {isSelf && (
                                                            <span style={{
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                background: 'var(--primary)',
                                                                color: '#FFFFFF',
                                                                fontSize: '9.5px',
                                                                fontWeight: 900,
                                                                letterSpacing: '0.04em'
                                                            }}>
                                                                YOU
                                                            </span>
                                                        )}
                                                    </div>
                                                    {f.email && <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 400 }}>{f.email}</div>}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '12px' }}>
                                                    {f.department}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {f.subjects.length === 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenAssignModal(f)}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                border: '1px dashed var(--primary)',
                                                                background: 'rgba(99, 102, 241, 0.08)',
                                                                color: 'var(--primary)',
                                                                fontSize: '11.5px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span>
                                                            Assign Subject &amp; Class
                                                        </button>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {f.subjects.map(s => (
                                                                <div
                                                                    key={s.assignment_id || s.subject_code}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        borderRadius: '6px',
                                                                        background: 'var(--surface-low)',
                                                                        border: '1px solid var(--border)',
                                                                        overflow: 'hidden'
                                                                    }}
                                                                    title={`${s.subject_name} · Class: ${s.class_name || 'All Sections'} (${s.appeared} students, ${s.pass_rate}% pass)`}
                                                                >
                                                                    <span style={{
                                                                        padding: '2px 7px',
                                                                        fontSize: '11px',
                                                                        fontWeight: 800,
                                                                        fontFamily: 'monospace',
                                                                        color: 'var(--primary)'
                                                                    }}>
                                                                        {s.subject_code}
                                                                    </span>
                                                                    {s.class_name && (
                                                                        <span style={{
                                                                            padding: '2px 6px',
                                                                            fontSize: '10px',
                                                                            fontWeight: 700,
                                                                            background: 'rgba(99, 102, 241, 0.12)',
                                                                            color: 'var(--primary)',
                                                                            borderLeft: '1px solid var(--border)'
                                                                        }}>
                                                                            {s.class_section ? `Sec ${s.class_section}` : s.class_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAssignModal(f)}
                                                                style={{
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    color: 'var(--tx-dim)',
                                                                    cursor: 'pointer',
                                                                    padding: '2px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center'
                                                                }}
                                                                title="Add another course / class assignment"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '18px' }}>add_circle_outline</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                                                    {f.total_appeared}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: '#10B981' }}>
                                                    {f.total_passed}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: f.total_failed > 0 ? '#EF4444' : 'var(--tx-muted)' }}>
                                                    {f.total_failed}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        fontSize: '11.5px', fontWeight: 900,
                                                        background: f.pass_rate >= 85 ? 'rgba(16, 185, 129, 0.12)' : f.pass_rate >= 70 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: passColor
                                                    }}>
                                                        {f.total_appeared > 0 ? `${f.pass_rate}%` : '—'}
                                                    </span>
                                                </td>
                                                {/* Visual Grade Spread Pill Stack */}
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    {totalGrades > 0 ? (
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                height: '14px',
                                                                borderRadius: '4px',
                                                                overflow: 'hidden',
                                                                background: 'var(--surface-low)',
                                                                width: '100%',
                                                                maxWidth: '120px',
                                                                margin: '0 auto',
                                                                border: '1px solid var(--border-low)'
                                                            }}
                                                            title={`O/A+ (Distinction): ${distinction} | A/B+ (First Class): ${firstClass} | B/C/P (Pass): ${secondPass} | F (Fail): ${failed}`}
                                                        >
                                                            {distinction > 0 && (
                                                                <div style={{ width: `${(distinction / totalGrades) * 100}%`, background: '#10B981' }} />
                                                            )}
                                                            {firstClass > 0 && (
                                                                <div style={{ width: `${(firstClass / totalGrades) * 100}%`, background: '#6366F1' }} />
                                                            )}
                                                            {secondPass > 0 && (
                                                                <div style={{ width: `${(secondPass / totalGrades) * 100}%`, background: '#F59E0B' }} />
                                                            )}
                                                            {failed > 0 && (
                                                                <div style={{ width: `${(failed / totalGrades) * 100}%`, background: '#EF4444' }} />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '11px' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 800 }}>
                                                    {f.avg_score > 0 ? f.avg_score : '—'}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    {f.subjects.length > 0 ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setExpandedFacultyId(isExpanded ? null : f.faculty_id)}
                                                            title={isExpanded ? 'Collapse breakdown' : 'Expand breakdown'}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </Button>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '11px' }}>—</span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expanded Subject Breakdown */}
                                            {isExpanded && (
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                                    <td colSpan={11} style={{ padding: '16px 20px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-dim)', letterSpacing: '0.04em' }}>
                                                                Subject &amp; Class-wise Performance Breakdown for {f.faculty_name}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAssignModal(f)}
                                                                style={{
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    color: 'var(--primary)',
                                                                    fontSize: '11.5px',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>add</span>
                                                                Assign Additional Subject / Class
                                                            </button>
                                                        </div>

                                                        <div style={{ overflowX: 'auto' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-low)' }}>
                                                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject Code</th>
                                                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject Name</th>
                                                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Class / Section</th>
                                                                        <th style={{ padding: '8px 8px', textAlign: 'center', width: '50px' }}>Sem</th>
                                                                        <th style={{ padding: '8px 8px', textAlign: 'center', width: '65px' }}>Appeared</th>
                                                                        <th style={{ padding: '8px 8px', textAlign: 'center', width: '65px' }}>Passed</th>
                                                                        <th style={{ padding: '8px 8px', textAlign: 'center', width: '65px' }}>Failed</th>
                                                                        <th style={{ padding: '8px 10px', textAlign: 'center', width: '75px' }}>Pass %</th>
                                                                        <th style={{ padding: '8px 10px', textAlign: 'center', width: '75px' }}>Avg Score</th>
                                                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {f.subjects.map(s => (
                                                                        <tr key={s.assignment_id || s.subject_code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                                            <td style={{ padding: '8px 12px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                                                {s.subject_code}
                                                                            </td>
                                                                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                                                                {s.subject_name}
                                                                            </td>
                                                                            <td style={{ padding: '8px 12px' }}>
                                                                                {s.class_name ? (
                                                                                    <a
                                                                                        href={`/faculty/classes`}
                                                                                        style={{
                                                                                            fontWeight: 700,
                                                                                            color: 'var(--primary)',
                                                                                            textDecoration: 'none',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '4px'
                                                                                        }}
                                                                                        title="Open Class Roster"
                                                                                    >
                                                                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>groups</span>
                                                                                        {s.class_name} {s.class_section ? `(Sec ${s.class_section})` : ''}
                                                                                    </a>
                                                                                ) : (
                                                                                    <span style={{ color: 'var(--tx-dim)', fontStyle: 'italic', fontSize: '11px' }}>
                                                                                        All Sections (Shared)
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                                                Sem {s.semester}
                                                                            </td>
                                                                            <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                                                {s.appeared}
                                                                            </td>
                                                                            <td style={{ padding: '8px 8px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>
                                                                                {s.passed}
                                                                            </td>
                                                                            <td style={{ padding: '8px 8px', textAlign: 'center', color: s.failed > 0 ? '#EF4444' : 'inherit', fontWeight: 700 }}>
                                                                                {s.failed}
                                                                            </td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                                                                                <span style={{ color: s.pass_rate >= 80 ? '#10B981' : s.pass_rate >= 70 ? 'var(--primary)' : '#EF4444' }}>
                                                                                    {s.appeared > 0 ? `${s.pass_rate}%` : '—'}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                                                                                {s.avg_score}
                                                                            </td>
                                                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                                                    {/* Subject Analytics Link */}
                                                                                    <a
                                                                                        href={`/faculty/analytics/subject-analytics?code=${encodeURIComponent(s.subject_code)}`}
                                                                                        style={{
                                                                                            padding: '3px 8px',
                                                                                            borderRadius: '4px',
                                                                                            background: 'var(--surface-low)',
                                                                                            border: '1px solid var(--border)',
                                                                                            color: 'var(--tx-main)',
                                                                                            fontSize: '11px',
                                                                                            fontWeight: 700,
                                                                                            textDecoration: 'none',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '3px'
                                                                                        }}
                                                                                        title="Deep Dive Subject Analytics"
                                                                                    >
                                                                                        Analytics
                                                                                        <span className="material-icons-round" style={{ fontSize: '13px' }}>open_in_new</span>
                                                                                    </a>

                                                                                    {/* Remedial List Export */}
                                                                                    {s.failed > 0 && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleDownloadRemedial(s)}
                                                                                            style={{
                                                                                                padding: '3px 8px',
                                                                                                borderRadius: '4px',
                                                                                                background: 'rgba(239, 68, 68, 0.08)',
                                                                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                                                color: '#EF4444',
                                                                                                fontSize: '11px',
                                                                                                fontWeight: 700,
                                                                                                cursor: 'pointer',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '3px'
                                                                                            }}
                                                                                            title="Download Remedial Student USN Roster"
                                                                                        >
                                                                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>download</span>
                                                                                            Remedial ({s.failed})
                                                                                        </button>
                                                                                    )}

                                                                                    {/* Remove Assignment Option */}
                                                                                    {s.assignment_id && (isSelf || currentUserRole === 'admin') && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setUnassignTarget({ id: s.assignment_id, code: s.subject_code, name: s.subject_name })}
                                                                                            style={{
                                                                                                padding: '3px 6px',
                                                                                                borderRadius: '4px',
                                                                                                background: 'transparent',
                                                                                                border: 'none',
                                                                                                color: 'var(--tx-dim)',
                                                                                                cursor: 'pointer'
                                                                                            }}
                                                                                            title="Remove Subject Assignment"
                                                                                        >
                                                                                            <span className="material-icons-round" style={{ fontSize: '16px', color: '#EF4444' }}>delete_outline</span>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </span>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Modal: Assign Subject to Faculty (Faithfully matching user's reference specification) */}
            {showAssignModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.55)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '560px',
                        padding: '28px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '18px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '12px',
                                    background: 'rgba(13, 74, 71, 0.12)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0D4A47'
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '24px' }}>assignment_ind</span>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>
                                        Assign Subject to Faculty
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--tx-muted)' }}>
                                        Select the faculty member, curriculum scope, and course.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                style={{
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    borderRadius: '8px',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--tx-dim)'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>

                        {assignError && (
                            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#EF4444', fontSize: '12.5px', fontWeight: 700 }}>
                                {assignError}
                            </div>
                        )}

                        <form onSubmit={handleSaveAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* 1. FACULTY MEMBER * */}
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Faculty Member <span style={{ color: '#EF4444' }}>*</span>
                                </label>
                                {currentUserRole === 'admin' ? (
                                    <Select
                                        value={assignTargetFaculty?.faculty_id || ''}
                                        onChange={e => {
                                            const found = facultyList.find(f => f.faculty_id === e.target.value);
                                            setAssignTargetFaculty(found);
                                        }}
                                        options={facultyList.map(f => ({
                                            value: f.faculty_id,
                                            label: `${f.faculty_name} (${f.email}) · ${f.department}`
                                        }))}
                                    />
                                ) : (
                                    <div style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--tx-main)' }}>
                                                {assignTargetFaculty?.faculty_name || 'Your Profile'}
                                            </div>
                                            <div style={{ fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                                {assignTargetFaculty?.email || ''} · {assignTargetFaculty?.department || 'Department'}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '10.5px', fontWeight: 800, background: 'var(--primary)', color: '#FFFFFF', padding: '2px 8px', borderRadius: '4px' }}>
                                            SELF
                                        </span>
                                    </div>
                                )}
                                <div style={{ fontSize: '11.5px', color: 'var(--tx-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', color: '#10B981' }}>check_circle</span>
                                    {assignTargetFaculty?.department || 'Engineering'}
                                </div>
                            </div>

                            {/* 2. BRANCH & SEMESTER (2-Column Grid) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <Select
                                        label="Branch *"
                                        value={assignBranch}
                                        onChange={e => setAssignBranch(e.target.value)}
                                        options={[
                                            { value: 'CS', label: 'Computer Science (CS)' },
                                            { value: 'IS', label: 'Information Science (IS)' },
                                            { value: 'AI', label: 'Artificial Intelligence (AI)' },
                                            { value: 'DS', label: 'Data Science (DS)' },
                                            { value: 'EC', label: 'Electronics (EC)' },
                                            { value: 'EE', label: 'Electrical (EE)' },
                                            { value: 'ME', label: 'Mechanical (ME)' },
                                            { value: 'CV', label: 'Civil (CV)' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <Select
                                        label="Semester *"
                                        value={assignSemester}
                                        onChange={e => setAssignSemester(e.target.value)}
                                        options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Semester ${s}` }))}
                                    />
                                </div>
                            </div>

                            {/* 3. CURRICULUM SCHEME */}
                            <div>
                                <Select
                                    label="Curriculum Scheme"
                                    value={assignScheme}
                                    onChange={e => setAssignScheme(e.target.value)}
                                    options={[
                                        { value: '2022', label: '2022 Scheme' },
                                        { value: '2025', label: '2025 Scheme' },
                                        { value: '2018', label: '2018 Scheme' }
                                    ]}
                                />
                            </div>

                            {/* 4. WHICH EXACT CLASS / SECTION DOES FACULTY TEACH? */}
                            <div style={{
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                padding: '14px 16px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Which Class / Section Does Faculty Teach? <span style={{ color: '#EF4444' }}>*</span>
                                    </label>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                        {modalAvailableClasses.length} Section{modalAvailableClasses.length !== 1 ? 's' : ''} in Sem {assignSemester}
                                    </span>
                                </div>

                                {/* Scope Options Toggle */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                    <div
                                        onClick={() => {
                                            setAssignScope('class');
                                            if (!assignClassId && modalAvailableClasses.length > 0) {
                                                setAssignClassId(modalAvailableClasses[0].id);
                                            }
                                        }}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: assignScope === 'class' ? '2px solid #0D4A47' : '1px solid var(--border)',
                                            background: assignScope === 'class' ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '12.5px', color: assignScope === 'class' ? '#0D4A47' : 'var(--tx-main)' }}>
                                                Specific Section Only
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)' }}>
                                                E.g. Sec A only or Sec B only
                                            </div>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'class' ? '#0D4A47' : 'var(--tx-dim)' }}>
                                            {assignScope === 'class' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                        </span>
                                    </div>

                                    <div
                                        onClick={() => {
                                            setAssignScope('shared');
                                            setAssignClassId('');
                                        }}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: assignScope === 'shared' ? '2px solid #0D4A47' : '1px solid var(--border)',
                                            background: assignScope === 'shared' ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '12.5px', color: assignScope === 'shared' ? '#0D4A47' : 'var(--tx-main)' }}>
                                                All Sections (Shared)
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)' }}>
                                                Teaches combined cohort
                                            </div>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'shared' ? '#0D4A47' : 'var(--tx-dim)' }}>
                                            {assignScope === 'shared' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                        </span>
                                    </div>
                                </div>

                                {/* Class Selection Cards (When Specific Section Selected) */}
                                {assignScope === 'class' && (
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                            Select Exact Class / Division:
                                        </div>
                                        {modalAvailableClasses.length === 0 ? (
                                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--tx-muted)', fontSize: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                No class records found for {assignBranch} Semester {assignSemester}.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: modalAvailableClasses.length > 1 ? '1fr 1fr' : '1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                                                {modalAvailableClasses.map(c => {
                                                    const isSelected = assignClassId === c.id;
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => setAssignClassId(c.id)}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderRadius: '8px',
                                                                border: isSelected ? '2px solid #0D4A47' : '1px solid var(--border)',
                                                                background: isSelected ? 'rgba(13, 74, 71, 0.1)' : 'var(--surface)',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                                                    {c.section && (
                                                                        <span style={{ fontSize: '10px', fontWeight: 800, background: '#0D4A47', color: '#FFFFFF', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                                                                            Sec {c.section}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                                    {c.student_count ?? 0} Students {c.batch ? `· ${c.batch}` : ''}
                                                                </div>
                                                            </div>
                                                            <span className="material-icons-round" style={{ fontSize: '18px', color: isSelected ? '#0D4A47' : 'var(--tx-dim)', marginLeft: '8px' }}>
                                                                {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Targeted Attribution Info Note */}
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(99, 102, 241, 0.08)',
                                            border: '1px solid rgba(99, 102, 241, 0.2)',
                                            fontSize: '11px',
                                            color: 'var(--tx-main)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>verified</span>
                                            <span>
                                                Evaluation strictly isolated to students enrolled in this chosen section.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 4. SUBJECT SELECTOR WITH TOGGLE */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Subject <span style={{ color: '#EF4444' }}>*</span>
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {!manualSubjectMode && (
                                            <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                {assignSubjectsLoading ? 'Loading...' : `${assignAvailableSubjects.length} subjects found`}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setManualSubjectMode(!manualSubjectMode)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#0D4A47',
                                                fontSize: '11.5px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            {manualSubjectMode ? 'Select from catalog' : '+ Enter custom code'}
                                        </button>
                                    </div>
                                </div>

                                {manualSubjectMode ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                        <Input
                                            placeholder="Code (e.g. BCS601)"
                                            value={assignCustomCode}
                                            onChange={e => setAssignCustomCode(e.target.value.toUpperCase())}
                                        />
                                        <Input
                                            placeholder="Subject Name (e.g. Cloud Computing)"
                                            value={assignCustomName}
                                            onChange={e => setAssignCustomName(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <Select
                                        value={assignSubjectCode}
                                        onChange={e => setAssignSubjectCode(e.target.value)}
                                        options={[
                                            { value: '', label: 'Select a subject from catalog...' },
                                            ...assignAvailableSubjects.map(s => ({
                                                value: s.subject_code || s.code,
                                                label: `${s.subject_code || s.code} - ${s.subject_name || s.name}`
                                            }))
                                        ]}
                                    />
                                )}
                            </div>

                            {/* Modal Footer Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setShowAssignModal(false)}
                                    disabled={assignSubmitting}
                                    style={{ borderRadius: '8px', padding: '10px 20px', fontWeight: 700 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    loading={assignSubmitting}
                                    disabled={manualSubjectMode ? !assignCustomCode : !assignSubjectCode}
                                    style={{
                                        borderRadius: '8px',
                                        padding: '10px 24px',
                                        fontWeight: 800,
                                        background: '#0D4A47',
                                        color: '#FFFFFF'
                                    }}
                                >
                                    ✔ Confirm Assignment
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Dialog: Unassign Subject */}
            <ConfirmDialog
                open={!!unassignTarget}
                title="Remove Subject Assignment"
                description={`Are you sure you want to remove the assignment for ${unassignTarget?.code} - ${unassignTarget?.name}? This will unlink student attribution from this faculty profile.`}
                confirmLabel="Remove Assignment"
                onConfirm={handleConfirmUnassign}
                onCancel={() => setUnassignTarget(null)}
                busy={unassignSubmitting}
            />
        </div>
    );
}
