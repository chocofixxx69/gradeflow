'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, clearApiCache } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input, ConfirmDialog } from '@/components/ui';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { filterAndRank } from '@/lib/search-utils';
import { writeWorkbook } from '../lib/workbook-export';

const BRANCH_ALIASES = {
    CS: ['CS', 'CSE', 'COMPUTER SCIENCE', 'COMPUTER SCIENCE & ENGINEERING'],
    CSE: ['CS', 'CSE', 'COMPUTER SCIENCE', 'COMPUTER SCIENCE & ENGINEERING'],
    IS: ['IS', 'ISE', 'INFORMATION SCIENCE', 'INFORMATION SCIENCE & ENGINEERING'],
    ISE: ['IS', 'ISE', 'INFORMATION SCIENCE', 'INFORMATION SCIENCE & ENGINEERING'],
    AI: ['AI', 'AIML', 'AI&ML', 'ARTIFICIAL INTELLIGENCE', 'ARTIFICIAL INTELLIGENCE & MACHINE LEARNING'],
    AIML: ['AI', 'AIML', 'AI&ML', 'ARTIFICIAL INTELLIGENCE', 'ARTIFICIAL INTELLIGENCE & MACHINE LEARNING'],
    DS: ['DS', 'DATA SCIENCE', 'DATA SCIENCE & ENGINEERING'],
    EC: ['EC', 'ECE', 'ELECTRONICS', 'ELECTRONICS & COMMUNICATION', 'ELECTRONICS & COMMUNICATION ENGINEERING'],
    ECE: ['EC', 'ECE', 'ELECTRONICS', 'ELECTRONICS & COMMUNICATION', 'ELECTRONICS & COMMUNICATION ENGINEERING'],
    EE: ['EE', 'EEE', 'ELECTRICAL', 'ELECTRICAL & ELECTRONICS', 'ELECTRICAL & ELECTRONICS ENGINEERING'],
    EEE: ['EE', 'EEE', 'ELECTRICAL', 'ELECTRICAL & ELECTRONICS', 'ELECTRICAL & ELECTRONICS ENGINEERING'],
    ME: ['ME', 'MECH', 'MECHANICAL', 'MECHANICAL ENGINEERING'],
    MECH: ['ME', 'MECH', 'MECHANICAL', 'MECHANICAL ENGINEERING'],
    CV: ['CV', 'CIVIL', 'CIVIL ENGINEERING'],
    CIVIL: ['CV', 'CIVIL', 'CIVIL ENGINEERING'],
    RI: ['RI', 'ROBOTICS', 'ROBOTICS & AI', 'ROBOTICS & ARTIFICIAL INTELLIGENCE'],
};

function matchesBranch(subjectBranch, targetBranch) {
    if (!targetBranch || targetBranch === 'all' || targetBranch === 'ALL') return true;
    if (!subjectBranch) return true;
    const sb = String(subjectBranch).trim().toUpperCase();
    const tb = String(targetBranch).trim().toUpperCase();
    if (sb === tb) return true;
    if (sb === 'ALL' || sb === 'COMMON' || sb === 'CORE' || sb === 'B.E.') return true;
    const aliases = BRANCH_ALIASES[tb];
    if (aliases && aliases.includes(sb)) return true;
    const subAliases = BRANCH_ALIASES[sb];
    if (subAliases && subAliases.includes(tb)) return true;
    return false;
}

