'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, clearApiCache } from '../lib/api/client';
import { ConfirmDialog, SearchableSelect, Button, Input } from './ui';
import { filterAndRank } from '../lib/search-utils';

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
    if (!subjectBranch) return true; // Common/universal foundation course
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

export function FacultyAssignmentsContent({ embedded = false, preselectedFacultyId = null }) {
    const [assignments, setAssignments] = useState([]);
    const [facultyList, setFacultyList] = useState([]);
    const [classesList, setClassesList] = useState([]);
    const [subjectsList, setSubjectsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Dynamic latest semester calculation from existing classes
    const latestSem = useMemo(() => {
        if (!classesList?.length) return '6';
        const sems = classesList.map(c => Number(c.semester)).filter(n => !isNaN(n) && n > 0);
        return sems.length ? String(Math.max(...sems)) : '6';
    }, [classesList]);

    // Filters
    const [search, setSearch] = useState('');
    const [filterFaculty, setFilterFaculty] = useState(preselectedFacultyId || 'all');
    const [filterBranch, setFilterBranch] = useState('all');
    const [filterSemester, setFilterSemester] = useState('all');

    // Create Modal state
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [manualSubjectMode, setManualSubjectMode] = useState(false);
    const [assignScope, setAssignScope] = useState('class'); // 'class' (specific sections) or 'shared' (all sections)
    const [assignClassIds, setAssignClassIds] = useState([]);
    const [assignSubjectCodes, setAssignSubjectCodes] = useState([]);
    const [assignSubjectSearch, setAssignSubjectSearch] = useState('');
    const [assignCustomCode, setAssignCustomCode] = useState('');
    const [assignCustomName, setAssignCustomName] = useState('');
    const [customSubjectsList, setCustomSubjectsList] = useState([]);
    const [catalogSubjects, setCatalogSubjects] = useState([]);
    const [loadingCatalogSubjects, setLoadingCatalogSubjects] = useState(false);
    const [form, setForm] = useState({
        faculty_id: preselectedFacultyId || '',
        branch: 'CS',
        semester: '6',
        scheme: '2022',
        subject_code: '',
        class_id: '',
    });

    // Close modal on Escape
    useEffect(() => {
        if (!showAssignModal) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setShowAssignModal(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAssignModal]);

    // Dynamic catalog subject loading for modal
    useEffect(() => {
        if (!showAssignModal) return;
        let active = true;

        async function fetchCatalog() {
            setLoadingCatalogSubjects(true);
            try {
                const res = await apiRequest(`/api/subjects?branch=${form.branch || 'CS'}&semester=${form.semester || '6'}&scheme=${form.scheme || '2022'}`);
                const list = res?.subjects || res?.data || (Array.isArray(res) ? res : []);
                if (active) {
                    setCatalogSubjects(list);
                }
            } catch (err) {
                console.warn('Failed to load syllabus subjects in modal:', err);
            } finally {
                if (active) setLoadingCatalogSubjects(false);
            }
        }

        fetchCatalog();
        return () => { active = false; };
    }, [showAssignModal, form.branch, form.semester, form.scheme]);

    // Delete state
    const [confirmingDelete, setConfirmingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Sync preselected faculty if passed
    useEffect(() => {
        if (preselectedFacultyId) {
            setFilterFaculty(preselectedFacultyId);
            setForm(f => ({ ...f, faculty_id: preselectedFacultyId }));
        }
    }, [preselectedFacultyId]);

    const fetchData = useCallback(async (isSilent = false, isManual = false) => {
        const silent = typeof isSilent === 'boolean' ? isSilent : false;
        if (isManual) setIsRefreshing(true);
        if (!silent) setLoading(true);
        setError('');
        try {
            clearApiCache();
            const prevCount = assignments.length;
            // Proactively align admin session cookies if admin_session is stored
            if (typeof window !== 'undefined') {
                try {
                    const admStr = localStorage.getItem('admin_session');
                    if (admStr) {
                        const adm = JSON.parse(admStr);
                        if (adm?.token) {
                            await fetch('/api/auth/session/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role: 'admin', token: adm.token, email: adm.email }),
                            }).then(r => r.json()).then(res => {
                                if (res?.sessionToken && adm.sessionToken !== res.sessionToken) {
                                    adm.sessionToken = res.sessionToken;
                                    localStorage.setItem('admin_session', JSON.stringify(adm));
                                }
                            }).catch(() => {});
                        }
                    }
                } catch {}
            }

            const res = await apiRequest(`/api/admin/faculty-assignments?_t=${Date.now()}`);
            const newAssignments = res?.assignments || [];
            setAssignments(newAssignments);
            setFacultyList(res?.faculty || []);
            setClassesList(res?.classes || []);
            setSubjectsList(res?.subjects || []);

            if (isManual) {
                const diff = newAssignments.length - prevCount;
                if (diff > 0) {
                    setSuccessMsg(`✓ New faculty assignments detected: +${diff} mapping(s) synced dynamically!`);
                } else {
                    setSuccessMsg(`✓ Verified live: All ${newAssignments.length} faculty mappings are up to date.`);
                }
                setTimeout(() => setSuccessMsg(''), 4000);
            }
        } catch (err) {
            console.error('Failed to load faculty assignments:', err);
            if (!silent) setError(err.message || 'Failed to load faculty assignments.');
        } finally {
            if (!silent) setLoading(false);
            setIsRefreshing(false);
        }
    }, [assignments.length]);

    useEffect(() => {
        fetchData();

        // 1. In-tab custom event listener
        const handleUpdate = () => {
            fetchData(true);
        };
        window.addEventListener('faculty_assignments_updated', handleUpdate);

        // 2. Cross-tab storage synchronization
        const handleStorage = (e) => {
            if (e.key === 'faculty_assignments_last_sync') {
                fetchData(true);
            }
        };
        window.addEventListener('storage', handleStorage);

        // 3. Re-sync when switching back to this tab
        const handleFocus = () => {
            fetchData(true);
        };
        window.addEventListener('focus', handleFocus);

        // 4. Polling heartbeat every 15 seconds
        const timer = setInterval(() => {
            fetchData(true);
        }, 15000);

        return () => {
            window.removeEventListener('faculty_assignments_updated', handleUpdate);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('focus', handleFocus);
            clearInterval(timer);
        };
    }, [fetchData]);

    // Derived maps & lists
    const facultyMap = useMemo(() => new Map(facultyList.map(f => [f.id, f])), [facultyList]);
    const classMap = useMemo(() => new Map(classesList.map(c => [c.id, c])), [classesList]);
    const subjectMap = useMemo(() => new Map(subjectsList.map(s => [s.subject_code, s])), [subjectsList]);

    const uniqueBranches = useMemo(() => {
        const set = new Set(['CS', 'IS', 'AI', 'DS', 'EC', 'EE', 'ME', 'CV', 'RI']);
        subjectsList.forEach(s => { if (s.branch) set.add(s.branch.toUpperCase()); });
        classesList.forEach(c => { if (c.branch) set.add(c.branch.toUpperCase()); });
        return Array.from(set).sort();
    }, [subjectsList, classesList]);

    // Filtered subjects available for assignment based on selected branch/semester/scheme in form
    const availableSubjectsForForm = useMemo(() => {
        const pool = [...catalogSubjects];
        const seenCodes = new Set(pool.map(s => (s.subject_code || s.code || '').trim().toUpperCase()).filter(Boolean));

        for (const sub of subjectsList) {
            const code = (sub.subject_code || sub.code || '').trim().toUpperCase();
            if (!code || seenCodes.has(code)) continue;
            if (matchesBranch(sub.branch, form.branch) &&
                (!form.semester || String(sub.semester) === String(form.semester)) &&
                (!form.scheme || String(sub.scheme) === String(form.scheme))) {
                seenCodes.add(code);
                pool.push({
                    ...sub,
                    subject_code: code,
                    subject_name: sub.subject_name || code,
                    credits: sub.credits ?? 3
                });
            }
        }

        return pool.sort((a, b) => (a.subject_code || a.code || '').localeCompare(b.subject_code || b.code || ''));
    }, [catalogSubjects, subjectsList, form.branch, form.semester, form.scheme]);

    const filteredCatalogSubjects = useMemo(() => {
        if (!assignSubjectSearch.trim()) return availableSubjectsForForm;
        const q = assignSubjectSearch.trim().toLowerCase();
        return availableSubjectsForForm.filter(s => {
            const code = (s.subject_code || s.code || '').toLowerCase();
            const name = (s.subject_name || s.name || '').toLowerCase();
            return code.includes(q) || name.includes(q);
        });
    }, [availableSubjectsForForm, assignSubjectSearch]);

    // Details of currently chosen subject in form for visual badge/card preview
    const selectedSubjectDetails = useMemo(() => {
        if (!form.subject_code) return null;
        const code = form.subject_code.trim().toUpperCase();
        return subjectsList.find(s => s.subject_code?.toUpperCase() === code) || null;
    }, [subjectsList, form.subject_code]);

    // Details of currently chosen faculty in form for profile preview
    const selectedFacultyDetails = useMemo(() => {
        if (!form.faculty_id) return null;
        return facultyMap.get(form.faculty_id) || null;
    }, [facultyMap, form.faculty_id]);

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
    const selectableClasses = useMemo(() => {
        return classesList.filter(c => {
            if (form.scheme && c.scheme && String(c.scheme) !== String(form.scheme)) return false;
            const bMatch = classBranchFilter === 'all' || matchesBranch(c.branch, classBranchFilter);
            const sMatch = classSemesterFilter === 'all' || String(c.semester) === String(classSemesterFilter);
            return bMatch && sMatch;
        });
    }, [classesList, form.scheme, classBranchFilter, classSemesterFilter]);

    // Multi-class helpers
    const toggleAssignClass = (classId) => {
        setAssignClassIds(prev =>
            prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
        );
    };

    const handleSelectAllClasses = () => {
        setAssignClassIds(Array.from(new Set([...assignClassIds, ...selectableClasses.map(c => c.id)])));
    };

    const handleClearAllClasses = () => {
        setAssignClassIds([]);
    };

    // Multi-subject helpers
    const toggleAssignSubject = (code) => {
        const clean = (code || '').toUpperCase().trim();
        if (!clean) return;
        setAssignSubjectCodes(prev =>
            prev.includes(clean) ? prev.filter(c => c !== clean) : [...prev, clean]
        );
    };

    const handleSelectAllSubjects = () => {
        const codes = filteredCatalogSubjects.map(s => (s.subject_code || s.code || '').toUpperCase().trim()).filter(Boolean);
        setAssignSubjectCodes(Array.from(new Set([...assignSubjectCodes, ...codes])));
    };

    const handleClearAllSubjects = () => {
        setAssignSubjectCodes([]);
    };

    const handleAddCustomSubject = () => {
        const cleanCode = assignCustomCode.trim().toUpperCase();
        if (!cleanCode) return;
        if (!customSubjectsList.some(s => s.code === cleanCode)) {
            setCustomSubjectsList(prev => [...prev, { code: cleanCode, name: assignCustomName.trim() || cleanCode }]);
        }
        if (!assignSubjectCodes.includes(cleanCode)) {
            setAssignSubjectCodes(prev => [...prev, cleanCode]);
        }
        setAssignCustomCode('');
        setAssignCustomName('');
    };

    const handleRemoveCustomSubject = (codeToRemove) => {
        setCustomSubjectsList(prev => prev.filter(s => s.code !== codeToRemove));
        setAssignSubjectCodes(prev => prev.filter(c => c !== codeToRemove));
    };

    const activeSubjectCodes = useMemo(() => {
        if (manualSubjectMode) {
            return Array.from(new Set([
                ...customSubjectsList.map(s => s.code),
                ...assignSubjectCodes
            ]));
        }
        return assignSubjectCodes;
    }, [manualSubjectMode, customSubjectsList, assignSubjectCodes]);

    const totalAssignmentsCount = useMemo(() => {
        const subsCount = activeSubjectCodes.length;
        if (subsCount === 0) return 0;
        if (assignScope === 'shared') return subsCount;
        return subsCount * assignClassIds.length;
    }, [activeSubjectCodes.length, assignScope, assignClassIds.length]);

    // Filtered assignments displayed in table
    const displayedAssignments = useMemo(() => {
        let list = assignments.filter(a => {
            const matchesFaculty = filterFaculty === 'all' || a.faculty_id === filterFaculty;
            const matchesBranchFilter = filterBranch === 'all' || matchesBranch(a.branch, filterBranch);
            const matchesSem = filterSemester === 'all' || String(a.semester) === String(filterSemester);
            return matchesFaculty && matchesBranchFilter && matchesSem;
        });

        if (search.trim()) {
            list = filterAndRank(list, search, [
                a => {
                    const fac = facultyMap.get(a.faculty_id) || a.faculty_onboarding;
                    return fac?.full_name || '';
                },
                a => {
                    const fac = facultyMap.get(a.faculty_id) || a.faculty_onboarding;
                    return fac?.email || '';
                },
                'subject_code',
                a => {
                    const sub = subjectMap.get(a.subject_code);
                    return sub?.subject_name || '';
                },
                'branch',
                'semester',
                'section'
            ]);
        }

        return list;
    }, [assignments, facultyMap, subjectMap, search, filterFaculty, filterBranch, filterSemester]);

    // KPI Metrics
    const uniqueFacultyCount = useMemo(() => new Set(assignments.map(a => a.faculty_id)).size, [assignments]);
    const uniqueSubjectsCount = useMemo(() => new Set(assignments.map(a => a.subject_code)).size, [assignments]);
    const uniqueBranchesCount = useMemo(() => new Set(assignments.map(a => a.branch).filter(Boolean)).size, [assignments]);

    // Handle Create
    const handleCreateAssignment = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!form.faculty_id) {
            setFormError('Please select a faculty member.');
            return;
        }
        if (activeSubjectCodes.length === 0) {
            setFormError('Please select or enter at least one subject.');
            return;
        }
        if (assignScope === 'class' && assignClassIds.length === 0) {
            setFormError('Please select at least one class section or switch to "All Sections (Shared)".');
            return;
        }

        setSubmitting(true);
        try {
            const targetClassIds = assignScope === 'shared' ? [null] : assignClassIds;
            const res = await apiRequest('/api/admin/faculty-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: form.faculty_id,
                    subject_codes: activeSubjectCodes,
                    class_ids: targetClassIds,
                    branch: form.branch || null,
                    semester: form.semester ? parseInt(form.semester, 10) : null,
                    scheme: form.scheme || null,
                }),
            });

            const created = res?.totalCreated ?? (Array.isArray(res?.assignments) ? res.assignments.length : activeSubjectCodes.length);
            const skipped = res?.totalSkipped ?? 0;
            let msg = `Successfully assigned ${created} subject-class mapping(s) to faculty!`;
            if (skipped > 0) {
                msg += ` (${skipped} already existed and were preserved)`;
            }
            setSuccessMsg(msg);
            setTimeout(() => setSuccessMsg(''), 5000);
            setShowAssignModal(false);
            setAssignSubjectCodes([]);
            setAssignClassIds([]);
            setCustomSubjectsList([]);
            setAssignCustomCode('');
            setAssignCustomName('');
            setForm(prev => ({
                ...prev,
                subject_code: '',
                class_id: '',
            }));
            fetchData();
        } catch (err) {
            console.error('Assignment creation failed:', err);
            setFormError(err.message || 'Failed to assign subject. Check for duplicates.');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Delete
    const handleDeleteAssignment = async () => {
        if (!confirmingDelete) return;
        setDeleting(true);
        try {
            await apiRequest(`/api/admin/faculty-assignments/${confirmingDelete.id}`, {
                method: 'DELETE',
            });
            setSuccessMsg('Faculty subject assignment removed.');
            setTimeout(() => setSuccessMsg(''), 4000);
            setConfirmingDelete(null);
            fetchData();
        } catch (err) {
            console.error('Failed to remove assignment:', err);
            setError(err.message || 'Failed to remove assignment.');
        } finally {
            setDeleting(false);
        }
    };

    const s = {
        container: {
            width: '100%',
            maxWidth: '1240px',
            margin: '0 auto',
            padding: embedded ? '0' : 'var(--space-6)',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
        },
        pageTitle: {
            fontSize: '22px',
            fontWeight: 900,
            color: 'var(--tx-main)',
            letterSpacing: '-0.03em',
            margin: 0,
        },
        pageSubtitle: {
            fontSize: '12px',
            color: 'var(--tx-muted)',
            marginTop: '4px',
            margin: 0,
        },
        kpiGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
        },
        kpiCard: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: 'var(--shadow-sm)',
        },
        filterBar: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
        },
        input: {
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-main)',
            outline: 'none',
            fontFamily: 'inherit',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        },
        select: {
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 36px 10px 14px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-main)',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            boxSizing: 'border-box',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23586C6D' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '15px 15px',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        },
        btnPrimary: {
            background: 'var(--primary)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(23, 75, 77, 0.22)',
            transition: 'all 0.15s ease',
        },
        btnSecondary: {
            background: '#FFFFFF',
            color: 'var(--tx-main)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.15s ease',
        },
        tableWrap: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
        },
        th: {
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: 800,
            color: 'var(--tx-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: '1px solid var(--border)',
        },
        td: {
            padding: '14px 16px',
            fontSize: '13px',
            color: 'var(--tx-main)',
            borderBottom: '1px solid var(--border)',
        },
        avatar: {
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--surface-low)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '13px',
            color: 'var(--primary)',
        },
        modalOverlay: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 24, 28, 0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
        },
        modalCard: {
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            padding: '28px 32px',
            boxShadow: '0 24px 60px rgba(10, 24, 28, 0.2), 0 4px 16px rgba(10, 24, 28, 0.08)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative',
        },
    };

    return (
        <div style={s.container} className="gf-fade-up">
            {/* Header */}
            <div style={s.header}>
                <div>
                    <h1 style={s.pageTitle}>Faculty Subject Assignments</h1>
                    <p style={s.pageSubtitle}>
                        Map teaching faculty members to academic subjects, departments, semesters, and class sections.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        style={s.btnSecondary}
                        onClick={() => fetchData(true, true)}
                        disabled={loading || isRefreshing}
                        title="Refresh faculty assignments"
                    >
                        <span
                            className="material-icons-round"
                            style={{
                                fontSize: '16px',
                                color: 'var(--primary)',
                                animation: (loading || isRefreshing) ? 'spin 1s linear infinite' : 'none'
                            }}
                        >
                            refresh
                        </span>
                        {(loading || isRefreshing) ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        style={s.btnPrimary}
                        onClick={() => {
                            setShowAssignModal(true);
                            setFormError('');
                            setAssignSubjectCodes([]);
                            setAssignClassIds([]);
                            setCustomSubjectsList([]);
                            setAssignCustomCode('');
                            setAssignCustomName('');
                            setAssignScope('class');
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>add_task</span>
                        Assign Subject to Faculty
                    </button>
                </div>
            </div>

            {/* Notification Messages */}
            {successMsg && (
                <div style={{ padding: '12px 16px', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: '10px', color: 'var(--green)', fontSize: '13px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                    <span>{successMsg}</span>
                </div>
            )}
            {error && (
                <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', color: 'var(--red)', fontSize: '13px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>error_outline</span>
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Cards */}
            <div style={s.kpiGrid}>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Total Assignments</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>assignment</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '6px' }}>
                        {assignments.length}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Faculty Assigned</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--green)' }}>supervisor_account</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--green)', marginTop: '6px' }}>
                        {uniqueFacultyCount} / {facultyList.length}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Subjects Covered</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>library_books</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)', marginTop: '6px' }}>
                        {uniqueSubjectsCount}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Branches</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--accent)' }}>domain</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '6px' }}>
                        {uniqueBranchesCount}
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={s.filterBar}>
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                    <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: 'var(--tx-dim)' }}>
                        search
                    </span>
                    <input
                        style={{ ...s.input, width: '100%', paddingLeft: '32px', paddingRight: search ? '30px' : '14px', boxSizing: 'border-box' }}
                        type="text"
                        placeholder="Search faculty, email, or subject code..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tx-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                            title="Clear search"
                        >
                            <span className="material-icons-round" style={{ fontSize: '15px' }}>close</span>
                        </button>
                    )}
                </div>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterFaculty}
                    onChange={e => setFilterFaculty(e.target.value)}
                >
                    <option value="all">All Faculty Members</option>
                    {facultyList.map(f => (
                        <option key={f.id} value={f.id}>
                            {f.full_name} ({f.department || 'General'})
                        </option>
                    ))}
                </select>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                >
                    <option value="all">All Branches</option>
                    {uniqueBranches.map(b => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterSemester}
                    onChange={e => setFilterSemester(e.target.value)}
                >
                    <option value="all">All Semesters</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                        <option key={sem} value={String(sem)}>Semester {sem}</option>
                    ))}
                </select>

                {(search || filterFaculty !== 'all' || filterBranch !== 'all' || filterSemester !== 'all') && (
                    <button
                        style={{ ...s.btnSecondary, padding: '8px 12px', fontSize: '11px' }}
                        onClick={() => {
                            setSearch('');
                            setFilterFaculty('all');
                            setFilterBranch('all');
                            setFilterSemester('all');
                        }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Assignments Table */}
            <div style={s.tableWrap}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                        <thead>
                            <tr>
                                <th style={s.th}>Faculty Member</th>
                                <th style={s.th}>Subject</th>
                                <th style={s.th}>Branch / Sem</th>
                                <th style={s.th}>Class Scope</th>
                                <th style={s.th}>Assigned On</th>
                                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '40px', color: 'var(--tx-muted)' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                            <span className="material-icons-round" style={{ animation: 'spin 1s infinite linear', fontSize: '18px' }}>sync</span>
                                            Loading faculty assignments...
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedAssignments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '48px', color: 'var(--tx-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)' }}>assignment_late</span>
                                            <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>No Subject Assignments Found</span>
                                            <span style={{ fontSize: '12px' }}>Click "Assign Subject to Faculty" above to assign courses.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayedAssignments.map(a => {
                                    const fac = facultyMap.get(a.faculty_id) || a.faculty_onboarding;
                                    const sub = subjectMap.get(a.subject_code);
                                    const cls = classMap.get(a.class_id) || a.classes;
                                    const facName = fac?.full_name || 'Faculty Member';
                                    const facEmail = fac?.email || '—';
                                    const subName = sub?.subject_name || '';

                                    return (
                                        <tr key={a.id} style={{ transition: 'background 0.1s ease' }}>
                                            <td style={s.td}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={s.avatar}>{facName[0]?.toUpperCase() || 'F'}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{facName}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{facEmail}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={s.td}>
                                                <div style={{ display: 'inline-block', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 6px', fontWeight: 800, fontSize: '12px', color: 'var(--primary)', letterSpacing: '0.04em' }}>
                                                    {a.subject_code}
                                                </div>
                                                {subName && (
                                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '3px' }}>
                                                        {subName}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={s.td}>
                                                <span style={{ fontWeight: 700 }}>{a.branch || 'All Branches'}</span>
                                                <span style={{ color: 'var(--tx-dim)' }}> · </span>
                                                <span>Sem {a.semester || 'All'}</span>
                                                {a.scheme && <span style={{ fontSize: '11px', color: 'var(--tx-dim)' }}> ({a.scheme})</span>}
                                            </td>
                                            <td style={s.td}>
                                                {cls ? (
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{cls.name}</div>
                                                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px', alignItems: 'center' }}>
                                                            {cls.section && (
                                                                <span style={{ fontSize: '10px', fontWeight: 800, color: '#1D4ED8', background: 'rgba(59, 130, 246, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                                                                    Sec {cls.section}
                                                                </span>
                                                            )}
                                                            {cls.batch && (
                                                                <span style={{ fontSize: '10px', fontWeight: 800, color: '#059669', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                                                                    {cls.batch} Batch
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontStyle: 'italic' }}>All Sections</span>
                                                )}
                                            </td>
                                            <td style={{ ...s.td, fontSize: '12px', color: 'var(--tx-dim)' }}>
                                                {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                <button
                                                    onClick={() => setConfirmingDelete(a)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--red)',
                                                        cursor: 'pointer',
                                                        padding: '6px 8px',
                                                        borderRadius: '6px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                    }}
                                                    title="Unassign this subject"
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_outline</span>
                                                    Unassign
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Assignment Modal rendered via Portal for full viewport coverage */}
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
                        overflowY: 'auto',
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowAssignModal(false);
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="assign-modal-title"
                >
                    <div
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '20px',
                            width: 'min(100%, 680px)',
                            maxHeight: 'min(92vh, 840px)',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                            overflow: 'hidden',
                            margin: 'auto',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Sticky Modal Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '20px 24px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '12px',
                                    background: 'rgba(23, 75, 77, 0.08)',
                                    color: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '22px' }}>assignment_ind</span>
                                </div>
                                <div>
                                    <h2 id="assign-modal-title" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.02em' }}>
                                        Assign Subject to Faculty
                                    </h2>
                                    <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: '3px 0 0' }}>
                                        Map teaching attribution, curriculum scope, and division.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--tx-muted)',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--surface-low)';
                                    e.currentTarget.style.color = 'var(--tx-main)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--tx-muted)';
                                }}
                                title="Close"
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>

                        {/* Scrollable Modal Body */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                            {formError && (
                                <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', color: 'var(--red)', fontSize: '12px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>error_outline</span>
                                    <span>{formError}</span>
                                </div>
                            )}

                            <form id="faculty-assignment-form" onSubmit={handleCreateAssignment}>
                                {/* Faculty Selection */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                        Faculty Member <span style={{ color: 'var(--red)' }}>*</span>
                                    </label>
                                    <select
                                        style={{ ...s.select, width: '100%' }}
                                        value={form.faculty_id}
                                        onChange={e => setForm(f => ({ ...f, faculty_id: e.target.value }))}
                                        required
                                    >
                                        <option value="">Select Faculty...</option>
                                        {facultyList.map(f => (
                                            <option key={f.id} value={f.id}>
                                                {f.full_name} ({f.email}) · {f.department || 'General Department'} {f.designation ? `(${f.designation})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedFacultyDetails && (
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>verified</span>
                                            <span>{selectedFacultyDetails.designation || 'Faculty Member'} · {selectedFacultyDetails.department || 'General Department'}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Branch & Semester */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                            Branch <span style={{ color: 'var(--red)' }}>*</span>
                                        </label>
                                        <select
                                            style={{ ...s.select, width: '100%' }}
                                            value={form.branch}
                                            onChange={e => {
                                                const newBranch = e.target.value;
                                                setForm(f => ({ ...f, branch: newBranch, subject_code: '' }));
                                                setAssignSubjectCodes([]);
                                                setAssignClassIds([]);
                                            }}
                                            required
                                        >
                                            <option value="CS">Computer Science (CS)</option>
                                            <option value="IS">Information Science (IS)</option>
                                            <option value="AI">AI & ML (AI)</option>
                                            <option value="DS">Data Science (DS)</option>
                                            <option value="EC">Electronics & Comm (EC)</option>
                                            <option value="EE">Electrical & Electronics (EE)</option>
                                            <option value="ME">Mechanical (ME)</option>
                                            <option value="CV">Civil (CV)</option>
                                            <option value="RI">Robotics & AI (RI)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                            Semester <span style={{ color: 'var(--red)' }}>*</span>
                                        </label>
                                        <select
                                            style={{ ...s.select, width: '100%' }}
                                            value={form.semester}
                                            onChange={e => {
                                                const newSem = e.target.value;
                                                setForm(f => ({ ...f, semester: newSem, subject_code: '' }));
                                                setAssignSubjectCodes([]);
                                                setAssignClassIds([]);
                                            }}
                                            required
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                                <option key={n} value={String(n)}>Semester {n}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Curriculum Scheme */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                        Curriculum Scheme
                                    </label>
                                    <select
                                        style={{ ...s.select, width: '100%' }}
                                        value={form.scheme}
                                        onChange={e => {
                                            const newScheme = e.target.value;
                                            setForm(f => ({ ...f, scheme: newScheme, subject_code: '' }));
                                            setAssignSubjectCodes([]);
                                        }}
                                    >
                                        <option value="2022">2022 Scheme</option>
                                        <option value="2025">2025 Scheme</option>
                                        <option value="2021">2021 Scheme</option>
                                        <option value="2018">2018 Scheme</option>
                                    </select>
                                </div>

                                {/* Class Section Selection: Cross-Branch & Multi-Class Selector */}
                                <div style={{ marginBottom: '18px', padding: '14px', borderRadius: '12px', background: 'var(--surface-low)', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Which Class / Section Does Faculty Teach? <span style={{ color: 'var(--red)' }}>*</span>
                                        </label>
                                        <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                            {selectableClasses.length} Section{selectableClasses.length === 1 ? '' : 's'} Available
                                        </span>
                                    </div>

                                    {/* Scope Radios */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setAssignScope('class')}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                border: assignScope === 'class' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                background: assignScope === 'class' ? 'rgba(23, 75, 77, 0.08)' : 'var(--surface)',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '8px'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)' }}>Specific Section(s) Only</div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>Select multiple classes across branches/semesters</div>
                                            </div>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'class' ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                {assignScope === 'class' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setAssignScope('shared')}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                border: assignScope === 'shared' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                background: assignScope === 'shared' ? 'rgba(23, 75, 77, 0.08)' : 'var(--surface)',
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
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>Teaches combined cohort across all classes</div>
                                            </div>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: assignScope === 'shared' ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                {assignScope === 'shared' ? 'radio_button_checked' : 'radio_button_unchecked'}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Multi-Class Division Checklist if specific section */}
                                    {assignScope === 'class' && (
                                        <div>
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
                                                                background: classBranchFilter === 'all' ? 'var(--primary)' : 'var(--surface-low)',
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
                                                                    background: classBranchFilter === b ? 'var(--primary)' : 'var(--surface-low)',
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
                                                                background: classSemesterFilter === 'all' ? 'var(--primary)' : 'var(--surface-low)',
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
                                                                    background: classSemesterFilter === String(sem) ? 'var(--primary)' : 'var(--surface-low)',
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
                                                {selectableClasses.length > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                            {assignClassIds.length} of {classesList.length} total selected
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={handleSelectAllClasses}
                                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: 0 }}
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

                                            {selectableClasses.length === 0 ? (
                                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontStyle: 'italic', padding: '12px', textAlign: 'center', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                    No classes match the filter. Click &quot;All Branches&quot; or &quot;All Semesters&quot; above to choose classes.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
                                                    {selectableClasses.map(c => {
                                                        const isSelected = assignClassIds.includes(c.id);
                                                        return (
                                                            <div
                                                                key={c.id}
                                                                onClick={() => toggleAssignClass(c.id)}
                                                                style={{
                                                                    padding: '10px 12px',
                                                                    borderRadius: '8px',
                                                                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                                    background: isSelected ? 'rgba(23, 75, 77, 0.08)' : 'var(--surface)',
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
                                                                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
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
                                                                <span className="material-icons-round" style={{ fontSize: '20px', color: isSelected ? 'var(--primary)' : 'var(--tx-dim)' }}>
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
                                                background: 'rgba(23, 75, 77, 0.06)',
                                                border: '1px solid rgba(23, 75, 77, 0.15)',
                                                fontSize: '11.5px',
                                                color: 'var(--tx-main)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>verified</span>
                                                <span>
                                                    Evaluation strictly isolated to students enrolled in the {assignClassIds.length} selected section{assignClassIds.length === 1 ? '' : 's'}. Faculty can teach across multiple branches (CS, DS, AI).
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Multi-Subject Selector */}
                                <div style={{ marginBottom: '18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Subject(s) <span style={{ color: 'var(--red)' }}>*</span>
                                            </label>
                                            <span style={{ fontSize: '11px', fontWeight: 800, background: activeSubjectCodes.length > 0 ? 'var(--primary)' : 'var(--surface-low)', color: activeSubjectCodes.length > 0 ? '#fff' : 'var(--tx-muted)', padding: '2px 8px', borderRadius: '10px' }}>
                                                {activeSubjectCodes.length} selected
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {!manualSubjectMode && (
                                                <span style={{ fontSize: '11.5px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                                    {loadingCatalogSubjects ? 'Loading syllabus...' : `${availableSubjectsForForm.length} courses in catalog`}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setManualSubjectMode(!manualSubjectMode)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--primary)',
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
                                                <input
                                                    style={s.input}
                                                    placeholder="Code (e.g. BCS601)"
                                                    value={assignCustomCode}
                                                    onChange={e => setAssignCustomCode(e.target.value.toUpperCase())}
                                                />
                                                <input
                                                    style={s.input}
                                                    placeholder="Subject Name (e.g. Cloud Computing)"
                                                    value={assignCustomName}
                                                    onChange={e => setAssignCustomName(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    style={s.btnSecondary}
                                                    onClick={handleAddCustomSubject}
                                                    disabled={!assignCustomCode.trim()}
                                                >
                                                    + Add
                                                </button>
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
                                                        placeholder="Search syllabus subjects (e.g. BCS601, Cloud)..."
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
                                                            outline: 'none',
                                                            boxSizing: 'border-box'
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
                                                        const subObj = availableSubjectsForForm.find(s => (s.subject_code || s.code) === code);
                                                        return (
                                                            <span
                                                                key={code}
                                                                style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 700,
                                                                    padding: '2px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(23, 75, 77, 0.1)',
                                                                    border: '1px solid rgba(23, 75, 77, 0.25)',
                                                                    color: 'var(--primary)',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <span><strong>{code}</strong> {subObj?.subject_name ? `· ${subObj.subject_name.slice(0, 18)}...` : ''}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleAssignSubject(code)}
                                                                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, display: 'flex' }}
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
                                                {loadingCatalogSubjects ? (
                                                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                        Loading syllabus courses...
                                                    </div>
                                                ) : filteredCatalogSubjects.length === 0 ? (
                                                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                        {availableSubjectsForForm.length === 0
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
                                                                    background: isSelected ? 'rgba(23, 75, 77, 0.06)' : 'transparent',
                                                                    cursor: 'pointer',
                                                                    transition: 'background 0.15s ease'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                                    <span className="material-icons-round" style={{ fontSize: '18px', color: isSelected ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                                        {isSelected ? 'check_box' : 'check_box_outline_blank'}
                                                                    </span>
                                                                    <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: isSelected ? 'var(--primary)' : 'var(--surface-low)', color: isSelected ? '#fff' : 'var(--tx-main)', letterSpacing: '0.03em' }}>
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

                                {/* Real-time Assignment Calculation Summary Card */}
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    background: totalAssignmentsCount > 0 ? 'rgba(23, 75, 77, 0.08)' : 'var(--surface-low)',
                                    border: totalAssignmentsCount > 0 ? '1.5px solid rgba(23, 75, 77, 0.3)' : '1px dashed var(--border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease',
                                    marginBottom: '4px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: totalAssignmentsCount > 0 ? 'var(--primary)' : 'var(--surface)',
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
                                            background: 'var(--primary)',
                                            color: '#fff',
                                            padding: '4px 12px',
                                            borderRadius: '12px'
                                        }}>
                                            {totalAssignmentsCount}
                                        </span>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Sticky Modal Footer */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            padding: '14px 24px',
                            borderTop: '1px solid var(--border)',
                            background: 'var(--surface)',
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 10,
                        }}>
                            <button
                                type="button"
                                style={s.btnSecondary}
                                onClick={() => setShowAssignModal(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="faculty-assignment-form"
                                style={{
                                    ...s.btnPrimary,
                                    opacity: totalAssignmentsCount === 0 ? 0.6 : 1,
                                    cursor: totalAssignmentsCount === 0 ? 'not-allowed' : 'pointer'
                                }}
                                disabled={submitting || totalAssignmentsCount === 0}
                            >
                                {submitting ? (
                                    <>
                                        <span className="material-icons-round" style={{ animation: 'spin 1s infinite linear', fontSize: '16px' }}>sync</span>
                                        Assigning...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>check</span>
                                        Confirm {totalAssignmentsCount > 1 ? `${totalAssignmentsCount} Assignments` : 'Assignment'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Unassign Confirmation */}
            <ConfirmDialog
                open={Boolean(confirmingDelete)}
                title="Remove Faculty Subject Assignment?"
                description={`This will unassign ${confirmingDelete?.subject_code} from ${facultyMap.get(confirmingDelete?.faculty_id)?.full_name || 'this faculty member'}.`}
                busy={deleting}
                onCancel={() => setConfirmingDelete(null)}
                onConfirm={handleDeleteAssignment}
            />
        </div>
    );
}
export default FacultyAssignmentsContent;