export function FacultyPerformanceContent({ role = 'faculty', embedded = false, onNavigateTab = null }) {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    useEffect(() => {
        setMounted(true);
    }, []);

    // Global session/identity
    const [currentFacultyId, setCurrentFacultyId] = useState(null);
    const [currentUserRole, setCurrentUserRole] = useState(role);

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

    // Subject Assignment Modal State (Multi-subject & Multi-class support)
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTargetFaculty, setAssignTargetFaculty] = useState(null);
    const [assignBranch, setAssignBranch] = useState('CS');
    const [assignSemester, setAssignSemester] = useState('6');
    const [assignScheme, setAssignScheme] = useState('2022');
    const [assignScope, setAssignScope] = useState('class'); // 'class' | 'shared'
    const [assignClassIds, setAssignClassIds] = useState([]);
    const [assignSubjectCodes, setAssignSubjectCodes] = useState([]);
    const [assignSubjectSearch, setAssignSubjectSearch] = useState('');
    const [customSubjectsList, setCustomSubjectsList] = useState([]);
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

    // Close assign modal on Escape key
    useEffect(() => {
        if (!showAssignModal) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setShowAssignModal(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAssignModal]);

    // 2. Fetch faculty performance and classes
    const [refreshing, setRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState(null);

    const loadPerformance = useCallback(async (isManual = false) => {
        if (isManual) {
            setRefreshing(true);
            clearApiCache();
        } else {
            setLoading(true);
        }
        try {
            const query = { _t: Date.now() };
            if (branch) query.branch = branch;
            if (semester && semester !== 'all') query.semester = semester;
            if (classFilter && classFilter !== 'all') query.classId = classFilter;

            // Fetch metadata and faculty performance in parallel for instant, zero-delay refresh
            const metaPromise = isManual
                ? apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1', t: Date.now() } }).catch(e => { console.warn('Meta refresh note:', e); return null; })
                : Promise.resolve(null);
            const perfPromise = apiRequest('/api/faculty/analytics/faculty-performance', { query });

            const [freshMeta, res] = await Promise.all([metaPromise, perfPromise]);
            if (freshMeta) setMeta(freshMeta);

            if (res) {
                const newFaculty = res.faculty || [];
                const prevFacultyCount = facultyList.length;
                const prevTotalAppeared = facultyList.reduce((acc, f) => acc + (f.total_appeared || 0), 0);
                const newTotalAppeared = newFaculty.reduce((acc, f) => acc + (f.total_appeared || 0), 0);

                setFacultyList(newFaculty);
                if (res.classes) setClassesList(res.classes);
                if (res.currentFacultyId) setCurrentFacultyId(res.currentFacultyId);
                if (res.currentUserRole) setCurrentUserRole(res.currentUserRole);

                if (isManual) {
                    const diffAppeared = newTotalAppeared - prevTotalAppeared;
                    const diffFaculty = newFaculty.length - prevFacultyCount;
                    if (diffAppeared > 0 || diffFaculty > 0) {
                        const parts = [];
                        if (diffAppeared > 0) parts.push(`+${diffAppeared} student marks`);
                        if (diffFaculty > 0) parts.push(`+${diffFaculty} faculty entries`);
                        setRefreshStatus({
                            type: 'new',
                            msg: `✓ New exam data detected: ${parts.join(', ')} synced dynamically!`
                        });
                    } else {
                        setRefreshStatus({
                            type: 'current',
                            msg: `✓ Live sync verified: Teaching performance is fully up to date (${newFaculty.length} faculty).`
                        });
                    }
                    setTimeout(() => setRefreshStatus(null), 5000);
                }
            }
        } catch (err) {
            console.error('Failed to load faculty performance:', err);
            if (isManual) {
                setRefreshStatus({
                    type: 'error',
                    msg: 'Failed to refresh teaching performance: ' + (err.message || 'Unknown error')
                });
                setTimeout(() => setRefreshStatus(null), 5000);
            }
        } finally {
            if (!isManual) setLoading(false);
            setRefreshing(false);
        }
    }, [branch, semester, classFilter, facultyList]);

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
            } catch (err) {
                console.error('Failed to load catalog subjects:', err);
                setAssignError('Unable to load subjects for this branch and semester.');
            } finally {
                setAssignSubjectsLoading(false);
            }
        }

        fetchCatalogSubjects();
    }, [showAssignModal, assignBranch, assignSemester, assignScheme]);

    const [classBranchFilter, setClassBranchFilter] = useState('all');
    const [classSemesterFilter, setClassSemesterFilter] = useState('all');

    const availableClassBranches = useMemo(() => {
        const set = new Set();
        classesList.forEach(c => {
            if (c.branch) set.add(c.branch.trim().toUpperCase());
        });
        return Array.from(set).sort();
    }, [classesList]);

    const availableClassSemesters = useMemo(() => {
        const set = new Set();
        classesList.forEach(c => {
            if (c.semester) set.add(Number(c.semester));
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [classesList]);

    // Intelligent class selector: allows cross-branch and cross-semester selection under scheme
    const modalAvailableClasses = useMemo(() => {
        return classesList.filter(c => {
            if (assignScheme && c.scheme && String(c.scheme) !== String(assignScheme)) return false;
            const bMatch = classBranchFilter === 'all' || matchesBranch(c.branch, classBranchFilter);
            const sMatch = classSemesterFilter === 'all' || String(c.semester) === String(classSemesterFilter);
            return bMatch && sMatch;
        });
    }, [classesList, assignScheme, classBranchFilter, classSemesterFilter]);

    // Multi-class helpers
    const toggleAssignClass = (classId) => {
        setAssignClassIds(prev =>
            prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
        );
    };

    const handleSelectAllClasses = () => {
        setAssignClassIds(Array.from(new Set([...assignClassIds, ...modalAvailableClasses.map(c => c.id)])));
    };

    const handleClearAllClasses = () => {
        setAssignClassIds([]);
    };

    // Multi-subject helpers
    const toggleAssignSubject = (subjectCode) => {
        const clean = (subjectCode || '').toUpperCase().trim();
        if (!clean) return;
        setAssignSubjectCodes(prev =>
            prev.includes(clean) ? prev.filter(c => c !== clean) : [...prev, clean]
        );
    };

    const filteredCatalogSubjects = useMemo(() => {
        if (!assignSubjectSearch.trim()) return assignAvailableSubjects;
        const q = assignSubjectSearch.trim().toLowerCase();
        return assignAvailableSubjects.filter(s => {
            const c = (s.subject_code || s.code || '').toLowerCase();
            const n = (s.subject_name || s.name || '').toLowerCase();
            return c.includes(q) || n.includes(q);
        });
    }, [assignAvailableSubjects, assignSubjectSearch]);

    const handleSelectAllSubjects = () => {
        const codes = filteredCatalogSubjects.map(s => (s.subject_code || s.code || '').toUpperCase().trim()).filter(Boolean);
        setAssignSubjectCodes(prev => Array.from(new Set([...prev, ...codes])));
    };

    const handleClearAllSubjects = () => {
        setAssignSubjectCodes([]);
    };

    const handleAddCustomSubject = () => {
        const code = assignCustomCode.trim().toUpperCase();
        const name = assignCustomName.trim() || code;
        if (!code) return;
        if (!customSubjectsList.some(s => s.code === code)) {
            setCustomSubjectsList(prev => [...prev, { code, name }]);
        }
        setAssignCustomCode('');
        setAssignCustomName('');
    };

    const handleRemoveCustomSubject = (codeToRemove) => {
        setCustomSubjectsList(prev => prev.filter(s => s.code !== codeToRemove));
    };

    // Active subjects resolution
    const activeSubjectCodes = useMemo(() => {
        if (manualSubjectMode) {
            const list = customSubjectsList.map(s => s.code);
            const currentTyped = assignCustomCode.trim().toUpperCase();
            if (currentTyped && !list.includes(currentTyped)) {
                return [...list, currentTyped];
            }
            return list;
        }
        return assignSubjectCodes;
    }, [manualSubjectMode, customSubjectsList, assignCustomCode, assignSubjectCodes]);

    const activeTargetClassIds = useMemo(() => {
        return assignScope === 'shared' ? [null] : assignClassIds;
    }, [assignScope, assignClassIds]);

    const totalAssignmentsCount = activeSubjectCodes.length * activeTargetClassIds.length;

    // 4. Handle Open Assign Modal
    const handleOpenAssignModal = (faculty = null) => {
        const target = faculty || (currentFacultyId ? facultyList.find(f => f.faculty_id === currentFacultyId) : facultyList[0]);
        setAssignTargetFaculty(target);
        const facBranch = target?.department?.toUpperCase().slice(0, 2) || 'CS';
        setAssignBranch(facBranch);
        setAssignSemester(semester && semester !== 'all' ? String(semester) : '6');
        setAssignScheme('2022');
        setAssignScope('class');

        const initialClassIds = classFilter && classFilter !== 'all'
            ? [classFilter]
            : (modalAvailableClasses.length > 0 ? [modalAvailableClasses[0].id] : []);
        setAssignClassIds(initialClassIds);

        setAssignSubjectCodes([]);
        setAssignSubjectSearch('');
        setCustomSubjectsList([]);
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

        if (activeSubjectCodes.length === 0) {
            setAssignError('Please select or enter at least one subject code.');
            return;
        }

        if (assignScope === 'class' && assignClassIds.length === 0 && modalAvailableClasses.length > 0) {
            setAssignError('Please select at least one class section for this faculty member.');
            return;
        }

        setAssignSubmitting(true);
        setAssignError('');

        try {
            const payload = {
                faculty_id: assignTargetFaculty.faculty_id,
                subject_codes: activeSubjectCodes,
                branch: assignBranch,
                semester: parseInt(assignSemester, 10),
                scheme: assignScheme,
                class_ids: activeTargetClassIds
            };

            const res = await apiRequest('/api/admin/faculty-assignments', {
                method: 'POST',
                body: payload
            });

            if (res) {
                setShowAssignModal(false);
                const scopeLabel = assignScope === 'shared'
                    ? 'All Sections (Shared)'
                    : `${assignClassIds.length} Section${assignClassIds.length === 1 ? '' : 's'}`;
                setRefreshStatus({
                    type: 'new',
                    msg: `✓ Successfully mapped ${activeSubjectCodes.length} subject(s) across ${scopeLabel}!`
                });
                setTimeout(() => setRefreshStatus(null), 5000);
                await loadPerformance();
            }
        } catch (err) {
            console.error('Failed to assign subjects:', err);
            setAssignError(err.message || 'Failed to assign subjects. Check for duplicate assignments.');
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
        writeWorkbook(XLSX, wb, `Faculty_Teaching_Performance_${branch || 'All'}.xlsx`);
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

    const isInstitutionalAdmin = currentUserRole === 'admin' || role === 'admin';

    // Helper for faculty avatar initials
    const getInitials = (name) => {
        if (!name) return 'FA';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    // Filter state helpers
    const hasActiveFilters = Boolean(
        branch ||
        (semester && semester !== 'all') ||
        (classFilter && classFilter !== 'all') ||
        searchQuery.trim() ||
        (quickFilter && quickFilter !== 'all')
    );

    const activeFilterCount = [
        Boolean(branch),
        Boolean(semester && semester !== 'all'),
        Boolean(classFilter && classFilter !== 'all'),
        Boolean(searchQuery.trim()),
        Boolean(quickFilter && quickFilter !== 'all')
    ].filter(Boolean).length;

    const handleResetFilters = () => {
        setBranch('');
        setSemester('all');
        setClassFilter('all');
        setSearchQuery('');
        setQuickFilter('all');
    };

    const resolveClassesHref = (classId = null) => {
        if (embedded && onNavigateTab) return '#';
        if (embedded) return classId ? `/admin/terminal?tab=classes&classId=${classId}` : '/admin/terminal?tab=classes';
        if (isInstitutionalAdmin) return classId ? `/admin/classes?classId=${classId}` : '/admin/classes';
        return classId ? `/faculty/classes?classId=${classId}` : '/faculty/classes';
    };

    const handleClassesClick = (e, classId = null) => {
        if (embedded && onNavigateTab) {
            e.preventDefault();
            onNavigateTab('classes');
        }
    };

    return (
        <div style={{ padding: embedded ? '0' : 'var(--page-py) var(--page-px)', maxWidth: embedded ? '100%' : '1440px', margin: '0 auto' }} className="gf-fade-up">
            {/* Top Navigation & Action Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>verified</span>
                            {isInstitutionalAdmin ? 'Accreditation & Institutional Governance Suite' : 'Accreditation & HOD Command Suite'}
                        </span>
                    </PageHeaderEyebrow>
                    <PageHeaderTitle>Faculty Teaching Performance</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Attribution of student examination outcomes, pass percentages, and NAAC/NBA grade distribution across departments and classes.
                    </PageHeaderSubtitle>
                </PageHeader>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={() => handleOpenAssignModal()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--primary)',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(23, 75, 77, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>add_link</span>
                        + Assign Subject
                    </button>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={displayedFaculty.length === 0}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--surface)',
                            color: 'var(--tx-main)',
                            border: '1px solid var(--border)',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: displayedFaculty.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: displayedFaculty.length === 0 ? 0.6 : 1,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px', color: '#166534' }}>description</span>
                        Export Excel
                    </button>

                    <button
                        type="button"
                        onClick={handleExportPDF}
                        disabled={displayedFaculty.length === 0}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--surface)',
                            color: 'var(--tx-main)',
                            border: '1px solid var(--border)',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: displayedFaculty.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: displayedFaculty.length === 0 ? 0.6 : 1,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px', color: '#B91C1C' }}>picture_as_pdf</span>
                        Export PDF
                    </button>

                    <button
                        type="button"
                        onClick={() => loadPerformance(true)}
                        disabled={refreshing || loading}
                        title="Check for new examination data and dynamically sync"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--surface)',
                            color: 'var(--tx-main)',
                            border: '1px solid var(--border)',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: (refreshing || loading) ? 'wait' : 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className={`material-icons-round ${refreshing ? 'gf-spin' : ''}`} style={{ fontSize: '18px', color: 'var(--primary)' }}>sync</span>
                        {refreshing ? 'Checking Live Data…' : 'Refresh'}
                    </button>
                </div>
            </div>

            {refreshStatus && (
                <div
                    style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        background: refreshStatus.type === 'error' ? 'var(--red-bg)' : refreshStatus.type === 'new' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-low)',
                        color: refreshStatus.type === 'error' ? 'var(--red)' : refreshStatus.type === 'new' ? 'var(--green)' : 'var(--tx-main)',
                        border: `1px solid ${refreshStatus.type === 'error' ? 'var(--red)' : refreshStatus.type === 'new' ? 'var(--green)' : 'var(--border)'}`,
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '18px'
                    }}
                    className="gf-fade-in"
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>
                        {refreshStatus.type === 'error' ? 'error' : refreshStatus.type === 'new' ? 'auto_awesome' : 'check_circle'}
                    </span>
                    {refreshStatus.msg}
                </div>
            )}

            {/* View Perspective Switcher & Manage Classes Link */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
                <div style={{ display: 'inline-flex', background: 'var(--surface-low)', padding: '5px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <button
                        type="button"
                        onClick={() => setViewPerspective('all')}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            background: viewPerspective === 'all' ? 'var(--surface)' : 'transparent',
                            color: viewPerspective === 'all' ? 'var(--tx-main)' : 'var(--tx-muted)',
                            boxShadow: viewPerspective === 'all' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px', color: viewPerspective === 'all' ? 'var(--primary)' : 'inherit' }}>account_balance</span>
                        {isInstitutionalAdmin ? 'Institution Overview' : 'Department Overview'} ({facultyList.length})
                    </button>
                    {(!isInstitutionalAdmin || currentFacultyId) && (
                        <button
                            type="button"
                            onClick={() => setViewPerspective('my')}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: 'none',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                background: viewPerspective === 'my' ? 'var(--primary)' : 'transparent',
                                color: viewPerspective === 'my' ? '#FFFFFF' : 'var(--tx-muted)',
                                boxShadow: viewPerspective === 'my' ? '0 2px 6px rgba(23,75,77,0.3)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>person</span>
                            My Teaching Portfolio
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <a
                        href={resolveClassesHref()}
                        onClick={(e) => handleClassesClick(e)}
                        style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: 'var(--primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            background: 'var(--surface)',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                        Manage Classes &amp; Student Rosters ({classesList.length}) →
                    </a>
                </div>
            </div>

            {/* Executive KPI Scorecards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {/* 1. Overall Pass Average */}
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '20px 22px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-muted)' }}>
                            {viewPerspective === 'my' ? 'My Overall Pass Rate' : 'Dept Pass Average'}
                        </span>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: kpis.passRate >= 80 ? 'rgba(16, 185, 129, 0.12)' : kpis.passRate >= 70 ? 'rgba(23, 75, 77, 0.1)' : 'rgba(239, 68, 68, 0.12)',
                            color: kpis.passRate >= 80 ? '#10B981' : kpis.passRate >= 70 ? 'var(--primary)' : '#EF4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>trending_up</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px' }}>
                            {kpis.totalAppeared > 0 ? `${kpis.passRate}%` : '—'}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: kpis.passRate >= 80 ? '#10B981' : kpis.passRate >= 70 ? 'var(--primary)' : 'var(--tx-muted)', fontWeight: 700 }}>
                                {kpis.totalPassed} of {kpis.totalAppeared} Passed
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Total Evaluated Students */}
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '20px 22px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-muted)' }}>
                            Evaluated Students
                        </span>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#6366F1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>groups</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px' }}>
                            {kpis.totalAppeared.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-muted)' }}>
                            {kpis.coveredClassesCount > 0 ? `Across ${kpis.coveredClassesCount} Classes` : 'Exam Records Analyzed'}
                        </div>
                    </div>
                </div>

                {/* 3. Active Faculty Roster */}
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '20px 22px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-muted)' }}>
                            Active Faculty Roster
                        </span>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>school</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px' }}>
                            {kpis.activeAssigned} <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tx-dim)' }}>/ {kpis.totalFaculty}</span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-muted)' }}>
                            {kpis.totalFaculty > 0 ? `${((kpis.activeAssigned / kpis.totalFaculty) * 100).toFixed(0)}% Teaching Assigned Classes` : 'Teaching Assigned Classes'}
                        </div>
                    </div>
                </div>

                {/* 4. NBA Remedial Attention Count */}
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '20px 22px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-muted)' }}>
                            NBA Remedial Focus
                        </span>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: kpis.atRiskSubjectsCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                            color: kpis.atRiskSubjectsCount > 0 ? '#DC2626' : '#10B981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>
                                {kpis.atRiskSubjectsCount > 0 ? 'warning_amber' : 'check_circle'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: kpis.atRiskSubjectsCount > 0 ? '#DC2626' : 'var(--tx-main)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px' }}>
                            {kpis.atRiskSubjectsCount}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-muted)' }}>
                            Courses &lt; 75% Pass Benchmark
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Toolbar (Rock-solid, zero overlap layout) */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                marginBottom: '22px'
            }}>
                {/* Toolbar Header with active filters indication & reset */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>tune</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-main)' }}>
                            Filter &amp; Scope Controls
                        </span>
                        {hasActiveFilters && (
                            <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(23, 75, 77, 0.1)',
                                color: 'var(--primary)',
                                fontSize: '11px',
                                fontWeight: 800
                            }}>
                                {activeFilterCount} Active
                            </span>
                        )}
                    </div>

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--primary)',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                borderRadius: '6px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>restart_alt</span>
                            Reset All Filters
                        </button>
                    )}
                </div>

                {/* Unified Filter Controls Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                    alignItems: 'start',
                    marginBottom: '16px'
                }}>
                    {/* 1. Instant Search Box */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            color: 'var(--tx-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>search</span>
                            Search Faculty, Class or Subject
                        </label>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input
                                type="text"
                                placeholder="Search by name, class (e.g. CS-6A) or code..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '42px',
                                    padding: '0 32px 0 36px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    color: 'var(--tx-main)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <span
                                className="material-icons-round"
                                style={{
                                    position: 'absolute',
                                    left: '11px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '18px',
                                    color: 'var(--tx-dim)',
                                    pointerEvents: 'none'
                                }}
                            >
                                search
                            </span>
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        color: 'var(--tx-dim)',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Clear search"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 2. Department / Branch Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            color: 'var(--tx-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>apartment</span>
                            Department / Branch
                        </label>
                        <select
                            value={branch}
                            onChange={e => setBranch(e.target.value)}
                            style={{
                                width: '100%',
                                height: '42px',
                                padding: '0 36px 0 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface-low)',
                                color: 'var(--tx-main)',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="">All Departments</option>
                            {meta.branches.map(b => (
                                <option key={b.code} value={b.code}>
                                    {b.code} - {b.label || b.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 3. Semester Filter Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            color: 'var(--tx-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>calendar_month</span>
                            Semester Filter
                        </label>
                        <select
                            value={semester}
                            onChange={e => setSemester(e.target.value)}
                            style={{
                                width: '100%',
                                height: '42px',
                                padding: '0 36px 0 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface-low)',
                                color: 'var(--tx-main)',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="all">All Semesters</option>
                            {meta.semesters.map(s => (
                                <option key={s} value={s}>
                                    Semester {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 4. Class Filter Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            color: 'var(--tx-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>meeting_room</span>
                            Class / Section Filter
                        </label>
                        <select
                            value={classFilter}
                            onChange={e => setClassFilter(e.target.value)}
                            style={{
                                width: '100%',
                                height: '42px',
                                padding: '0 36px 0 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface-low)',
                                color: 'var(--tx-main)',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="all">All Class Sections</option>
                            {classesList.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.branch} · Sem {c.semester}{c.section ? ` · Sec ${c.section}` : ''})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Quick Filter Status Chips */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-low)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginRight: '4px' }}>
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
                                    padding: '5px 12px',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    background: active ? 'var(--primary)' : 'var(--surface-low)',
                                    color: active ? '#FFFFFF' : 'var(--tx-muted)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: active ? '0 2px 6px rgba(23, 75, 77, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>{chip.label}</span>
                                <span style={{ opacity: active ? 0.9 : 0.75, fontSize: '11px' }}>({chip.count})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Performance Data Table */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                overflow: 'hidden'
            }}>
                {/* Table Header / Roster Summary Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface)'
                }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                            Faculty Attribution &amp; Performance Roster
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                            Showing {displayedFaculty.length} educators {hasActiveFilters ? '(filtered)' : ''}
                        </div>
                    </div>

                    {/* Grade Spread Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--tx-muted)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>Grade Spread:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10B981' }} />
                            <span>Distinction (≥90%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#6366F1' }} />
                            <span>First Class (75-89%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#F59E0B' }} />
                            <span>Pass (40-74%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#EF4444' }} />
                            <span>Fail (&lt;40%)</span>
                        </div>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>#</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Faculty Member</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Department</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '260px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Assigned Subjects &amp; Classes</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Appeared</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Passed</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Failed</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '95px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Pass Rate</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '130px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Grade Spread</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '85px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Avg Score</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '80px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-muted)' }}>Breakdown</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedFaculty.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '56px 20px', textAlign: 'center' }}>
                                        {loading ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '32px', animation: 'spin 1s linear infinite', color: 'var(--primary)' }}>sync</span>
                                                <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>Aggregating faculty teaching data...</span>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '56px',
                                                    height: '56px',
                                                    borderRadius: '50%',
                                                    background: 'var(--surface-low)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'var(--tx-dim)'
                                                }}>
                                                    <span className="material-icons-round" style={{ fontSize: '28px' }}>person_search</span>
                                                </div>
                                                <div style={{ fontWeight: 700, color: 'var(--tx-main)', fontSize: '15px' }}>No faculty records found matching current criteria</div>
                                                <div style={{ fontSize: '12.5px', color: 'var(--tx-muted)', maxWidth: '420px', lineHeight: 1.5 }}>
                                                    Try changing the branch, semester, or class filters, or click &quot;+ Assign Subject&quot; above to link faculty to VTU subjects and classes.
                                                </div>
                                                {hasActiveFilters && (
                                                    <button
                                                        type="button"
                                                        onClick={handleResetFilters}
                                                        style={{
                                                            marginTop: '6px',
                                                            padding: '8px 16px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface-low)',
                                                            color: 'var(--primary)',
                                                            fontWeight: 700,
                                                            fontSize: '12.5px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Clear Active Filters
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                displayedFaculty.map((f, idx) => {
                                    const isExpanded = expandedFacultyId === f.faculty_id;
                                    const isSelf = currentFacultyId && f.faculty_id === currentFacultyId;
                                    const passColor = f.pass_rate >= 85 ? '#10B981' : f.pass_rate >= 70 ? 'var(--primary)' : f.pass_rate > 0 ? '#EF4444' : 'var(--tx-dim)';

                                    const gs = f.grade_spread || {};
                                    const distinction = (gs.O || 0) + (gs['A+'] || 0);
                                    const firstClass = (gs.A || 0) + (gs['B+'] || 0);
                                    const secondPass = (gs.B || 0) + (gs.C || 0) + (gs.P || 0);
                                    const failed = gs.F || 0;
                                    const totalGrades = distinction + firstClass + secondPass + failed;

                                    return (
                                        <Fragment key={f.faculty_id || idx}>
                                            <tr style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: isExpanded ? 'var(--surface-low)' : isSelf ? 'rgba(23, 75, 77, 0.04)' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}>
                                                <td style={{ padding: '14px 14px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                    {idx + 1}
                                                </td>

                                                <td style={{ padding: '14px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '34px',
                                                            height: '34px',
                                                            borderRadius: '50%',
                                                            background: 'rgba(23, 75, 77, 0.08)',
                                                            color: 'var(--primary)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 800,
                                                            fontSize: '12px',
                                                            flexShrink: 0
                                                        }}>
                                                            {getInitials(f.faculty_name)}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontWeight: 700, color: 'var(--tx-main)', fontSize: '13.5px' }}>{f.faculty_name}</span>
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
                                                            {f.email && <div style={{ fontSize: '11.5px', color: 'var(--tx-muted)', fontWeight: 400 }}>{f.email}</div>}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td style={{ padding: '14px 14px' }}>
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--tx-muted)',
                                                        fontWeight: 700,
                                                        fontSize: '11.5px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {f.department}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '14px 14px' }}>
                                                    {f.subjects.length === 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenAssignModal(f)}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '20px',
                                                                border: '1px dashed var(--primary)',
                                                                background: 'rgba(23, 75, 77, 0.06)',
                                                                color: 'var(--primary)',
                                                                fontSize: '12px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>add</span>
                                                            Link Subject &amp; Class
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
                                                                        padding: '3px 8px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 800,
                                                                        fontFamily: 'monospace',
                                                                        color: 'var(--primary)'
                                                                    }}>
                                                                        {s.subject_code}
                                                                    </span>
                                                                    {s.class_name && (
                                                                        <span style={{
                                                                            padding: '3px 7px',
                                                                            fontSize: '10.5px',
                                                                            fontWeight: 700,
                                                                            background: 'rgba(23, 75, 77, 0.08)',
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
                                                                    color: 'var(--primary)',
                                                                    cursor: 'pointer',
                                                                    padding: '2px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center'
                                                                }}
                                                                title="Add another course / class assignment"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '20px' }}>add_circle_outline</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '14px 10px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.total_appeared}
                                                </td>

                                                <td style={{ padding: '14px 10px', textAlign: 'center', fontWeight: 800, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.total_passed}
                                                </td>

                                                <td style={{ padding: '14px 10px', textAlign: 'center', fontWeight: 800, color: f.total_failed > 0 ? '#EF4444' : 'var(--tx-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.total_failed}
                                                </td>

                                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        fontWeight: 900,
                                                        background: f.pass_rate >= 85 ? 'rgba(16, 185, 129, 0.12)' : f.pass_rate >= 70 ? 'rgba(23, 75, 77, 0.1)' : f.total_appeared > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-low)',
                                                        color: passColor,
                                                        border: `1px solid ${f.pass_rate >= 85 ? 'rgba(16, 185, 129, 0.3)' : f.pass_rate >= 70 ? 'rgba(23, 75, 77, 0.2)' : f.total_appeared > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`
                                                    }}>
                                                        {f.total_appeared > 0 ? `${f.pass_rate}%` : '—'}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
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
                                                            {distinction > 0 && <div style={{ width: `${(distinction / totalGrades) * 100}%`, background: '#10B981' }} />}
                                                            {firstClass > 0 && <div style={{ width: `${(firstClass / totalGrades) * 100}%`, background: '#6366F1' }} />}
                                                            {secondPass > 0 && <div style={{ width: `${(secondPass / totalGrades) * 100}%`, background: '#F59E0B' }} />}
                                                            {failed > 0 && <div style={{ width: `${(failed / totalGrades) * 100}%`, background: '#EF4444' }} />}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '11px' }}>—</span>
                                                    )}
                                                </td>

                                                <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.avg_score > 0 ? f.avg_score : '—'}
                                                </td>

                                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                    {f.subjects.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedFacultyId(isExpanded ? null : f.faculty_id)}
                                                            style={{
                                                                background: isExpanded ? 'var(--primary)' : 'var(--surface-low)',
                                                                color: isExpanded ? '#FFFFFF' : 'var(--tx-main)',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '8px',
                                                                width: '32px',
                                                                height: '32px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                            title={isExpanded ? 'Collapse subject breakdown' : 'Expand subject breakdown'}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '11px' }}>—</span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expanded Subject Breakdown */}
                                            {isExpanded && (
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                                    <td colSpan={11} style={{ padding: '18px 24px' }}>
                                                        <div style={{
                                                            background: 'var(--surface)',
                                                            borderRadius: '12px',
                                                            border: '1px solid var(--border)',
                                                            padding: '16px 20px',
                                                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                                                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.04em' }}>
                                                                    Subject &amp; Class-wise Performance Breakdown for {f.faculty_name}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenAssignModal(f)}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: 'transparent',
                                                                        color: 'var(--primary)',
                                                                        fontSize: '12px',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}
                                                                >
                                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>add</span>
                                                                    Assign Additional Subject / Class
                                                                </button>
                                                            </div>

                                                            <div style={{ overflowX: 'auto' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', borderRadius: '8px', overflow: 'hidden' }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-low)' }}>
                                                                            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Subject Code</th>
                                                                            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Subject Name</th>
                                                                            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Class / Section</th>
                                                                            <th style={{ padding: '9px 8px', textAlign: 'center', width: '55px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Sem</th>
                                                                            <th style={{ padding: '9px 8px', textAlign: 'center', width: '70px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Appeared</th>
                                                                            <th style={{ padding: '9px 8px', textAlign: 'center', width: '70px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Passed</th>
                                                                            <th style={{ padding: '9px 8px', textAlign: 'center', width: '70px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Failed</th>
                                                                            <th style={{ padding: '9px 10px', textAlign: 'center', width: '80px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Pass %</th>
                                                                            <th style={{ padding: '9px 10px', textAlign: 'center', width: '80px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Avg Score</th>
                                                                            <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--tx-muted)' }}>Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {f.subjects.map(s => (
                                                                            <tr key={s.assignment_id || s.subject_code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                                                <td style={{ padding: '10px 12px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                                                    {s.subject_code}
                                                                                </td>
                                                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                                                                    {s.subject_name}
                                                                                </td>
                                                                                <td style={{ padding: '10px 12px' }}>
                                                                                    {s.class_name ? (
                                                                                        <a
                                                                                            href={resolveClassesHref(s.class_id)}
                                                                                            onClick={(e) => handleClassesClick(e, s.class_id)}
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
                                                                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>
                                                                                    Sem {s.semester}
                                                                                </td>
                                                                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {s.appeared}
                                                                                </td>
                                                                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#10B981', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {s.passed}
                                                                                </td>
                                                                                <td style={{ padding: '10px 8px', textAlign: 'center', color: s.failed > 0 ? '#EF4444' : 'var(--tx-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {s.failed}
                                                                                </td>
                                                                                <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                                                    <span style={{
                                                                                        padding: '2px 8px',
                                                                                        borderRadius: '6px',
                                                                                        fontSize: '11px',
                                                                                        fontWeight: 800,
                                                                                        background: s.pass_rate >= 85 ? 'rgba(16, 185, 129, 0.12)' : s.pass_rate >= 70 ? 'rgba(23, 75, 77, 0.1)' : s.appeared > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-low)',
                                                                                        color: s.pass_rate >= 85 ? '#10B981' : s.pass_rate >= 70 ? 'var(--primary)' : s.appeared > 0 ? '#EF4444' : 'var(--tx-dim)'
                                                                                    }}>
                                                                                        {s.appeared > 0 ? `${s.pass_rate}%` : '—'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {s.avg_score}
                                                                                </td>
                                                                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                                                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                                                        {/* Subject Analytics Link */}
                                                                                        <a
                                                                                            href={isInstitutionalAdmin ? `/admin/analytics/subjects?code=${encodeURIComponent(s.subject_code)}` : `/faculty/analytics/subject?code=${encodeURIComponent(s.subject_code)}`}
                                                                                            style={{
                                                                                                padding: '4px 9px',
                                                                                                borderRadius: '6px',
                                                                                                background: 'var(--surface-low)',
                                                                                                border: '1px solid var(--border)',
                                                                                                color: 'var(--tx-main)',
                                                                                                fontSize: '11.5px',
                                                                                                fontWeight: 700,
                                                                                                textDecoration: 'none',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '4px'
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
                                                                                                    padding: '4px 9px',
                                                                                                    borderRadius: '6px',
                                                                                                    background: 'rgba(239, 68, 68, 0.08)',
                                                                                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                                                    color: '#EF4444',
                                                                                                    fontSize: '11.5px',
                                                                                                    fontWeight: 700,
                                                                                                    cursor: 'pointer',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    gap: '4px'
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
                                                                                                    padding: '4px 7px',
                                                                                                    borderRadius: '6px',
                                                                                                    background: 'transparent',
                                                                                                    border: 'none',
                                                                                                    color: 'var(--tx-dim)',
                                                                                                    cursor: 'pointer'
                                                                                                }}
                                                                                                title="Remove Subject Assignment"
                                                                                            >
                                                                                                <span className="material-icons-round" style={{ fontSize: '17px', color: '#EF4444' }}>delete_outline</span>
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Assign Subject to Faculty rendered in Portal for true viewport coverage */}
            {mounted && showAssignModal && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'grid',
                        placeItems: 'center',
                        padding: 'clamp(12px, 3vw, 24px)',
                        overflowY: 'auto'
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowAssignModal(false);
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="assign-modal-title"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '20px',
                            width: 'min(100%, 600px)',
                            maxHeight: 'min(92vh, 780px)',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                            overflow: 'hidden',
                            margin: 'auto'
                        }}
                    >
                        {/* Modal Header (Sticky) */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '20px 24px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    background: 'rgba(13, 74, 71, 0.08)',
                                    color: 'var(--primary, #0D4A47)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '24px' }}>assignment_ind</span>
                                </div>
                                <div>
                                    <h2 id="assign-modal-title" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.02em' }}>
                                        Assign Subject to Faculty
                                    </h2>
                                    <p style={{ fontSize: '12.5px', color: 'var(--tx-muted)', margin: '3px 0 0' }}>
                                        Map teaching attribution, curriculum scope, and division.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                style={{
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    borderRadius: '10px',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--tx-dim)',
                                    transition: 'all 0.15s ease'
                                }}
                                aria-label="Close dialog"
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>

                        {assignError && (
                            <div style={{ margin: '16px 24px 0', padding: '12px 16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#EF4444', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>error_outline</span>
                                <span>{assignError}</span>
                            </div>
                        )}

                        {/* Modal Body (Scrollable & Responsive) */}
                        <form
                            onSubmit={handleSaveAssignment}
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '20px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px'
                            }}
                        >
                            {/* 1. FACULTY MEMBER */}
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
                                        padding: '12px 14px',
                                        borderRadius: '10px',
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
                                            <div style={{ fontSize: '11.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                {assignTargetFaculty?.email || ''} · {assignTargetFaculty?.department || 'Department'}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, background: 'var(--primary, #0D4A47)', color: '#FFFFFF', padding: '3px 8px', borderRadius: '6px' }}>
                                            {assignTargetFaculty?.department || 'FACULTY'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* 2. BRANCH & SEMESTER GRID */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
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
                                            { value: 'EC', label: 'Electronics & Comm (EC)' },
                                            { value: 'EE', label: 'Electrical & Electronics (EE)' },
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

                            {/* 3. SCHEME */}
                            <div>
                                <Select
                                    label="Curriculum Scheme"
                                    value={assignScheme}
                                    onChange={e => setAssignScheme(e.target.value)}
                                    options={[
                                        { value: '2022', label: '2022 Scheme' },
                                        { value: '2025', label: '2025 Scheme' },
                                        { value: '2021', label: '2021 Scheme' },
                                        { value: '2018', label: '2018 Scheme' }
                                    ]}
                                />
                            </div>

                            {/* 4. CLASS / DIVISION SCOPE SELECTOR */}
                            <div style={{
                                padding: '14px 16px',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface-low)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Which Class / Section Does Faculty Teach? <span style={{ color: '#EF4444' }}>*</span>
                                    </label>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                        {modalAvailableClasses.length} Section{modalAvailableClasses.length === 1 ? '' : 's'} in Sem {assignSemester}
                                    </span>
                                </div>

                                {/* Radio Scope Options */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setAssignScope('class')}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: assignScope === 'class' ? '1.5px solid var(--primary, #0D4A47)' : '1px solid var(--border)',
                                            background: assignScope === 'class' ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface)',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)' }}>Specific Section Only</div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>E.g. Sec A only or Sec B only</div>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'class' ? 'var(--primary, #0D4A47)' : 'var(--tx-dim)' }}>
                                            {assignScope === 'class' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setAssignScope('shared')}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: assignScope === 'shared' ? '1.5px solid var(--primary, #0D4A47)' : '1px solid var(--border)',
                                            background: assignScope === 'shared' ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface)',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)' }}>All Sections (Shared)</div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>Teaches combined cohort</div>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'shared' ? 'var(--primary, #0D4A47)' : 'var(--tx-dim)' }}>
                                            {assignScope === 'shared' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                        </span>
                                    </button>
                                </div>

                                {/* Multi-Class Division Picker if specific section */}
                                {assignScope === 'class' && (
                                    <div style={{ marginTop: '4px' }}>
                                        {/* Filter pills for cross-branch / cross-semester picking */}
                                        <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Branch Filter:
                                                </span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setClassBranchFilter('all')}
                                                        style={{
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '3px 8px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            background: classBranchFilter === 'all' ? 'var(--primary, #0D4A47)' : 'var(--surface-low)',
                                                            color: classBranchFilter === 'all' ? '#FFFFFF' : 'var(--tx-muted)',
                                                        }}
                                                    >
                                                        All Branches
                                                    </button>
                                                    {availableClassBranches.map(b => (
                                                        <button
                                                            key={b}
                                                            type="button"
                                                            onClick={() => setClassBranchFilter(b)}
                                                            style={{
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                cursor: 'pointer',
                                                                background: classBranchFilter === b ? 'var(--primary, #0D4A47)' : 'var(--surface-low)',
                                                                color: classBranchFilter === b ? '#FFFFFF' : 'var(--tx-muted)',
                                                            }}
                                                        >
                                                            {b}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Semester Filter:
                                                </span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setClassSemesterFilter('all')}
                                                        style={{
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '3px 8px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            background: classSemesterFilter === 'all' ? 'var(--primary, #0D4A47)' : 'var(--surface-low)',
                                                            color: classSemesterFilter === 'all' ? '#FFFFFF' : 'var(--tx-muted)',
                                                        }}
                                                    >
                                                        All Semesters
                                                    </button>
                                                    {availableClassSemesters.map(sem => (
                                                        <button
                                                            key={sem}
                                                            type="button"
                                                            onClick={() => setClassSemesterFilter(String(sem))}
                                                            style={{
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                cursor: 'pointer',
                                                                background: classSemesterFilter === String(sem) ? 'var(--primary, #0D4A47)' : 'var(--surface-low)',
                                                                color: classSemesterFilter === String(sem) ? '#FFFFFF' : 'var(--tx-muted)',
                                                            }}
                                                        >
                                                            Sem {sem}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                                Select Class Section(s):
                                            </label>
                                            {modalAvailableClasses.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                        {assignClassIds.length} of {classesList.length} total selected
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectAllClasses}
                                                        style={{ background: 'none', border: 'none', color: 'var(--primary, #0D4A47)', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                                                    >
                                                        Select All Visible
                                                    </button>
                                                    <span style={{ color: 'var(--border)' }}>·</span>
                                                    <button
                                                        type="button"
                                                        onClick={handleClearAllClasses}
                                                        style={{ background: 'none', border: 'none', color: 'var(--tx-dim)', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {modalAvailableClasses.length === 0 ? (
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontStyle: 'italic', padding: '12px', textAlign: 'center', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                No classes match the filter. Click &quot;All Branches&quot; or &quot;All Semesters&quot; above to choose classes.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
                                                {modalAvailableClasses.map(c => {
                                                    const isSelected = assignClassIds.includes(c.id);
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => toggleAssignClass(c.id)}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderRadius: '8px',
                                                                border: isSelected ? '1.5px solid var(--primary, #0D4A47)' : '1px solid var(--border)',
                                                                background: isSelected ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface-low)',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '8px',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span>{c.name}</span>
                                                                    {c.section && (
                                                                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--primary, #0D4A47)', color: '#fff', fontWeight: 800 }}>
                                                                            Sec {c.section}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#1D4ED8' }}>
                                                                        {c.branch}
                                                                    </span>
                                                                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                                                                        Sem {c.semester}
                                                                    </span>
                                                                    <span style={{ fontSize: '10.5px', color: 'var(--tx-muted)' }}>
                                                                        {c.student_count ?? 0} Students {c.batch ? `· ${c.batch}` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <span className="material-icons-round" style={{ fontSize: '20px', color: isSelected ? 'var(--primary, #0D4A47)' : 'var(--tx-dim)' }}>
                                                                {isSelected ? 'check_box' : 'check_box_outline_blank'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(13, 74, 71, 0.06)',
                                            border: '1px solid rgba(13, 74, 71, 0.15)',
                                            fontSize: '11.5px',
                                            color: 'var(--tx-main)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary, #0D4A47)' }}>verified</span>
                                            <span>
                                                Evaluation strictly isolated to students enrolled in the {assignClassIds.length} selected section{assignClassIds.length === 1 ? '' : 's'}. Faculty can teach across multiple branches (CS, DS, AI).
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 5. MULTI-SUBJECT SELECTOR WITH TOGGLE */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Subject(s) <span style={{ color: '#EF4444' }}>*</span>
                                        </label>
                                        <span style={{ fontSize: '11px', fontWeight: 800, background: activeSubjectCodes.length > 0 ? 'var(--primary, #0D4A47)' : 'var(--surface-low)', color: activeSubjectCodes.length > 0 ? '#fff' : 'var(--tx-muted)', padding: '2px 8px', borderRadius: '10px' }}>
                                            {activeSubjectCodes.length} selected
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {!manualSubjectMode && (
                                            <span style={{ fontSize: '11.5px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                                {assignSubjectsLoading ? 'Loading syllabus...' : `${assignAvailableSubjects.length} courses in catalog`}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setManualSubjectMode(!manualSubjectMode)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--primary, #0D4A47)',
                                                fontSize: '11.5px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            {manualSubjectMode ? '← Select from catalog' : '+ Enter custom code'}
                                        </button>
                                    </div>
                                </div>

                                {manualSubjectMode ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr)) auto', gap: '8px', alignItems: 'center' }}>
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
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={handleAddCustomSubject}
                                                disabled={!assignCustomCode.trim()}
                                                style={{ height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 800 }}
                                            >
                                                + Add
                                            </Button>
                                        </div>

                                        {customSubjectsList.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', borderRadius: '8px', background: 'var(--surface-low)', border: '1px solid var(--border)' }}>
                                                {customSubjectsList.map(cs => (
                                                    <span
                                                        key={cs.code}
                                                        style={{
                                                            fontSize: '11.5px',
                                                            fontWeight: 700,
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            background: 'var(--surface)',
                                                            border: '1px solid var(--border)',
                                                            color: 'var(--tx-main)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <span><strong>{cs.code}</strong> {cs.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveCustomSubject(cs.code)}
                                                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {/* Search & Bulk Select Controls */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <div style={{ position: 'relative', flex: 1 }}>
                                                <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: 'var(--tx-dim)' }}>
                                                    search
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder="Search syllabus subjects (e.g. BCS601, Machine Learning)..."
                                                    value={assignSubjectSearch}
                                                    onChange={e => setAssignSubjectSearch(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '7px 10px 7px 32px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface)',
                                                        fontSize: '12px',
                                                        color: 'var(--tx-main)',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>
                                            {filteredCatalogSubjects.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectAllSubjects}
                                                        style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface-low)',
                                                            color: 'var(--tx-main)',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Select All
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleClearAllSubjects}
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border)',
                                                            background: 'transparent',
                                                            color: 'var(--tx-dim)',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Selected Subjects Chips Preview */}
                                        {assignSubjectCodes.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 10px', borderRadius: '8px', background: 'var(--surface-low)', border: '1px solid var(--border)', maxHeight: '70px', overflowY: 'auto' }}>
                                                {assignSubjectCodes.map(code => {
                                                    const subObj = assignAvailableSubjects.find(s => (s.subject_code || s.code) === code);
                                                    return (
                                                        <span
                                                            key={code}
                                                            style={{
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(13, 74, 71, 0.1)',
                                                                border: '1px solid rgba(13, 74, 71, 0.25)',
                                                                color: 'var(--primary, #0D4A47)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <span><strong>{code}</strong> {subObj?.name || subObj?.subject_name ? `· ${(subObj?.name || subObj?.subject_name).slice(0, 20)}...` : ''}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleAssignSubject(code)}
                                                                style={{ background: 'none', border: 'none', color: 'var(--primary, #0D4A47)', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Scrollable Course Checklist */}
                                        <div style={{
                                            maxHeight: '190px',
                                            overflowY: 'auto',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            display: 'flex',
                                            flexDirection: 'column'
                                        }}>
                                            {assignSubjectsLoading ? (
                                                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                    Loading syllabus courses...
                                                </div>
                                            ) : filteredCatalogSubjects.length === 0 ? (
                                                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                    {assignAvailableSubjects.length === 0
                                                        ? 'No subjects found in catalog for this branch/semester. Click "+ Enter custom code" above.'
                                                        : 'No courses match your search query.'}
                                                </div>
                                            ) : (
                                                filteredCatalogSubjects.map(s => {
                                                    const code = (s.subject_code || s.code || '').toUpperCase().trim();
                                                    const name = s.subject_name || s.name;
                                                    const credits = s.credits;
                                                    const isSelected = assignSubjectCodes.includes(code);

                                                    return (
                                                        <div
                                                            key={code}
                                                            onClick={() => toggleAssignSubject(code)}
                                                            style={{
                                                                padding: '8px 12px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '10px',
                                                                borderBottom: '1px solid var(--border)',
                                                                background: isSelected ? 'rgba(13, 74, 71, 0.06)' : 'transparent',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.15s ease'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                                <span className="material-icons-round" style={{ fontSize: '18px', color: isSelected ? 'var(--primary, #0D4A47)' : 'var(--tx-dim)' }}>
                                                                    {isSelected ? 'check_box' : 'check_box_outline_blank'}
                                                                </span>
                                                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: isSelected ? 'var(--primary, #0D4A47)' : 'var(--surface-low)', color: isSelected ? '#fff' : 'var(--tx-main)', letterSpacing: '0.03em' }}>
                                                                    {code}
                                                                </span>
                                                                <span style={{ fontSize: '12px', color: 'var(--tx-main)', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {name}
                                                                </span>
                                                            </div>
                                                            {credits != null && (
                                                                <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600, flexShrink: 0 }}>
                                                                    {credits} Cr
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 6. REAL-TIME ASSIGNMENT SUMMARY CARD */}
                            <div style={{
                                padding: '12px 16px',
                                borderRadius: '10px',
                                background: totalAssignmentsCount > 0 ? 'rgba(13, 74, 71, 0.08)' : 'var(--surface-low)',
                                border: totalAssignmentsCount > 0 ? '1.5px solid rgba(13, 74, 71, 0.3)' : '1px dashed var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: totalAssignmentsCount > 0 ? 'var(--primary, #0D4A47)' : 'var(--surface)',
                                        color: totalAssignmentsCount > 0 ? '#FFFFFF' : 'var(--tx-dim)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                            {totalAssignmentsCount > 0 ? 'playlist_add_check' : 'info_outline'}
                                        </span>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                            {totalAssignmentsCount > 0
                                                ? `${totalAssignmentsCount} Total Assignment${totalAssignmentsCount > 1 ? 's' : ''} to create`
                                                : 'Select at least 1 subject and 1 class section'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                            {assignScope === 'shared'
                                                ? `${activeSubjectCodes.length} subject(s) across All Sections (Shared)`
                                                : `${activeSubjectCodes.length} subject(s) × ${assignClassIds.length} class section(s)`}
                                        </div>
                                    </div>
                                </div>
                                {totalAssignmentsCount > 0 && (
                                    <span style={{
                                        fontSize: '12px',
                                        fontWeight: 900,
                                        background: 'var(--primary, #0D4A47)',
                                        color: '#fff',
                                        padding: '4px 12px',
                                        borderRadius: '12px'
                                    }}>
                                        {totalAssignmentsCount}
                                    </span>
                                )}
                            </div>

                            {/* Modal Footer Actions (Sticky Bottom) */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: '10px',
                                marginTop: '4px',
                                paddingTop: '12px',
                                borderTop: '1px solid var(--border)'
                            }}>
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setShowAssignModal(false)}
                                    disabled={assignSubmitting}
                                    style={{ borderRadius: '10px', padding: '10px 18px', fontWeight: 700 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    loading={assignSubmitting}
                                    disabled={totalAssignmentsCount === 0}
                                    style={{
                                        borderRadius: '10px',
                                        padding: '10px 22px',
                                        fontWeight: 800,
                                        background: 'var(--primary, #0D4A47)',
                                        color: '#FFFFFF'
                                    }}
                                >
                                    ✔ Confirm {totalAssignmentsCount > 1 ? `${totalAssignmentsCount} Assignments` : 'Assignment'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
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

export default FacultyPerformanceContent;
