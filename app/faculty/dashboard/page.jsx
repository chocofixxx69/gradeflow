'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { apiRequest, clearApiCache } from '../../../lib/api/client';
import { useLive, LIVE } from '../../../lib/api/live';
import { recordFacultyAction } from '../../../lib/api/faculty-action';
import AuthGuard from '../../../components/AuthGuard';
import AcademicProgressionNavigator from '../../../components/AcademicProgressionNavigator';
import { getGradeBadgeTone, unifyGrade, isFailedSubject } from '../../../lib/vtuGrades';
import { validateUsn, sanitizeUsn } from '../../../lib/vtu-usn-validator';
import { cleanAlphanumeric } from '../../../lib/search-utils';
import { Badge, Button, ConfirmDialog, Divider, EmptyState, EntryTag, IconButton, Inline, LoadingState, ResponsiveGrid, SearchInput, SearchableSelect, Select } from '../../../components/ui';
import { fmtGpa, fmtNum, resultFileName } from '../../../lib/format';
import { createFacultyAssignment, deleteFacultyAssignment } from '../../../lib/api/admin-management';
import styles from './FacultyDashboard.module.css';

// Same canonical branch list used across the app (see app/api/faculty/analytics/meta/route.js).
const BRANCH_OPTIONS = [
    { value: 'CS', label: 'Computer Science & Engineering (CS)' },
    { value: 'AI', label: 'AI & Machine Learning (AI)' },
    { value: 'DS', label: 'CSE (Data Science) (DS)' },
    { value: 'EC', label: 'Electronics & Communication (EC)' },
    { value: 'EE', label: 'Electrical & Electronics (EE)' },
    { value: 'ME', label: 'Mechanical Engineering (ME)' },
    { value: 'CV', label: 'Civil Engineering (CV)' },
    { value: 'RI', label: 'Robotics & AI (RI)' },
];
const SEMESTER_OPTIONS = [
    { value: '', label: 'All Semesters (Browse All)' },
    ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` })),
];
const SCHEME_OPTIONS = [
    { value: '2022', label: '2022 Scheme' },
    { value: '2025', label: '2025 Scheme' },
];

function FacultyDashboardView({
    backlogs = [],
    backlogDialogRef,
    backlogTriggerRef,
    cgpa = 0,
    closeBacklogModal,
    deleteStudent,
    entry = null,
    lookupIssue = null,
    failCount = 0,
    fetchFromVTU,
    handlePDF,
    loading = false,
    lookupStudent,
    marks = {},
    message = '',
    pdfLoading = false,
    scraping = false,
    scrapeProgress = '',
    semStats = {},
    setMessage,
    setShowBacklogModal,
    setUsn,
    sgpas = {},
    showBacklogModal = false,
    sortedSemesters = [],
    stopScraping,
    student,
    totalSubjects = 0,
    usn = '',
    assignedSubjects = [],
    assignedLoading = false,
    assignedClasses = [],
    availablePortals = [],
    selectedPortalUrl = 'ALL',
    setSelectedPortalUrl,
    selectedPortalUrls = [],
    setSelectedPortalUrls,
    batchResults = null,
    setBatchResults,
    inspectedStudent = null,
    setInspectedStudent,
    customPortalUrl = '',
    setCustomPortalUrl,
    addSubjectOpen = false,
    setAddSubjectOpen,
    addSubjectForm,
    setAddSubjectForm,
    subjectOptions = [],
    subjectOptionsLoading = false,
    addSubjectSaving = false,
    addSubjectError = '',
    handleAddSubject,
    handleRemoveAssignment,
    removingAssignmentId = null,
    setAssignmentToConfirmRemove,
    loadAssignments = null,
    assignmentSyncMsg = '',
    facultyId = null,
    refreshPortals = null,
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Multi-Portal Selector State
    const [portalDropdownOpen, setPortalDropdownOpen] = useState(false);
    const [portalSchemeFilter, setPortalSchemeFilter] = useState('ALL'); // 'ALL' | '2022' | '2025' | 'mba' | 'mca'
    const [portalSearchFilter, setPortalSearchFilter] = useState('');
    const [portalQuickCategory, setPortalQuickCategory] = useState('ALL'); // 'ALL' | 'REGULAR' | 'MAKEUP' | 'REVAL'
    const portalDropdownRef = useRef(null);

    // Quick Add Portal Inline State
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddUrl, setQuickAddUrl] = useState('');
    const [quickAddExamName, setQuickAddExamName] = useState('');
    const [quickAddExamType, setQuickAddExamType] = useState('REGULAR'); // 'REGULAR' | 'MAKEUP' | 'REVAL'
    const [quickAddUserOverrode, setQuickAddUserOverrode] = useState(false);
    const [quickAddScheme, setQuickAddScheme] = useState('2022');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [quickAddSuccess, setQuickAddSuccess] = useState('');

    useEffect(() => {
        if (!portalDropdownOpen) return;
        const handleClickOutside = (e) => {
            if (portalDropdownRef.current && !portalDropdownRef.current.contains(e.target)) {
                setPortalDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [portalDropdownOpen]);

    // Auto-detect quick-add exam type from both URL and name
    useEffect(() => {
        const urlStr = (quickAddUrl || '').trim();
        const nameStr = (quickAddExamName || '').trim();
        if (!urlStr && !nameStr) {
            setQuickAddUserOverrode(false);
            return;
        }

        const combined = `${urlStr} ${nameStr}`.toLowerCase();
        let detected = 'REGULAR';
        if (
            combined.includes('reval') || combined.includes('revaluation') ||
            combined.includes(' rv') || combined.includes('/rv') || combined.includes('rv_') ||
            /rvce?cbcs|rvcbcs|rv[0-9]|rvspl|servcbcs/.test(combined)
        ) {
            detected = 'REVAL';
        } else if (
            combined.includes('makeup') || combined.includes('make up') || combined.includes('make-up') ||
            combined.includes('summer') || combined.includes('special') || combined.includes('spl') ||
            /secbcs|spljul/.test(combined)
        ) {
            detected = 'MAKEUP';
        }

        if (!quickAddUserOverrode) {
            setQuickAddExamType(detected);
        }

        // Auto-suggest clean exam title if user hasn't typed one yet
        if (!nameStr && urlStr.includes('vtu.ac.in')) {
            const urlPath = urlStr.split('/').pop() || '';
            const cleanPath = urlPath.replace(/index\.php|\.php/i, '');
            if (/d25j26rvcbcs/i.test(cleanPath)) setQuickAddExamName('Dec 25/Jan 26 Revaluation');
            else if (/mj26rvcbcs/i.test(cleanPath)) setQuickAddExamName('May/June 2026 Revaluation');
            else if (/mj26cbcs/i.test(cleanPath)) setQuickAddExamName('May/June 2026 Regular');
            else if (/d25j26ecbcs/i.test(cleanPath)) setQuickAddExamName('Dec 25/Jan 26 Regular');
            else if (/jjrvcbcs25/i.test(cleanPath)) setQuickAddExamName('Jun/Jul 25 Reval');
            else if (/jjecbcs25/i.test(cleanPath)) setQuickAddExamName('Jun/Jul 25 Regular');
            else if (/makeupecbcs25/i.test(cleanPath)) setQuickAddExamName('Jun/Jul 25 MakeUp');
            else if (/servcbcs25/i.test(cleanPath)) setQuickAddExamName('Jun/Jul 25 Summer Reval');
            else if (/secbcs25/i.test(cleanPath)) setQuickAddExamName('Jun/Jul 25 Summer');
            else if (/djrvcbcs25/i.test(cleanPath)) setQuickAddExamName('Dec 24/Jan 25 Reval');
            else if (/djcbcs25/i.test(cleanPath)) setQuickAddExamName('Dec 24/Jan 25 Regular');
        }
    }, [quickAddUrl, quickAddExamName, quickAddUserOverrode]);

    const normalizePortalScheme = useCallback((scheme) => {
        const s = String(scheme || '').trim().toLowerCase();
        if (s === 'mba') return 'mba';
        if (s === 'mca' || s === 'pg') return 'mca';
        if (s === '2025' || s === '2026') return '2025';
        return '2022';
    }, []);

    // Returns 'REVAL' | 'MAKEUP' | 'REGULAR' for a portal entry
    const getPortalCategory = useCallback((p) => {
        const combined = `${p?.exam_name || ''} ${p?.url || ''}`.toLowerCase();
        if (combined.includes('reval') || combined.includes(' rv') || combined.includes('/rv') || /rvce?cbcs|rvcbcs|rv[0-9]|rvspl|servcbcs/.test(combined)) return 'REVAL';
        if (combined.includes('makeup') || combined.includes('make up') || combined.includes('make-up') || combined.includes('summer') || combined.includes('special') || combined.includes('spl') || /secbcs|spljul/.test(combined)) return 'MAKEUP';
        return 'REGULAR';
    }, []);
    // Legacy alias for existing usages
    const isRevalPortal = useCallback((p) => getPortalCategory(p) === 'REVAL', [getPortalCategory]);

    const schemeCounts = useMemo(() => {
        const counts = { ALL: (availablePortals || []).length, '2022': 0, '2025': 0, 'mba': 0, 'mca': 0 };
        (availablePortals || []).forEach(p => {
            const sc = normalizePortalScheme(p.scheme);
            if (counts[sc] !== undefined) counts[sc]++;
        });
        return counts;
    }, [availablePortals, normalizePortalScheme]);

    const filteredPortals = useMemo(() => {
        return (availablePortals || []).filter(p => {
            // Scheme filter
            if (portalSchemeFilter !== 'ALL') {
                const sc = normalizePortalScheme(p.scheme);
                if (sc !== portalSchemeFilter) return false;
            }
            // Type filter (Regular / MakeUp / Reval)
            if (portalQuickCategory !== 'ALL' && getPortalCategory(p) !== portalQuickCategory) return false;
            // Search filter
            if (portalSearchFilter.trim()) {
                const q = portalSearchFilter.toLowerCase();
                const matchName = (p.exam_name || '').toLowerCase().includes(q);
                const matchUrl = (p.url || '').toLowerCase().includes(q);
                if (!matchName && !matchUrl) return false;
            }
            return true;
        });
    }, [availablePortals, portalSchemeFilter, portalQuickCategory, portalSearchFilter, normalizePortalScheme, getPortalCategory]);

    const areAllFilteredSelected = useMemo(() => {
        if (filteredPortals.length === 0) return false;
        const selectedSet = new Set(selectedPortalUrls || []);
        return filteredPortals.every(p => selectedSet.has(p.url));
    }, [filteredPortals, selectedPortalUrls]);

    const togglePortal = (url) => {
        setSelectedPortalUrls?.(prev => {
            const list = Array.isArray(prev) ? prev : [];
            return list.includes(url) ? list.filter(u => u !== url) : [...list, url];
        });
    };

    const toggleAllFilteredPortals = () => {
        if (areAllFilteredSelected) {
            // Deselect all filtered
            const urlsToRemove = new Set(filteredPortals.map(p => p.url));
            setSelectedPortalUrls?.(prev => (Array.isArray(prev) ? prev : []).filter(u => !urlsToRemove.has(u)));
        } else {
            // Select all filtered
            const urlsToAdd = filteredPortals.map(p => p.url).filter(Boolean);
            setSelectedPortalUrls?.(prev => Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...urlsToAdd])));
        }
    };

    const clearAllPortals = () => {
        setSelectedPortalUrls?.([]);
    };

    const handleQuickAddPortal = async (e) => {
        e.preventDefault();
        const cleanUrl = quickAddUrl.trim();
        if (!cleanUrl.includes('results.vtu.ac.in')) {
            setQuickAddError('URL must be an official results.vtu.ac.in link.');
            return;
        }

        // Build final exam name with type suffix if not already present
        const rawName = (quickAddExamName || cleanUrl).trim();
        const lower = rawName.toLowerCase();
        const typeKeywords = {
            REVAL:   ['reval', 'revaluation', ' rv'],
            MAKEUP:  ['makeup', 'make up', 'make-up', 'summer', 'special', 'spl'],
            REGULAR: [],
        };
        const alreadyLabelled = (typeKeywords[quickAddExamType] || []).some(kw => lower.includes(kw));
        const typeSuffixes = { REVAL: ' Revaluation', MAKEUP: ' MakeUp', REGULAR: '' };
        const finalExamName = alreadyLabelled ? rawName : `${rawName}${typeSuffixes[quickAddExamType] || ''}`;

        setQuickAddLoading(true);
        setQuickAddError('');
        setQuickAddSuccess('');
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: cleanUrl,
                    exam_name: finalExamName,
                    faculty_id: facultyId,
                    scheme: quickAddScheme,
                    is_active: true
                })
            });
            const json = await res.json();
            if (json.success) {
                setQuickAddSuccess(`✓ Portal added & targeted!`);
                setQuickAddUrl('');
                setQuickAddExamName('');
                setQuickAddExamType('REGULAR');
                setQuickAddUserOverrode(false);
                // Auto select new URL
                setSelectedPortalUrls?.(prev => Array.from(new Set([...(Array.isArray(prev) ? prev : []), cleanUrl])));
                refreshPortals?.();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('vtu_urls_updated'));
                    try { localStorage.setItem('vtu_urls_last_sync', String(Date.now())); } catch (_) {}
                }
                setTimeout(() => {
                    setQuickAddSuccess('');
                    setQuickAddOpen(false);
                }, 1600);
            } else {
                setQuickAddError(json.error || 'Failed to add URL.');
            }
        } catch (err) {
            setQuickAddError('Network error while adding URL.');
        } finally {
            setQuickAddLoading(false);
        }
    };

    // Multi-USN Detection
    const parsedUsns = useMemo(() => {
        if (!usn) return [];
        const rawTokens = usn.split(/[\s,;\n\r]+/).map(t => t.trim()).filter(Boolean);
        return Array.from(new Set(rawTokens.map(t => cleanAlphanumeric(t).toUpperCase()).filter(Boolean)));
    }, [usn]);
    const isMultiUsn = parsedUsns.length > 1;

    const usnValidation = useMemo(() => {
        if (isMultiUsn) return { isValid: true };
        return validateUsn(usn?.trim() || '');
    }, [usn, isMultiUsn]);

    const multiUsnStats = useMemo(() => {
        if (!isMultiUsn) return null;
        const valid = [];
        const invalid = [];
        parsedUsns.forEach(u => {
            const res = validateUsn(u);
            if (res.isValid) valid.push(u);
            else invalid.push({ usn: u, error: res.error });
        });
        return { valid, invalid, allValid: invalid.length === 0 };
    }, [parsedUsns, isMultiUsn]);

    useEffect(() => {
        if (!showBacklogModal) return;
        const origOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = origOverflow;
        };
    }, [showBacklogModal]);

    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const messageTone = (() => {
        const normalized = String(message || '').toLowerCase();
        if (!normalized) return 'info';
        if (normalized.includes('found') || normalized.includes('success') || normalized.includes('present in database') || normalized.includes('scanned successfully')) return 'success';
        if (normalized.includes('warning') || normalized.includes('timed out')) return 'warning';
        if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('network') || normalized.includes('unable')
            || normalized.includes('invalid usn') || normalized.includes('no student record')) return 'error';
        return 'info';
    })();

    const getBacklogSemester = (mark) => mark.semester || (
        Object.entries(marks).find(([, subjects]) => subjects.some((subject) => (subject.subject_code || subject.code) === (mark.subject_code || mark.code))) || ['?', []]
    )[0];

    const GradeBadge = ({ grade }) => {
        const g = (grade || '').trim().toUpperCase();
        let bg = '#586C6D'; // var(--tx-muted)
        if (g === 'O' || g === 'S') bg = '#166534'; // var(--success)
        else if (g === 'A+' || g === 'A') bg = '#174B4D'; // var(--primary)
        else if (g === 'B+' || g === 'B') bg = '#3A6A6D'; // var(--secondary)
        else if (g === 'C') bg = '#B45309'; // var(--warm-highlight)
        else if (g === 'P') bg = '#789397'; // var(--accent)
        else if (g === 'F' || g === 'FAIL' || g === 'AB' || g === 'NP' || g === 'ABSENT') bg = '#B91C1C'; // var(--destructive)

        return (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '28px',
                    height: '22px',
                    padding: '0 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    backgroundColor: bg,
                    lineHeight: 1,
                    letterSpacing: '0.02em',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)'
                }}
            >
                {grade || '—'}
            </span>
        );
    };

    const latestSem = sortedSemesters.length > 0 ? sortedSemesters[0][0] : null;
    const [expandedSemesters, setExpandedSemesters] = useState({});
    const [viewMode, setViewMode] = useState('cards');

    const isExpanded = (sem) => {
        if (expandedSemesters[sem] !== undefined) {
            return expandedSemesters[sem];
        }
        // Default: Only the most recent / top semester is open, others closed
        return sem === latestSem;
    };

    const toggleSemester = (sem) => {
        setExpandedSemesters(prev => {
            const currentlyOpen = isExpanded(sem);
            return {
                ...prev,
                [sem]: !currentlyOpen
            };
        });
    };

    const allExpanded = sortedSemesters.length > 0 && sortedSemesters.every(([sem]) => isExpanded(sem));

    const toggleAll = () => {
        const nextState = !allExpanded;
        const update = {};
        sortedSemesters.forEach(([sem]) => {
            update[sem] = nextState;
        });
        setExpandedSemesters(update);
    };

    return (
        <div className={`${styles.page} gf-page gf-page-default gf-fade-up`}>
            {/* 1. Faculty Command Center: Student Lookup (Top) */}
            <section
                className={`${styles.section} ${styles.sectionLookup}`}
                aria-labelledby="faculty-lookup-title"
            >
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.eyebrow}>Faculty Command Center</div>
                        <h2 id="faculty-lookup-title" className={styles.sectionTitle}>Student Lookup</h2>
                        <p className={styles.subtitle} style={{ display: 'none' }}>Search for any student by USN to view or fetch their official records.</p>
                    </div>
                    {scraping && <LoadingState density="compact" label="Fetching VTU records" />}
                </div>

                <Inline className={styles.lookupRow} stackMobile>
                    <SearchInput
                        label="Student USN"
                        hideLabel
                        placeholder={isMultiUsn ? `${parsedUsns.length} USNs entered for batch lookup...` : "Enter Student USN(s) (e.g. 2AB23CS063, 2AB23CS043)"}
                        value={usn}
                        onChange={(event) => {
                            const raw = event.target.value;
                            const cleaned = raw.toUpperCase().replace(/[^A-Z0-9\s,;\n\r]/g, '');
                            setUsn?.(cleaned);
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && lookupStudent?.(usn)}
                        onClear={() => {
                            setUsn?.('');
                            setBatchResults?.(null);
                            setInspectedStudent?.(null);
                        }}
                        error={usn && !isMultiUsn && !usnValidation.isValid && !usnValidation.suggestion ? usnValidation.error : undefined}
                    />
                    <Button iconStart="search" onClick={() => lookupStudent?.(usn)} loading={loading}>
                        {loading ? 'Searching...' : isMultiUsn ? `Lookup ${parsedUsns.length} USNs` : 'Lookup'}
                    </Button>
                    <Button
                        variant="secondary"
                        iconStart={scraping ? 'cancel' : 'cloud_download'}
                        onClick={() => scraping ? stopScraping?.() : fetchFromVTU?.()}
                        disabled={!usn && !scraping}
                    >
                        {scraping ? 'Stop' : isMultiUsn ? `Fetch ${parsedUsns.length} VTU` : (selectedPortalUrls.length > 0 ? `Fetch (${selectedPortalUrls.length} Portals)` : 'Fetch VTU')}
                    </Button>
                </Inline>

                {/* Multi-USN Detection Pill */}
                {isMultiUsn && (
                    <div className={styles.multiUsnPill}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                        <span><strong>{parsedUsns.length} USNs</strong> detected for batch search</span>
                        <span className={styles.multiUsnListPreview}>
                            ({parsedUsns.slice(0, 4).join(', ')}{parsedUsns.length > 4 ? ` +${parsedUsns.length - 4} more` : ''})
                        </span>
                        {multiUsnStats?.invalid.length > 0 && (
                            <span style={{ color: 'var(--red, #EF4444)', fontSize: '11px', fontWeight: 700 }}>
                                · {multiUsnStats.invalid.length} invalid format
                            </span>
                        )}
                    </div>
                )}

                {/* Real-time Validation / Did You Mean Assistant */}
                {!isMultiUsn && usn && usnValidation.suggestion && (
                    <div style={{
                        marginTop: '10px',
                        padding: '10px 14px',
                        background: 'rgba(180, 83, 9, 0.08)',
                        border: '1px solid var(--amber-border, #FFE082)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--amber, #B45309)', fontWeight: 600 }}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>lightbulb</span>
                            <span>Did you mean <strong>{usnValidation.suggestion}</strong>? ({usnValidation.error})</span>
                        </div>
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                                setUsn?.(usnValidation.suggestion);
                                lookupStudent?.(usnValidation.suggestion);
                            }}
                        >
                            Apply & Search
                        </Button>
                    </div>
                )}

                {!isMultiUsn && usn && !usnValidation.isValid && !usnValidation.suggestion && (
                    <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        background: 'var(--red-bg, #FFEBEE)',
                        border: '1px solid var(--red-border, #FFCDD2)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--red, #B91C1C)'
                    }}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>error_outline</span>
                        <span>{usnValidation.error}</span>
                    </div>
                )}

                {!isMultiUsn && usn && usnValidation.isValid && usnValidation.segments && (
                    <div style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                        fontSize: '11px',
                        fontWeight: 700
                    }}>
                        <span style={{ color: 'var(--success, #166534)', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--success-bg, #E8F5E9)', padding: '3px 8px', borderRadius: '4px' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                            Valid VTU USN
                        </span>
                        <span style={{ background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: '4px', color: 'var(--tx-muted)' }}>
                            Region: <strong>{usnValidation.segments.region}</strong>
                        </span>
                        <span style={{ background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: '4px', color: 'var(--tx-muted)' }}>
                            College: <strong>{usnValidation.segments.college}</strong>
                        </span>
                        <span style={{ background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: '4px', color: 'var(--tx-muted)' }}>
                            Year: <strong>20{usnValidation.segments.year}</strong>
                        </span>
                        <span style={{ background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: '4px', color: 'var(--tx-muted)' }}>
                            Branch: <strong>{usnValidation.segments.branch}</strong>
                        </span>
                        <span style={{ background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: '4px', color: 'var(--tx-muted)' }}>
                            Roll: <strong>#{usnValidation.segments.roll}</strong>
                        </span>
                    </div>
                )}

                {/* Interactive Multi-Portal Selector with Popover Checklists, Quick Filters, & Chips */}
                <div className={styles.targetPortalBar}>
                    <div className={styles.targetPortalLabel}>
                        <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>tune</span>
                        <span>Target Portal:</span>
                    </div>

                    <div className={styles.targetPortalContainer} ref={portalDropdownRef}>
                        <button
                            type="button"
                            className={`${styles.targetPortalTrigger} ${portalDropdownOpen ? styles.targetPortalTriggerActive : ''}`}
                            onClick={() => {
                                refreshPortals?.();
                                setPortalDropdownOpen(prev => !prev);
                            }}
                            disabled={scraping}
                            aria-label="Select VTU Portals to Scrape"
                        >
                            <div className={styles.targetPortalSummary}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>
                                    {selectedPortalUrls.length === 0 ? 'bolt' : 'ads_click'}
                                </span>
                                <span>
                                    {selectedPortalUrls.length === 0
                                        ? '⚡ All Portals (Deep Full Scan)'
                                        : selectedPortalUrls.length === 1
                                            ? (availablePortals.find(p => p.url === selectedPortalUrls[0])?.exam_name || '1 Portal Selected')
                                            : `${selectedPortalUrls.length} Portals Selected`}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {selectedPortalUrls.length > 1 && (
                                    <span className={styles.targetPortalCountBadge}>{selectedPortalUrls.length}</span>
                                )}
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-muted)' }}>
                                    {portalDropdownOpen ? 'expand_less' : 'expand_more'}
                                </span>
                            </div>
                        </button>

                        {portalDropdownOpen && (
                            <div className={styles.targetPortalDropdown}>
                                {/* 1. Scheme Filter Tabs (All, 2022, 2025, MBA, MCA) */}
                                <div className={styles.targetPortalSchemeTabs} role="tablist" aria-label="Curriculum Schemes">
                                    {[
                                        { key: 'ALL', shortLabel: 'All', icon: 'apps' },
                                        { key: '2022', shortLabel: '2022 Scheme', icon: 'auto_stories' },
                                        { key: '2025', shortLabel: '2025 Scheme', icon: 'school' },
                                        { key: 'mba', shortLabel: 'MBA', icon: 'workspace_premium' },
                                        { key: 'mca', shortLabel: 'MCA', icon: 'memory' }
                                    ].map(tab => {
                                        const isActive = portalSchemeFilter === tab.key;
                                        const count = schemeCounts[tab.key] ?? 0;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                role="tab"
                                                aria-selected={isActive}
                                                className={`${styles.targetPortalSchemeTab} ${isActive ? styles.targetPortalSchemeTabActive : ''}`}
                                                onClick={() => {
                                                    setPortalSchemeFilter(tab.key);
                                                    if (tab.key !== 'ALL') {
                                                        setQuickAddScheme(tab.key);
                                                    }
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '13px' }}>
                                                    {tab.icon}
                                                </span>
                                                <span>{tab.shortLabel}</span>
                                                <span className={styles.targetPortalSchemeTabBadge}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* 2. Type Filters & Selection Helpers */}
                                <div className={styles.targetPortalQuickBar}>
                                    <button
                                        type="button"
                                        className={`${styles.quickFilterBtn} ${portalQuickCategory === 'ALL' ? styles.quickFilterBtnActive : ''}`}
                                        onClick={() => setPortalQuickCategory('ALL')}
                                    >
                                        All Types
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.quickFilterBtn} ${portalQuickCategory === 'REGULAR' ? styles.quickFilterBtnActive : ''}`}
                                        onClick={() => setPortalQuickCategory('REGULAR')}
                                    >
                                        Regular
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.quickFilterBtn} ${portalQuickCategory === 'MAKEUP' ? styles.quickFilterBtnActive : ''}`}
                                        style={portalQuickCategory === 'MAKEUP' ? { borderColor: '#7C3AED', color: '#7C3AED', background: 'rgba(139,92,246,0.1)' } : {}}
                                        onClick={() => setPortalQuickCategory('MAKEUP')}
                                    >
                                        MakeUp / Summer
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.quickFilterBtn} ${portalQuickCategory === 'REVAL' ? styles.quickFilterBtnActive : ''}`}
                                        style={portalQuickCategory === 'REVAL' ? { borderColor: '#D97706', color: '#D97706', background: 'rgba(245,158,11,0.1)' } : {}}
                                        onClick={() => setPortalQuickCategory('REVAL')}
                                    >
                                        Reval
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.quickFilterBtn}
                                        style={{ marginLeft: 'auto' }}
                                        onClick={toggleAllFilteredPortals}
                                    >
                                        {areAllFilteredSelected ? 'Deselect Filtered' : 'Select All Filtered'}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.quickFilterBtn}
                                        onClick={clearAllPortals}
                                    >
                                        Clear
                                    </button>
                                </div>

                                {/* 3. Search Bar with Clear Button */}
                                <div className={styles.targetPortalSearchWrapper}>
                                    <span className={`material-icons-round ${styles.targetPortalSearchIcon}`} style={{ fontSize: '16px' }}>
                                        search
                                    </span>
                                    <input
                                        type="text"
                                        className={styles.targetPortalSearchInput}
                                        placeholder="Filter portals by exam name or URL..."
                                        value={portalSearchFilter}
                                        onChange={(e) => setPortalSearchFilter(e.target.value)}
                                    />
                                    {portalSearchFilter && (
                                        <button
                                            type="button"
                                            className={styles.targetPortalSearchClear}
                                            onClick={() => setPortalSearchFilter('')}
                                            aria-label="Clear filter"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>close</span>
                                        </button>
                                    )}
                                </div>

                                {/* 4. Sub-bar: Counter & Inline Add Portal Toggle */}
                                <div className={styles.targetPortalSubBar}>
                                    <span>
                                        Showing <strong>{filteredPortals.length}</strong> of {schemeCounts[portalSchemeFilter] ?? availablePortals.length} portals
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.targetPortalTextBtn}
                                        onClick={() => setQuickAddOpen(prev => !prev)}
                                    >
                                        {quickAddOpen ? '✕ Close Add Form' : '+ Add Portal URL'}
                                    </button>
                                </div>

                                {/* 5. Inline Quick Add Portal Form */}
                                {quickAddOpen && (
                                    <form className={styles.targetPortalQuickAddBox} onSubmit={handleQuickAddPortal}>
                                        <div className={styles.targetPortalQuickAddTitle}>
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>add_link</span>
                                            Register New VTU Result Portal
                                        </div>
                                        <input
                                            type="url"
                                            required
                                            className={styles.targetPortalQuickAddInput}
                                            placeholder="https://results.vtu.ac.in/..."
                                            value={quickAddUrl}
                                            onChange={(e) => setQuickAddUrl(e.target.value)}
                                        />
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <input
                                                type="text"
                                                className={styles.targetPortalQuickAddInput}
                                                style={{ flex: 2, minWidth: '130px' }}
                                                placeholder="Exam Name (e.g. Dec 25/Jan 26)"
                                                value={quickAddExamName}
                                                onChange={(e) => setQuickAddExamName(e.target.value)}
                                            />
                                            <select
                                                className={styles.targetPortalQuickAddInput}
                                                style={{ flex: 1, minWidth: '100px' }}
                                                value={quickAddScheme}
                                                onChange={(e) => setQuickAddScheme(e.target.value)}
                                            >
                                                <option value="2022">2022 Scheme</option>
                                                <option value="2025">2025 Scheme</option>
                                                <option value="both">Both 2022 &amp; 2025</option>
                                                <option value="mba">MBA Scheme</option>
                                                <option value="mca">MCA Scheme</option>
                                            </select>
                                        </div>

                                        {/* Exam Type Segmented Picker */}
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Exam Type</div>
                                            <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border, #e2e8f0)', width: '100%' }}>
                                                {[
                                                    { key: 'REGULAR', label: 'Regular',         icon: 'check_circle', color: '#2563EB', bg: 'rgba(37,99,235,0.1)' },
                                                    { key: 'MAKEUP',  label: 'MakeUp / Summer', icon: 'replay',       color: '#7C3AED', bg: 'rgba(139,92,246,0.1)' },
                                                    { key: 'REVAL',   label: 'Reval',            icon: 'fact_check',   color: '#D97706', bg: 'rgba(245,158,11,0.1)' },
                                                ].map((opt, i) => {
                                                    const active = quickAddExamType === opt.key;
                                                    return (
                                                        <button
                                                            key={opt.key}
                                                            type="button"
                                                            onClick={() => { setQuickAddExamType(opt.key); setQuickAddUserOverrode(true); }}
                                                            style={{
                                                                flex: 1,
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                                                padding: '7px 6px',
                                                                background: active ? opt.bg : 'var(--surface, #fff)',
                                                                color: active ? opt.color : 'var(--tx-muted, #64748b)',
                                                                border: 'none',
                                                                borderLeft: i > 0 ? '1px solid var(--border, #e2e8f0)' : 'none',
                                                                fontWeight: active ? 800 : 600,
                                                                fontSize: '11px',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>{opt.icon}</span>
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {quickAddError && (
                                            <div style={{ fontSize: '11px', color: 'var(--red, #b91c1c)', fontWeight: 600 }}>
                                                {quickAddError}
                                            </div>
                                        )}
                                        {quickAddSuccess && (
                                            <div style={{ fontSize: '11px', color: 'var(--success, #166534)', fontWeight: 700 }}>
                                                {quickAddSuccess}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                                            <Button size="sm" variant="ghost" type="button" onClick={() => setQuickAddOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button size="sm" variant="primary" type="submit" disabled={quickAddLoading || !quickAddUrl}>
                                                {quickAddLoading ? 'Saving...' : 'Add & Target Portal'}
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {/* 6. Accessible Portal List with Glitch-Free Labels & Scheme Badges */}
                                <div className={styles.targetPortalList}>
                                    {filteredPortals.map((p, idx) => {
                                        const isChecked = selectedPortalUrls.includes(p.url);
                                        const cat = getPortalCategory(p);
                                        const normScheme = normalizePortalScheme(p.scheme);
                                        const schemeLabelText = normScheme === 'mba' ? 'MBA' : normScheme === 'mca' ? 'MCA' : `${normScheme}`;
                                        return (
                                            <label
                                                key={p.id || `${p.scheme || '2022'}-${p.url}-${idx}`}
                                                className={`${styles.targetPortalItem} ${isChecked ? styles.targetPortalItemChecked : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className={styles.targetPortalCheckbox}
                                                    checked={isChecked}
                                                    onChange={() => togglePortal(p.url)}
                                                />
                                                <div className={styles.targetPortalItemInfo}>
                                                    <span className={styles.targetPortalItemName}>{p.exam_name || p.url}</span>
                                                    <span className={styles.targetPortalItemUrl}>{p.url}</span>
                                                </div>
                                                <div className={styles.targetPortalBadgesRow}>
                                                    <span className={`${styles.targetPortalSchemeBadge} ${styles['targetPortalScheme_' + normScheme]}`}>
                                                        {schemeLabelText}
                                                    </span>
                                                    <span className={`${styles.targetPortalTypeBadge} ${
                                                        cat === 'REVAL' ? styles.targetPortalTypeReval
                                                        : cat === 'MAKEUP' ? styles.targetPortalTypeMakeup
                                                        : styles.targetPortalTypeRegular
                                                    }`}>
                                                        {{ REVAL: 'Reval', MAKEUP: 'MakeUp', REGULAR: 'Regular' }[cat]}
                                                    </span>
                                                </div>
                                            </label>
                                        );
                                    })}
                                    {filteredPortals.length === 0 && (
                                        <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                            <span className="material-icons-round" style={{ fontSize: '24px', color: 'var(--tx-dim)', display: 'block', marginBottom: '4px' }}>
                                                search_off
                                            </span>
                                            No matching portals found for this filter.
                                            {portalSearchFilter && (
                                                <div style={{ marginTop: '6px' }}>
                                                    <button
                                                        type="button"
                                                        className={styles.targetPortalTextBtn}
                                                        onClick={() => setPortalSearchFilter('')}
                                                    >
                                                        Clear Search
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 7. Dropdown Footer */}
                                <div className={styles.targetPortalFooter}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className={styles.targetPortalSelectedCount}>
                                            <strong>{selectedPortalUrls.length}</strong> selected
                                        </span>
                                        {selectedPortalUrls.length > 0 && (
                                            <button
                                                type="button"
                                                className={styles.targetPortalTextBtn}
                                                onClick={clearAllPortals}
                                                title="Deselect all portals"
                                            >
                                                Clear All
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <Link
                                            href="/faculty/vtu-urls"
                                            className={styles.targetPortalManageLink}
                                            title="Manage VTU result portal URLs & configurations"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>tune</span>
                                            Manage Portals
                                        </Link>
                                        <Button size="sm" variant="secondary" onClick={() => setPortalDropdownOpen(false)}>
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedPortalUrls.length > 0 && (
                        <span className={styles.fastPill} title="Targeted portal execution scans only selected URLs">
                            🚀 {selectedPortalUrls.length} Targeted
                        </span>
                    )}
                </div>

                {/* Selected Portal Chips */}
                {selectedPortalUrls.length > 0 && (
                    <div className={styles.portalChipsWrapper}>
                        {selectedPortalUrls.map(url => {
                            const p = availablePortals.find(item => item.url === url);
                            const label = p?.exam_name || url;
                            const normScheme = p?.scheme ? normalizePortalScheme(p.scheme) : null;
                            const schemeLabelText = normScheme === 'mba' ? 'MBA' : normScheme === 'mca' ? 'MCA' : `${normScheme}`;
                            return (
                                <div key={url} className={styles.portalChip}>
                                    {normScheme && (
                                        <span className={`${styles.targetPortalSchemeBadge} ${styles['targetPortalScheme_' + normScheme]}`} style={{ padding: '1px 5px', fontSize: '9px' }}>
                                            {schemeLabelText}
                                        </span>
                                    )}
                                    <span className={styles.portalChipText} title={url}>{label}</span>
                                    <button
                                        type="button"
                                        className={styles.portalChipRemove}
                                        onClick={() => togglePortal(url)}
                                        aria-label={`Remove ${label}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {scrapeProgress && (
                    <div className={`${styles.notice} ${styles.noticeInfo}`}>
                        <LoadingState density="compact" label={scrapeProgress} />
                    </div>
                )}
                {message && (
                    <div className={`${styles.notice} ${styles[`notice${messageTone.charAt(0).toUpperCase()}${messageTone.slice(1)}`]}`}>
                        {message}
                    </div>
                )}
            </section>

            {/* Lookup outcome: a USN that is malformed, or well-formed but unknown to
                the institution. Previously the API answered with a synthetic profile
                and the dashboard rendered an empty transcript as though the student
                existed — the single most misleading state on this page. */}
            {!student && !batchResults && lookupIssue && (
                <section className={styles.section} aria-live="polite">
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'flex-start',
                        padding: '20px 22px',
                        borderRadius: 'var(--radius-3)',
                        border: '1px solid var(--red-border, #FFCDD2)',
                        background: 'var(--red-bg, #FFF5F5)'
                    }}>
                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '28px', color: 'var(--red, #B91C1C)' }}>
                            {lookupIssue.reason === 'INVALID_USN' ? 'report' : 'person_search'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--red, #B91C1C)', letterSpacing: '-0.01em' }}>
                                {lookupIssue.reason === 'INVALID_USN' ? 'INVALID USN' : 'STUDENT NOT FOUND'}
                            </h2>
                            <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--tx-main)', fontWeight: 600, lineHeight: 1.55 }}>
                                {lookupIssue.message}
                            </p>
                            <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                Searched for <strong style={{ fontFamily: 'monospace', color: 'var(--tx-main)' }}>{lookupIssue.usn}</strong>
                                {lookupIssue.reason === 'INVALID_USN' ? ' · Expected the VTU format, e.g. 2AB23CS043' : ' · The USN is well-formed but no record exists in this institution'}
                            </p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                                {lookupIssue.suggestion && (
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        iconStart="auto_fix_high"
                                        onClick={() => {
                                            setUsn?.(lookupIssue.suggestion);
                                            lookupStudent?.(lookupIssue.suggestion);
                                        }}
                                    >
                                        Search {lookupIssue.suggestion} instead
                                    </Button>
                                )}
                                {lookupIssue.reason === 'NOT_FOUND' && (
                                    <Button size="sm" variant="secondary" iconStart="cloud_download" onClick={() => fetchFromVTU?.()} disabled={scraping}>
                                        Fetch from VTU portal
                                    </Button>
                                )}
                                <Button size="sm" variant="ghost" iconStart="backspace" onClick={() => { setUsn?.(''); setMessage?.(''); }}>
                                    Clear
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Batch Roster & Intelligence View (When 2+ USNs are searched) */}
            {batchResults && !inspectedStudent && (
                <section className={styles.section} aria-label="Batch Student Roster">
                    <div className={styles.batchContainer}>
                        <div className={styles.batchHeaderBar}>
                            <div>
                                <h2 className={styles.sectionTitle} style={{ fontSize: '18px' }}>
                                    Batch Search Results ({batchResults.total} Students)
                                </h2>
                                <p className={styles.meta} style={{ marginTop: '2px' }}>
                                    {batchResults.foundCount} of {batchResults.total} students found in institutional database
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {batchResults.missingCount > 0 && (
                                    <Button
                                        variant="primary"
                                        iconStart={scraping ? 'sync' : 'cloud_download'}
                                        onClick={() => {
                                            const missing = batchResults.students.filter(s => !s.found).map(s => s.usn);
                                            fetchFromVTU?.(missing);
                                        }}
                                        loading={scraping}
                                    >
                                        Fetch {batchResults.missingCount} Missing from VTU
                                    </Button>
                                )}
                                <Button
                                    variant="secondary"
                                    iconStart="refresh"
                                    onClick={() => {
                                        const allUsns = batchResults.students.map(s => s.usn);
                                        fetchFromVTU?.(allUsns);
                                    }}
                                    disabled={scraping}
                                >
                                    Fetch All from VTU
                                </Button>
                                <Button
                                    variant="ghost"
                                    iconStart="close"
                                    onClick={() => {
                                        setBatchResults?.(null);
                                        setUsn?.('');
                                    }}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <div className={styles.batchKpis}>
                            <div className={styles.batchKpiCard}>
                                <span className={styles.batchKpiLabel}>Total Searched</span>
                                <span className={styles.batchKpiValue}>{batchResults.total}</span>
                            </div>
                            <div className={styles.batchKpiCard}>
                                <span className={styles.batchKpiLabel}>Found in Database</span>
                                <span className={styles.batchKpiValue} style={{ color: 'var(--green, #10B981)' }}>
                                    {batchResults.foundCount}
                                </span>
                            </div>
                            <div className={styles.batchKpiCard}>
                                <span className={styles.batchKpiLabel}>Needs Scrape</span>
                                <span className={styles.batchKpiValue} style={{ color: batchResults.missingCount > 0 ? 'var(--amber, #F59E0B)' : 'var(--tx-muted)' }}>
                                    {batchResults.missingCount}
                                </span>
                            </div>
                            <div className={styles.batchKpiCard}>
                                <span className={styles.batchKpiLabel}>Avg Batch CGPA</span>
                                <span className={styles.batchKpiValue}>
                                    {(() => {
                                        const found = batchResults.students.filter(s => s.found && s.cgpa > 0);
                                        if (found.length === 0) return '—';
                                        const avg = found.reduce((acc, s) => acc + (s.cgpa || 0), 0) / found.length;
                                        return avg.toFixed(2);
                                    })()}
                                </span>
                            </div>
                            <div className={styles.batchKpiCard}>
                                <span className={styles.batchKpiLabel}>Total Active Backlogs</span>
                                <span className={styles.batchKpiValue} style={{ color: 'var(--red, #EF4444)' }}>
                                    {batchResults.students.reduce((acc, s) => acc + (s.totalActiveBacklogs || 0), 0)}
                                </span>
                            </div>
                        </div>

                        <div className={styles.batchTableContainer}>
                            <table className={styles.batchTable}>
                                <thead>
                                    <tr>
                                        <th>USN</th>
                                        <th>Student Name</th>
                                        <th>Branch / Scheme</th>
                                        <th>CGPA</th>
                                        <th>Backlogs</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchResults.students.map((item, idx) => {
                                        const prof = item.profile || {};
                                        return (
                                            <tr key={item.usn || idx}>
                                                <td className={styles.studentUsnCell}>{item.usn}</td>
                                                <td className={styles.studentNameCell}>
                                                    {item.found ? (prof.name || item.usn) : <span style={{ color: 'var(--tx-muted)', fontStyle: 'italic' }}>Not on record</span>}
                                                </td>
                                                <td>
                                                    {item.found ? (
                                                        <span style={{ fontSize: '12px' }}>
                                                            {prof.branch || '—'} · {prof.scheme ? `${prof.scheme} Scheme` : '2022 Scheme'}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    {item.found ? (
                                                        <Badge tone={item.cgpa >= 8 ? 'success' : item.cgpa >= 6 ? 'info' : 'warning'}>
                                                            {fmtGpa(item.cgpa)}
                                                        </Badge>
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    {item.found ? (
                                                        <Badge tone={item.totalActiveBacklogs > 0 ? 'danger' : 'success'}>
                                                            {item.totalActiveBacklogs > 0 ? `${item.totalActiveBacklogs} Backlog${item.totalActiveBacklogs > 1 ? 's' : ''}` : 'Clear'}
                                                        </Badge>
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    {item.found ? (
                                                        <span className={`${styles.statusPill} ${styles.statusFound}`}>
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>check_circle</span>
                                                            RECORDED
                                                        </span>
                                                    ) : (
                                                        <span className={`${styles.statusPill} ${styles.statusMissing}`}>
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>help_outline</span>
                                                            NOT FOUND
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                        {item.found ? (
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                iconStart="visibility"
                                                                onClick={() => setInspectedStudent?.(item)}
                                                            >
                                                                Inspect
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="primary"
                                                                iconStart="cloud_download"
                                                                onClick={() => fetchFromVTU?.([item.usn])}
                                                                disabled={scraping}
                                                            >
                                                                Fetch VTU
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {/* Inspect Bar when drilling into a student from batch search */}
            {batchResults && inspectedStudent && (
                <div className={styles.inspectBar}>
                    <div className={styles.inspectBarTitle}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>account_circle</span>
                        <span>Inspecting Batch Profile: <strong>{inspectedStudent.profile?.name || inspectedStudent.usn}</strong> ({inspectedStudent.usn})</span>
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        iconStart="arrow_back"
                        onClick={() => setInspectedStudent?.(null)}
                    >
                        Back to Batch Overview ({batchResults.total} Students)
                    </Button>
                </div>
            )}

            {student ? (
                <>
                    <section className={styles.section} aria-labelledby="faculty-profile-title">
                        <div className={styles.profileHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                <div className={styles.avatar} aria-hidden="true">
                                    {(student.name?.[0] || student.usn?.[0] || '?').toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <h2 id="faculty-profile-title" className={styles.sectionTitle} style={{ margin: 0, fontSize: '18px' }}>{student.name || student.usn}</h2>
                                    <p className={styles.meta} style={{ marginTop: '2px', fontSize: '12px' }}>
                                        {student.usn} · {student.branchLabel || student.branch || 'Unassigned'}
                                        {student.batchLabel ? ` · ${student.batchLabel}` : ''}
                                        {student.scheme ? ` · ${student.scheme} Scheme` : ' · 2022 Scheme'}
                                    </p>
                                    {entry && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            <EntryTag lateral={entry.isLateral} showRegular />
                                            {entry.isLateral && (
                                                <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                    Admitted directly into semester {entry.firstSemester} · semesters 1 &amp; 2 not applicable
                                                    {student.admissionBatch && student.admissionBatch !== student.batch
                                                        ? ` · admitted ${student.admissionBatch}, graduates with ${student.batch}`
                                                        : ''}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={styles.profileActions}>
                                <Button
                                    variant="secondary"
                                    density="compact"
                                    iconStart="picture_as_pdf"
                                    onClick={handlePDF}
                                    disabled={pdfLoading || totalSubjects === 0}
                                    loading={pdfLoading}
                                >
                                    {pdfLoading ? 'Generating...' : 'PDF Transcript'}
                                </Button>
                                <Button
                                    variant="danger"
                                    density="compact"
                                    iconStart="delete"
                                    onClick={deleteStudent}
                                    disabled={loading || scraping}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>

                        <ResponsiveGrid size="sm" className={styles.statsGrid} aria-label="Student Academic Metrics">
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Current CGPA</div>
                                <div className={styles.statValue}>{fmtGpa(cgpa)}</div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Semesters Tracked</div>
                                <div className={styles.statValue}>{sortedSemesters.length}</div>
                                {entry?.isLateral && (
                                    <div style={{ fontSize: '10.5px', color: 'var(--tx-muted)', fontWeight: 600, marginTop: '4px' }}>
                                        of 6 (diploma entry)
                                    </div>
                                )}
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Subjects Logged</div>
                                <div className={styles.statValue}>{totalSubjects}</div>
                            </div>
                            <button
                                ref={backlogTriggerRef}
                                className={styles.statCardButton}
                                type="button"
                                onClick={() => failCount > 0 && setShowBacklogModal(true)}
                                disabled={failCount === 0}
                                aria-haspopup="dialog"
                                aria-expanded={showBacklogModal}
                                aria-controls="faculty-backlog-dialog"
                            >
                                <div className={styles.statLabel}>Active Backlogs</div>
                                <div className={`${styles.statValue} ${failCount > 0 ? styles.dangerText : styles.successText}`}>
                                    {failCount}
                                    {failCount > 0 && <span className="material-icons-round" aria-hidden="true">arrow_forward</span>}
                                </div>
                            </button>
                        </ResponsiveGrid>
                    </section>

                    <AcademicProgressionNavigator
                        sortedSemesters={sortedSemesters}
                        semStats={semStats}
                        sgpas={sgpas}
                        onSelectSemester={(semStr) => {
                            if (viewMode !== 'cards') {
                                setViewMode('cards');
                            }
                            setExpandedSemesters(prev => ({
                                ...prev,
                                [semStr]: true
                            }));
                            setTimeout(() => {
                                const el = document.getElementById(`sem-card-${semStr}`);
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    el.style.transition = 'outline 0.3s ease, box-shadow 0.3s ease';
                                    el.style.outline = '2px solid var(--primary)';
                                    el.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.3)';
                                    setTimeout(() => {
                                        el.style.outline = 'none';
                                        el.style.boxShadow = 'none';
                                    }, 1800);
                                }
                            }, 80);
                        }}
                    />

                    <section className={styles.section} aria-labelledby="faculty-records-title">
                        <div className={styles.sectionHeader}>
                            <div className={styles.resultsTitleGroup}>
                                <span className="material-icons-round" style={{ fontSize: '24px', color: 'var(--primary)' }}>menu_book</span>
                                <h2 id="faculty-records-title" className={styles.sectionTitle} style={{ margin: 0 }}>Semester Results</h2>
                                <span className={styles.resultsCountBadge}>
                                    {sortedSemesters.length} {sortedSemesters.length === 1 ? 'semester' : 'semesters'}
                                </span>
                            </div>
                            <div className={styles.chipRow}>
                                <div className={styles.viewModeToggle}>
                                    <button
                                        type="button"
                                        className={`${styles.viewModeBtn} ${viewMode === 'cards' ? styles.viewModeBtnActive : ''}`}
                                        onClick={() => setViewMode('cards')}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>view_agenda</span>
                                        Mark Sheets
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.viewModeBtn} ${viewMode === 'table' ? styles.viewModeBtnActive : ''}`}
                                        onClick={() => setViewMode('table')}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>table_chart</span>
                                        Summary Table
                                    </button>
                                </div>
                                {viewMode === 'cards' && (
                                    <Button
                                        variant="ghost"
                                        density="compact"
                                        iconStart={allExpanded ? 'unfold_less' : 'unfold_more'}
                                        onClick={toggleAll}
                                    >
                                        {allExpanded ? 'Collapse All' : 'Expand All'}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {sortedSemesters.length > 0 ? (
                            <>
                                {viewMode === 'table' ? (
                                    <div className={styles.tableWrap} style={{ display: 'block' }}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th scope="col">Semester</th>
                                                    <th scope="col" className={styles.center}>SGPA</th>
                                                    <th scope="col" className={styles.center}>Credits Earned</th>
                                                    <th scope="col" className={styles.center}>Grade Points</th>
                                                    <th scope="col" className={styles.center}>Backlogs</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedSemesters.map(([sem]) => {
                                                    const stat = semStats[sem] || { sgpa: 0, earnedCredits: 0, gradePoints: 0, backlogs: 0 };
                                                    return (
                                                        <tr key={sem}>
                                                            <th scope="row"><strong>Semester {sem}</strong></th>
                                                            <td className={styles.center}>{(sgpas[sem] || stat.sgpa || 0).toFixed(2)}</td>
                                                            <td className={styles.center}>{stat.earnedCredits}</td>
                                                            <td className={styles.center}>{(stat.gradePoints || 0).toFixed(2)}</td>
                                                            <td className={styles.center}>
                                                                <Badge tone={stat.backlogs > 0 ? 'danger' : 'success'} size="sm">
                                                                    {stat.backlogs === 0 ? 'Clear' : stat.backlogs}
                                                                </Badge>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className={styles.records}>
                                        {sortedSemesters.map(([sem, subjects]) => {
                                             const open = isExpanded(sem);
                                             const stat = semStats[sem] || {};
                                             const semSgpa = Number(sgpas[sem] || stat.sgpa || 0);
                                             const semBacklogs = subjects.filter(s => s.isFailed || isFailedSubject(s));
                                             const backlogCount = stat.backlogs != null ? stat.backlogs : semBacklogs.length;
                                             const hasBacklog = backlogCount > 0;
                                             const clearedCount = subjects.filter(s => s.isPassed || (!s.isFailed && !isFailedSubject(s))).length;

                                             return (
                                                 <article key={sem} id={`sem-card-${sem}`} className={`${styles.semesterCard} ${open ? styles.semesterCardOpen : ''}`}>
                                                     <div
                                                         className={styles.semesterHeader}
                                                         onClick={() => toggleSemester(sem)}
                                                         role="button"
                                                         tabIndex={0}
                                                         onKeyDown={(e) => {
                                                             if (e.key === 'Enter' || e.key === ' ') {
                                                                 e.preventDefault();
                                                                 toggleSemester(sem);
                                                             }
                                                         }}
                                                         aria-expanded={open}
                                                     >
                                                         <div className={styles.semLeftGroup}>
                                                             <div className={styles.semNumberBadge}>
                                                                 {sem}
                                                             </div>
                                                             <div className={styles.semInfo}>
                                                                 <div className={styles.semTitleRow}>
                                                                     <h3 className={styles.semTitle}>Semester {sem}</h3>
                                                                     {hasBacklog && (
                                                                         <span className={styles.semBacklogPill}>
                                                                             {backlogCount} {backlogCount === 1 ? 'Backlog' : 'Backlogs'}
                                                                         </span>
                                                                     )}
                                                                 </div>
                                                                 <p className={styles.semSubtitle}>
                                                                     {subjects.length} subj · {clearedCount} cleared
                                                                 </p>
                                                             </div>
                                                         </div>

                                                         <div className={styles.semRightGroup}>
                                                             <div className={styles.semSgpaBlock}>
                                                                 <span className={styles.semSgpaValue}>
                                                                     {semSgpa > 0 ? semSgpa.toFixed(2) : '0.00'}
                                                                 </span>
                                                                 <span className={styles.semSgpaLabel}>SGPA</span>
                                                             </div>

                                                             <button
                                                                 type="button"
                                                                 className={styles.semPdfBtn}
                                                                 title={`Download Semester ${sem} Marksheet PDF`}
                                                                 aria-label={`Download Semester ${sem} Marksheet PDF`}
                                                                 onClick={async (e) => {
                                                                     e.stopPropagation();
                                                                     try {
                                                                         const { generateResultPDF } = await import('../../../lib/generatePDF');
                                                                         await generateResultPDF({
                                                                             studentName: student.name || student.usn,
                                                                             usn: student.usn,
                                                                             branch: student.branch || '',
                                                                             scheme: student.scheme || '2022',
                                                                             semesterMarks: { [sem]: subjects },
                                                                             cgpa: semSgpa
                                                                         });
                                                                     } catch (err) {
                                                                         setMessage('Error generating semester PDF: ' + err.message);
                                                                     }
                                                                 }}
                                                             >
                                                                 <span className="material-icons-round" style={{ fontSize: '18px' }}>download</span>
                                                                 <span className={styles.semPdfText}>Sem {sem}</span>
                                                             </button>

                                                             <div className={`${styles.semChevron} ${open ? styles.semChevronOpen : ''}`}>
                                                                 <span className="material-icons-round" style={{ fontSize: '22px' }}>
                                                                     {open ? 'expand_less' : 'expand_more'}
                                                                 </span>
                                                             </div>
                                                         </div>
                                                     </div>

                                                     {open && (
                                                         <div className="gf-fade-in">
                                                             <div className={styles.tableWrap}>
                                                                 <table className={`${styles.table} ${styles.subjectTable}`}>
                                                                     <thead>
                                                                         <tr>
                                                                             <th scope="col">Code</th>
                                                                             <th scope="col">Subject</th>
                                                                             <th scope="col" className={styles.center}>INT</th>
                                                                             <th scope="col" className={styles.center}>EXT</th>
                                                                             <th scope="col" className={styles.center}>Total</th>
                                                                             <th scope="col" className={styles.center}>Grade</th>
                                                                             <th scope="col" className={styles.center}>GP</th>
                                                                             <th scope="col" className={styles.center}>CR</th>
                                                                             <th scope="col" className={styles.center}>Result</th>
                                                                             <th scope="col">Session</th>
                                                                         </tr>
                                                                     </thead>
                                                                     <tbody>
                                                                         {subjects.map((mark, index) => {
                                                                             const isPass = mark.isPassed || (!mark.isFailed && !isFailedSubject(mark));
                                                                             return (
                                                                                 <tr key={mark.id || `${sem}-${index}`}>
                                                                                     <th scope="row" className={styles.code}>
                                                                                         {mark.subjectCode || mark.subject_code || mark.code || '—'}
                                                                                     </th>
                                                                                     <td className={styles.subjectCell} title={mark.subjectName || mark.subject_name || mark.name}>
                                                                                         {mark.subjectName || mark.subject_name || mark.name}
                                                                                     </td>
                                                                                     <td className={styles.center} style={{ color: 'var(--tx-muted)' }}>
                                                                                         {mark.internalMarks ?? mark.cie_marks ?? mark.internal ?? '—'}
                                                                                     </td>
                                                                                     <td className={styles.center} style={{ color: 'var(--tx-muted)' }}>
                                                                                         {mark.seeMarks ?? mark.see_marks ?? mark.external ?? '—'}
                                                                                     </td>
                                                                                     <td className={styles.center}>
                                                                                         <strong style={{ color: 'var(--tx-main)', fontWeight: 800 }}>
                                                                                             {mark.totalMarks ?? mark.total_marks ?? mark.total ?? '—'}
                                                                                         </strong>
                                                                                     </td>
                                                                                     <td className={styles.center}>
                                                                                         <GradeBadge grade={mark.grade} />
                                                                                     </td>
                                                                                     <td className={styles.center}>
                                                                                         <strong style={{ color: 'var(--tx-main)' }}>
                                                                                             {mark.gpFormatted || (mark.gradePoint != null ? mark.gradePoint.toFixed(2) : '0.00')}
                                                                                         </strong>
                                                                                     </td>
                                                                                     <td className={styles.center}>
                                                                                         <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>{mark.credits}</span>
                                                                                     </td>
                                                                                     <td className={styles.center}>
                                                                                         <Badge tone={isPass ? 'success' : 'danger'} size="sm">
                                                                                             {isPass ? 'Pass' : 'Fail'}
                                                                                         </Badge>
                                                                                     </td>
                                                                                     <td className={styles.nowrap}>
                                                                                         {mark.announcedDate || mark.announced_date || mark.exam_date || 'Regular'}
                                                                                     </td>
                                                                                 </tr>
                                                                             );
                                                                         })}
                                                                     </tbody>
                                                                 </table>
                                                             </div>
                                                         </div>
                                                     )}
                                                 </article>
                                             );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <EmptyState
                                icon="school"
                                title="No Records Loaded"
                                description="Search for a student or fetch VTU records to view semester data."
                            />
                        )}
                    </section>

                    <section className={styles.dangerZone} aria-labelledby="faculty-danger-title">
                        <div>
                            <h2 id="faculty-danger-title" className={styles.sectionTitle}>Danger Zone</h2>
                            <p className={styles.meta}>Permanently delete all data for this student.</p>
                        </div>
                        <Button variant="danger" iconStart="delete" onClick={deleteStudent} loading={loading}>
                            Wipe Data
                        </Button>
                    </section>
                </>
            ) : (
                <EmptyState
                    icon="manage_search"
                    title="No Student Selected"
                    description="Enter a USN above to begin reviewing student records."
                />
            )}

            {/* Teaching Load & Assigned Subjects */}
            <section className={`${styles.section} ${styles.sectionTeaching}`} aria-labelledby="faculty-assigned-title">
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.eyebrow}>Teaching Load</div>
                        <h2 id="faculty-assigned-title" className={styles.sectionTitle}>My Assigned Subjects &amp; Classes</h2>
                        <p className={styles.meta}>Your current semester teaching roster and assignments. An admin can assign you a subject, or you can add one yourself below.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {loadAssignments && (
                            <Button
                                variant="ghost"
                                iconStart="refresh"
                                loading={assignedLoading}
                                onClick={() => loadAssignments(true)}
                                title="Refresh teaching assignments from database"
                            >
                                {assignedLoading ? 'Refreshing...' : 'Refresh'}
                            </Button>
                        )}
                        <Button
                            variant={addSubjectOpen ? 'ghost' : 'secondary'}
                            iconStart={addSubjectOpen ? 'close' : 'add'}
                            onClick={() => {
                                const nextState = !addSubjectOpen;
                                setAddSubjectOpen?.(nextState);
                                if (nextState && assignedClasses.length > 0 && !addSubjectForm?.semester) {
                                    const firstClass = assignedClasses[0];
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        branch: firstClass.branch || prev.branch || 'CS',
                                        semester: firstClass.semester ? String(firstClass.semester) : prev.semester || '',
                                        scheme: firstClass.batch && Number(firstClass.batch) >= 2025 ? '2025' : (prev.scheme || '2022'),
                                    }));
                                }
                            }}
                        >
                            {addSubjectOpen ? 'Cancel' : 'Add Subject'}
                        </Button>
                    </div>
                </div>

                {assignmentSyncMsg && (
                    <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', border: '1px solid var(--green)', fontSize: '12px', fontWeight: 700, marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="gf-fade-in">
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                        {assignmentSyncMsg}
                    </div>
                )}

                {addSubjectOpen && (
                    <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                        {addSubjectError && (
                            <div style={{ marginBottom: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--red, #e02424)' }}>
                                {addSubjectError}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '10px', alignItems: 'end' }}>
                            <Select
                                label="Branch"
                                options={BRANCH_OPTIONS}
                                value={addSubjectForm?.branch || 'CS'}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, branch: e.target.value, subject_code: '' }))}
                            />
                            <Select
                                label="Semester"
                                options={SEMESTER_OPTIONS}
                                placeholder="Select"
                                value={addSubjectForm?.semester || ''}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, semester: e.target.value, subject_code: '' }))}
                            />
                            <Select
                                label="Scheme"
                                options={SCHEME_OPTIONS}
                                value={addSubjectForm?.scheme || '2022'}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, scheme: e.target.value, subject_code: '' }))}
                            />
                            <SearchableSelect
                                label="Subject"
                                options={subjectOptions.map(s => ({
                                    value: s.code,
                                    label: `${s.code} — ${s.name}`,
                                    subtitle: `${s.branch} · Sem ${s.semester} · Scheme ${s.scheme} · ${s.credits || 3} credits`,
                                    badge: `Sem ${s.semester}`,
                                    code: s.code,
                                    name: s.name,
                                    semester: s.semester,
                                }))}
                                placeholder={
                                    subjectOptionsLoading
                                        ? 'Loading subjects…'
                                        : subjectOptions.length > 0
                                            ? 'Select or search a subject'
                                            : 'No subjects in catalog'
                                }
                                searchPlaceholder="Search code, name, or sem (e.g. BCS601, Cloud, 6)..."
                                value={addSubjectForm?.subject_code || ''}
                                onChange={e => {
                                    const chosenCode = e.target.value;
                                    const chosenSub = subjectOptions.find(s => s.code === chosenCode);
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        subject_code: chosenCode,
                                        semester: prev.semester || (chosenSub?.semester ? String(chosenSub.semester) : prev.semester)
                                    }));
                                }}
                                disabled={subjectOptionsLoading || subjectOptions.length === 0}
                            />
                            <Select
                                label="Class"
                                options={assignedClasses.map(c => ({ value: c.id, label: `${c.name} (${c.branch} · S${c.semester} · ${c.section})` }))}
                                placeholder={assignedClasses.length ? 'All my classes' : 'No classes assigned yet'}
                                value={addSubjectForm?.class_id || ''}
                                onChange={e => {
                                    const chosenClassId = e.target.value;
                                    const chosenClass = assignedClasses.find(c => String(c.id) === String(chosenClassId));
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        class_id: chosenClassId,
                                        ...(chosenClass ? {
                                            branch: chosenClass.branch || prev.branch,
                                            semester: chosenClass.semester ? String(chosenClass.semester) : prev.semester,
                                            ...(chosenClass.batch && Number(chosenClass.batch) >= 2025 ? { scheme: '2025' } : {})
                                        } : {})
                                    }));
                                }}
                                disabled={assignedClasses.length === 0}
                                helperText={assignedClasses.length ? 'Leave blank to teach this subject across all your classes.' : undefined}
                            />
                            <Button
                                variant="primary"
                                onClick={handleAddSubject}
                                loading={addSubjectSaving}
                                disabled={addSubjectSaving || !addSubjectForm?.subject_code}
                            >
                                Add to My Load
                            </Button>
                        </div>
                    </div>
                )}

                {assignedLoading ? (
                    <LoadingState density="compact" label="Loading your assignments" />
                ) : (assignedSubjects.length === 0 && assignedClasses.length === 0) ? (
                    !addSubjectOpen && (
                        <EmptyState
                            icon="assignment_ind"
                            title="No Subjects Assigned Yet"
                            description="An administrator hasn't linked you to any subjects yet — or add one yourself with the button above."
                        />
                    )
                ) : (
                    <>
                        {assignedClasses.length > 0 && (
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                                    Assigned Classes
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {assignedClasses.map(c => (
                                        <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 700 }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>school</span>
                                            <span>{c.name}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>({c.branch} · S{c.semester} · {c.section})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.assignedGrid}>
                            {assignedSubjects.map((a) => (
                                <div key={a.id} className={styles.assignedCard} style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        onClick={() => setAssignmentToConfirmRemove ? setAssignmentToConfirmRemove(a) : handleRemoveAssignment?.(a.id)}
                                        disabled={removingAssignmentId === a.id}
                                        aria-label={`Remove ${a.subject_code} from my teaching load`}
                                        title="Remove from my teaching load"
                                        style={{
                                            position: 'absolute', top: '8px', right: '8px',
                                            width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                            color: 'var(--tx-dim)', opacity: removingAssignmentId === a.id ? 0.5 : 1
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                    <div className={styles.assignedCode}>{a.subject_code}</div>
                                    <div className={styles.assignedName}>{a.subject_catalog?.subject_name || 'Subject name unavailable'}</div>
                                    <div className={styles.assignedMeta}>
                                        {a.branch || '—'} · Sem {a.semester ?? '—'} · Scheme {a.scheme || '—'}{a.subject_catalog?.credits ? ` · ${a.subject_catalog.credits} Cr` : ''}
                                    </div>
                                    {a.class_id && (() => {
                                        const cls = assignedClasses.find(c => c.id === a.class_id);
                                        return (
                                            <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-bg, rgba(37,99,235,0.08))', borderRadius: '6px', padding: '3px 8px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '13px' }}>school</span>
                                                {cls ? cls.name : 'Specific class'}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </section>

            {showBacklogModal && mounted && createPortal(
                <div className={styles.modalOverlay} role="presentation" onClick={closeBacklogModal}>
                    <section
                        ref={backlogDialogRef}
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="faculty-backlog-title"
                        aria-describedby="faculty-backlog-description"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 id="faculty-backlog-title" className={styles.modalTitle}>Backlog Subjects</h2>
                                <p id="faculty-backlog-description" className={styles.modalDescription}>
                                    {backlogs.length === 1 ? '1 subject pending clearance' : `${backlogs.length} subjects pending clearance`}
                                </p>
                            </div>
                            <IconButton icon="close" variant="ghost" aria-label="Close backlog dialog" onClick={closeBacklogModal} />
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.modalList}>
                                {backlogs.map((mark, index) => {
                                    const code = mark.subject_code || mark.code || mark.subjectCode || '—';
                                    const name = mark.subject_name || mark.name || mark.subjectName || code;
                                    const sem = getBacklogSemester(mark);
                                    const grade = unifyGrade(mark.grade);
                                    const isAbsent = grade === 'A' || grade === 'AB';
                                    return (
                                        <div key={index} className={styles.modalItem}>
                                            <div className={styles.modalItemInfo}>
                                                <div className={styles.modalSubjectTitle}>{name}</div>
                                                <div className={styles.modalSubjectMeta}>
                                                    <span className={styles.codePill}>{code}</span>
                                                    {sem && sem !== '?' && <span>Semester {sem}</span>}
                                                    {mark.credits != null && <span>· {mark.credits} Cr</span>}
                                                </div>
                                            </div>
                                            <Badge tone="danger">{isAbsent ? 'ABSENT' : 'FAIL'}</Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <Button variant="secondary" onClick={closeBacklogModal}>Close</Button>
                        </div>
                    </section>
                </div>,
                document.body
            )}
        </div>
    );
}

function FacultyDashboardContent() {
    const [faculty, setFaculty] = useState(null);
    const [usn, setUsn] = useState('');
    const [loading, setLoading] = useState(false);
    const [student, setStudent] = useState(null);
    const [batchResults, setBatchResults] = useState(null);
    const [inspectedStudent, setInspectedStudent] = useState(null);
    const [marks, setMarks] = useState({});
    const [sgpas, setSgpas] = useState({});
    const [semStats, setSemStats] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [message, setMessage] = useState('');
    // Set when a lookup resolves to "this USN is malformed" or "this USN is not in
    // the database" — the two outcomes the dashboard used to render as a blank
    // student profile. Cleared on every new lookup.
    const [lookupIssue, setLookupIssue] = useState(null);
    const [entry, setEntry] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [scrapeProgress, setScrapeProgress] = useState('');
    const [showBacklogModal, setShowBacklogModal] = useState(false);
    const [serverBacklogs, setServerBacklogs] = useState(null);
    const [serverActiveBacklogsCount, setServerActiveBacklogsCount] = useState(null);
    const [confirmingDeleteStudent, setConfirmingDeleteStudent] = useState(false);
    const [assignedSubjects, setAssignedSubjects] = useState([]);
    const [assignedClasses, setAssignedClasses] = useState([]);
    const [assignedLoading, setAssignedLoading] = useState(true);
    // All schemes (2022, 2025, MBA, MCA), polled through useLive so a portal
    // added or toggled from the Manage Portals page (or another tab) shows up
    // here on the next poll tick / focus revalidation, with no manual refresh.
    const { data: portalsData, refresh: refreshPortals } = useLive(faculty?.id ? '/api/vtu-urls' : null, {
        query: { faculty_id: faculty?.id },
        interval: LIVE.NORMAL,
    });
    const availablePortals = useMemo(
        () => (portalsData?.urls || []).filter(u => u.is_active),
        [portalsData]
    );

    // Sync portal changes immediately when triggered from VtuUrlManager or another tab
    useEffect(() => {
        const handleSync = () => {
            refreshPortals?.();
        };
        window.addEventListener('vtu_urls_updated', handleSync);
        const handleStorage = (e) => {
            if (e.key === 'vtu_urls_last_sync') handleSync();
        };
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('vtu_urls_updated', handleSync);
            window.removeEventListener('storage', handleStorage);
        };
    }, [refreshPortals]);
    const [selectedPortalUrl, setSelectedPortalUrl] = useState('ALL');
    const [selectedPortalUrls, setSelectedPortalUrls] = useState([]);
    const [customPortalUrl, setCustomPortalUrl] = useState('');

    useEffect(() => {
        if (!inspectedStudent) return;
        setStudent(inspectedStudent.profile || { usn: inspectedStudent.usn, name: inspectedStudent.usn });
        setMarks(inspectedStudent.marksBySemester || {});
        setSgpas(inspectedStudent.semSGPAs || {});
        setSemStats(inspectedStudent.semStats || {});
        setCgpa(inspectedStudent.cgpa || 0);
        setServerBacklogs(inspectedStudent.activeBacklogSubjects || null);
        setServerActiveBacklogsCount(inspectedStudent.totalActiveBacklogs ?? null);
        setEntry(inspectedStudent.entry || null);
    }, [inspectedStudent]);
    // Self-service "add my own subject" — same faculty_subject_assignments
    // table and endpoint the admin panel writes to, just scoped to self.
    const [addSubjectOpen, setAddSubjectOpen] = useState(false);
    const [addSubjectForm, setAddSubjectForm] = useState({ branch: 'CS', semester: '', scheme: '2022', subject_code: '', class_id: '' });
    const [subjectOptions, setSubjectOptions] = useState([]);
    const [subjectOptionsLoading, setSubjectOptionsLoading] = useState(false);
    const [addSubjectSaving, setAddSubjectSaving] = useState(false);
    const [addSubjectError, setAddSubjectError] = useState('');
    const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
    const [assignmentToConfirmRemove, setAssignmentToConfirmRemove] = useState(null);
    // The scrape job currently being watched: { id, usn, startedAt } or null.
    const [scrapeJob, setScrapeJob] = useState(null);
    const backlogDialogRef = useRef(null);
    const backlogTriggerRef = useRef(null);

    const stopScraping = (silent = false) => {
        setScrapeJob(null);
        setScraping(false);
        setScrapeProgress('');
        if (!silent) setMessage('Scraping scan halted.');
    };

    // Live scrape progress. Polls only while a job is active, stops the moment
    // the job reaches a terminal status.
    const { data: liveJob } = useLive('/api/scrape/status', {
        query: { jobId: scrapeJob?.id },
        interval: LIVE.FAST,
        enabled: Boolean(scrapeJob?.id),
    });

    useEffect(() => {
        if (!scrapeJob?.id || !liveJob) return;

        const { status, error: jobError, isTerminal } = liveJob;
        const usnForJob = scrapeJob.usn;

        if (!isTerminal) {
            setScrapeProgress(
                status === 'running'
                    ? `Scanning VTU portals for ${usnForJob}...`
                    : `Job ${scrapeJob.id.substring(0, 6)} queued for ${usnForJob}...`
            );

            // Surface rows as the scraper writes them, rather than only at the end.
            lookupStudent(usnForJob, true);

            // Safety net: stop watching after 15 minutes.
            if (Date.now() - scrapeJob.startedAt > 15 * 60 * 1000) {
                stopScraping(true);
                setMessage('Scan timed out. Some records might still be processing.');
                lookupStudent(usnForJob);
            }
            return;
        }

        stopScraping(true);
        if (status === 'finished') {
            setMessage('All portals scanned successfully!');
        } else if (status === 'no_result') {
            setMessage('Scan complete. No new results found.');
        } else if (status === 'missing') {
            setMessage('Scan job completed or removed.');
        } else {
            setMessage(jobError || 'Scrape failed.');
        }
        lookupStudent(usnForJob);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveJob, scrapeJob?.id]);

    const closeBacklogModal = () => {
        setShowBacklogModal(false);
        window.requestAnimationFrame(() => backlogTriggerRef.current?.focus());
    };

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (session) {
            setFaculty(JSON.parse(session));
        }
    }, []);

    // What this faculty member is actually assigned to teach — sourced from
    // the real faculty_subject_assignments table via the server session,
    // never guessed from which classes/students they happen to have browsed.
    // Rows can come from either an admin (Admin -> Faculty Assignments) or
    // the faculty member themself (Add Subject below) — same table, same
    // endpoint, so nothing ever needs reconciling between the two.
    const [assignmentSyncMsg, setAssignmentSyncMsg] = useState('');

    const loadAssignments = useCallback(async (isManual = false) => {
        setAssignedLoading(true);
        const prevSubjectsCount = assignedSubjects.length;
        const prevClassesCount = assignedClasses.length;
        try {
            if (isManual) clearApiCache();
            const data = await apiRequest(`/api/faculty/dashboard?_t=${Date.now()}`);
            const newSubjects = data?.assignedSubjects || [];
            const newClasses = data?.assignedClasses || [];
            setAssignedSubjects(newSubjects);
            setAssignedClasses(newClasses);

            if (isManual) {
                const diffSubj = newSubjects.length - prevSubjectsCount;
                const diffCls = newClasses.length - prevClassesCount;
                if (diffSubj > 0 || diffCls > 0) {
                    const parts = [];
                    if (diffSubj > 0) parts.push(`+${diffSubj} subject(s)`);
                    if (diffCls > 0) parts.push(`+${diffCls} class(es)`);
                    setAssignmentSyncMsg(`✓ New assignments detected: ${parts.join(', ')} synced dynamically!`);
                } else {
                    setAssignmentSyncMsg(`✓ Teaching load verified: All ${newSubjects.length} subject assignments are current.`);
                }
                setTimeout(() => setAssignmentSyncMsg(''), 4500);
            }
        } catch (err) {
            console.error('Failed to load assigned subjects:', err);
            setAssignedSubjects([]);
            setAssignedClasses([]);
        } finally {
            setAssignedLoading(false);
        }
    }, [assignedSubjects.length, assignedClasses.length]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    // Populate the subject picker for whichever branch/semester/scheme is
    // currently selected in the "Add Subject" form.
    useEffect(() => {
        if (!addSubjectOpen) {
            setSubjectOptions([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setSubjectOptionsLoading(true);
            try {
                const branch = addSubjectForm?.branch || 'CS';
                const scheme = addSubjectForm?.scheme || '2022';
                let url = `/api/subjects?branch=${encodeURIComponent(branch)}&scheme=${encodeURIComponent(scheme)}`;
                if (addSubjectForm?.semester) {
                    url += `&semester=${encodeURIComponent(addSubjectForm.semester)}`;
                }
                const res = await fetch(url, { credentials: 'include' });
                const json = await res.json();
                if (!cancelled) setSubjectOptions(json?.subjects || []);
            } catch (err) {
                console.error('Failed to load subject catalog:', err);
                if (!cancelled) setSubjectOptions([]);
            } finally {
                if (!cancelled) setSubjectOptionsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [addSubjectOpen, addSubjectForm.branch, addSubjectForm.semester, addSubjectForm.scheme]);

    const handleAddSubject = async () => {
        if (!addSubjectForm.subject_code) return;
        const selectedSub = subjectOptions.find(s => s.code === addSubjectForm.subject_code);
        const resolvedSemester = addSubjectForm.semester || (selectedSub?.semester ? String(selectedSub.semester) : '1');

        setAddSubjectSaving(true);
        setAddSubjectError('');
        try {
            await createFacultyAssignment({
                faculty_id: faculty?.id || undefined,
                subject_code: addSubjectForm.subject_code,
                branch: addSubjectForm.branch || selectedSub?.branch || 'CS',
                semester: parseInt(resolvedSemester, 10),
                scheme: addSubjectForm.scheme || selectedSub?.scheme || '2022',
                class_id: addSubjectForm.class_id || undefined,
            });

            // Activity log for faculty_activity & 5W1H audit
            recordFacultyAction(faculty, 'ASSIGN_SUBJECT', null, {
                details: `Added subject ${addSubjectForm.subject_code} to teaching load (${addSubjectForm.branch || 'CS'} · Sem ${resolvedSemester})`,
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                metadata: {
                    subject_code: addSubjectForm.subject_code,
                    branch: addSubjectForm.branch || 'CS',
                    semester: resolvedSemester,
                    scheme: addSubjectForm.scheme || '2022',
                    class_id: addSubjectForm.class_id || null,
                }
            });

            // Notify admin panel or other tabs
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('faculty_assignments_updated'));
                localStorage.setItem('faculty_assignments_last_sync', String(Date.now()));
            }

            setAddSubjectForm(prev => ({ ...prev, subject_code: '', class_id: '' }));
            setAddSubjectOpen(false);
            await loadAssignments();
        } catch (err) {
            setAddSubjectError(err?.message || 'Failed to add this subject to your teaching load.');
        } finally {
            setAddSubjectSaving(false);
        }
    };

    const handleRemoveAssignment = async (id) => {
        setRemovingAssignmentId(id);
        const targetAssignment = assignedSubjects.find(a => a.id === id);
        try {
            await deleteFacultyAssignment(id);

            // Activity log for faculty_activity & 5W1H audit
            recordFacultyAction(faculty, 'UNASSIGN_SUBJECT', null, {
                details: `Removed subject ${targetAssignment?.subject_code || id} from teaching load`,
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                metadata: {
                    assignment_id: id,
                    subject_code: targetAssignment?.subject_code,
                }
            });

            // Notify admin panel or other tabs
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('faculty_assignments_updated'));
                localStorage.setItem('faculty_assignments_last_sync', String(Date.now()));
            }

            await loadAssignments();
        } catch (err) {
            console.error('Failed to remove assignment:', err);
        } finally {
            setRemovingAssignmentId(null);
        }
    };
    useEffect(() => {
        if (!showBacklogModal) return;

        const focusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');

        const getFocusableItems = () => Array.from(backlogDialogRef.current?.querySelectorAll(focusableSelector) || []);

        window.requestAnimationFrame(() => {
            getFocusableItems()[0]?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeBacklogModal();
                return;
            }

            if (event.key !== 'Tab') return;

            const items = getFocusableItems();
            if (items.length === 0) {
                event.preventDefault();
                return;
            }

            const firstItem = items[0];
            const lastItem = items[items.length - 1];

            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showBacklogModal]);

    const lookupStudent = async (targetUsn, silent = false) => {
        if (!targetUsn) {
            if (!silent) setMessage('Please enter a USN.');
            return;
        }

        const rawTokens = String(targetUsn).split(/[\s,;\n\r]+/).map(t => t.trim()).filter(Boolean);
        const cleanUSNs = Array.from(new Set(rawTokens.map(t => cleanAlphanumeric(t).toUpperCase()).filter(Boolean)));

        if (cleanUSNs.length === 0) {
            if (!silent) setMessage('Please enter a valid USN.');
            return;
        }

        // Multi-USN Lookup Mode
        if (cleanUSNs.length > 1) {
            if (!silent) setLoading(true);
            setMessage('');
            setStudent(null);
            setInspectedStudent(null);
            setLookupIssue(null);
            try {
                const resData = await apiRequest('/api/faculty/dashboard', {
                    query: { search_usns: cleanUSNs.join(','), _t: Date.now() }
                });

                if (resData?.multi) {
                    setBatchResults(resData);
                    if (!silent) {
                        setMessage(`Batch lookup complete: ${resData.foundCount} of ${resData.total} students found in institutional records.`);
                    }
                    return;
                }
            } catch (err) {
                console.error('Batch lookup error:', err);
                if (!silent) setMessage('Failed to perform batch student lookup.');
            } finally {
                if (!silent) setLoading(false);
            }
            return;
        }

        // Single USN Lookup Mode
        const singleTarget = cleanUSNs[0];
        setBatchResults(null);
        setInspectedStudent(null);

        const usnCheck = validateUsn(singleTarget);
        if (!usnCheck.isValid) {
            if (!silent) {
                const hint = usnCheck.suggestion ? ` Did you mean ${usnCheck.suggestion}?` : '';
                setMessage(`Invalid USN: ${usnCheck.error || 'Expected the VTU format, e.g. 2AB23CS043.'}${hint}`);
                setLookupIssue({
                    reason: 'INVALID_USN',
                    usn: usnCheck.sanitized || String(singleTarget).toUpperCase(),
                    message: usnCheck.error || 'This is not a valid VTU University Seat Number.',
                    suggestion: usnCheck.suggestion || null
                });
                setStudent(null);
                setEntry(null);
            }
            return;
        }

        const cleanUSN = usnCheck.sanitized;
        // If it's a new USN search, clear previous student data immediately
        setStudent(null);
        setMarks({});
        setSgpas({});
        setSemStats({});
        setCgpa(0);
        setServerBacklogs(null);
        setServerActiveBacklogsCount(null);
        setEntry(null);
        setLookupIssue(null);

        if (!silent) setLoading(true);
        setMessage('');

        try {
            const resData = await apiRequest('/api/faculty/dashboard', { query: { search_usn: cleanUSN, _t: Date.now() } });

            // The API now answers "not found" explicitly instead of returning a
            // stand-in profile. Surface it as its own state so faculty can tell an
            // unknown USN apart from a student whose results have not been scraped.
            if (resData?.found === false) {
                setLookupIssue({
                    reason: resData.reason || 'NOT_FOUND',
                    usn: resData.usn || cleanUSN,
                    message: resData.message || `No student record found for ${cleanUSN}.`,
                    suggestion: resData.suggestion || null
                });
                if (!silent) {
                    setMessage(resData.reason === 'INVALID_USN'
                        ? `Invalid USN: ${resData.message}`
                        : resData.message || `No student record found for ${cleanUSN}.`);
                }
                return;
            }

            const profile = resData?.profile || { usn: cleanUSN, name: cleanUSN };

            // Use the server-pre-computed academic record — no client-side Supabase call needed.
            // (Previously this called calculateAcademicRecord() here in the browser, which
            // tried to fetch subject_catalog via the anon key and crashed under RLS.)
            const marksBySemester = resData?.marksBySemester || {};
            const semSGPAs = resData?.semSGPAs || {};
            const semStatsData = resData?.semStats || {};
            const cgpaValue = resData?.cgpa || 0;

            setStudent(profile);
            setMarks(marksBySemester);
            setSgpas(semSGPAs);
            setSemStats(semStatsData);
            setCgpa(cgpaValue);
            setServerBacklogs(resData?.activeBacklogSubjects || null);
            setServerActiveBacklogsCount(resData?.totalActiveBacklogs ?? null);
            setEntry(resData?.entry || null);

            // Audit Log
            await recordFacultyAction(faculty, 'VIEW_RECORD', cleanUSN);

            if (!silent) {
                const subjectCount = resData?.totalSubjects ?? Object.values(marksBySemester).flat().length;
                const entryNote = resData?.entry?.isLateral ? ' · Lateral entry (Diploma)' : '';
                setMessage(subjectCount > 0
                    ? `Found ${profile.name || cleanUSN} - ${subjectCount} subjects processed.${entryNote}`
                    : `Found ${profile.name || cleanUSN}, but no results are on record yet. Use "Fetch VTU" to pull them.${entryNote}`);
            }

        } catch (err) {
            console.error('Lookup error:', err);
            if (!silent) setMessage('Could not fetch student data.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const [forceDeep] = useState(false);

    const fetchFromVTU = async (specificUsns = null) => {
        let candidateUsns = [];
        if (Array.isArray(specificUsns)) {
            candidateUsns = specificUsns;
        } else if (typeof specificUsns === 'string') {
            candidateUsns = [specificUsns];
        } else {
            const rawTokens = (usn || '').split(/[\s,;\n\r]+/).map(t => t.trim()).filter(Boolean);
            const tokens = Array.from(new Set(rawTokens.map(t => cleanAlphanumeric(t).toUpperCase()).filter(Boolean)));
            if (tokens.length > 0) {
                candidateUsns = tokens;
            } else if (student?.usn) {
                candidateUsns = [student.usn];
            }
        }

        if (candidateUsns.length === 0) {
            setMessage('Please enter a valid USN to fetch.');
            return;
        }

        // Resolve target portal URLs
        let targetPortalList = null;
        if (selectedPortalUrls && selectedPortalUrls.length > 0) {
            targetPortalList = selectedPortalUrls;
        } else if (selectedPortalUrl === 'CUSTOM') {
            const trimmedCustom = customPortalUrl.trim();
            if (!trimmedCustom || !trimmedCustom.toLowerCase().includes('vtu.ac.in')) {
                setMessage('Please enter a valid results.vtu.ac.in URL for custom portal scan.');
                return;
            }
            targetPortalList = [trimmedCustom];
        } else if (selectedPortalUrl !== 'ALL') {
            targetPortalList = [selectedPortalUrl];
        }

        // BATCH SCRAPE MODE (2+ USNs)
        if (candidateUsns.length > 1) {
            stopScraping(true);
            setScraping(true);
            setScrapeProgress(`Queueing ${candidateUsns.length} students for VTU scraping...`);
            setMessage('');

            try {
                const res = await fetch('/api/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usns: candidateUsns,
                        role: 'faculty',
                        force: true,
                        faculty_id: faculty?.id,
                        target_urls: targetPortalList || undefined
                    }),
                });
                const json = await res.json();
                const queuedJobs = (json.jobs || []).filter(j => j.status === 'queued' && j.jobId);

                if (queuedJobs.length === 0) {
                    setMessage(json.message || 'All requested students are already cached or could not be queued.');
                    setScraping(false);
                    setScrapeProgress('');
                    await lookupStudent(candidateUsns.join(', '));
                    return;
                }

                const jobIds = queuedJobs.map(j => j.jobId);
                setScrapeProgress(`Queued ${jobIds.length} scrape job(s). Scanning portals in background...`);

                const startTime = Date.now();
                const pollInterval = setInterval(async () => {
                    try {
                        const statusRes = await fetch(`/api/scrape/status?jobIds=${jobIds.join(',')}`);
                        const statusJson = await statusRes.json();
                        if (statusJson.success && statusJson.data) {
                            const { allTerminal, completedCount, totalCount } = statusJson.data;
                            setScrapeProgress(`Scanning VTU portals: ${completedCount} of ${totalCount} students processed...`);

                            if (allTerminal || (Date.now() - startTime > 15 * 60 * 1000)) {
                                clearInterval(pollInterval);
                                stopScraping(true);
                                setMessage(`Batch scraping complete! (${completedCount}/${totalCount} students updated)`);
                                await lookupStudent(candidateUsns.join(', '), true);
                            }
                        }
                    } catch (pollErr) {
                        console.error('Batch status poll error:', pollErr);
                    }
                }, 3000);

            } catch (err) {
                console.error('Batch scrape error:', err);
                setMessage('Failed to queue batch scrape.');
                setScraping(false);
                setScrapeProgress('');
            }
            return;
        }

        // SINGLE SCRAPE MODE (1 USN)
        const targetUsn = candidateUsns[0];
        const usnCheck = validateUsn(targetUsn);
        if (!usnCheck.isValid) {
            const hint = usnCheck.suggestion ? ` Did you mean ${usnCheck.suggestion}?` : '';
            setMessage(`Cannot fetch VTU: ${usnCheck.error}${hint}`);
            return;
        }

        const cleanUSN = usnCheck.sanitized;
        const admissionYear = parseInt(cleanUSN.substring(3, 5), 10) || 22;
        const targetScheme = student?.scheme || (admissionYear >= 25 ? '2025' : '2022');
        const finalTargetUrl = targetPortalList ? targetPortalList.join(',') : null;

        stopScraping(true);
        setScraping(true);
        const portalLabel = targetPortalList && targetPortalList.length > 0
            ? `${targetPortalList.length} Targeted Portal${targetPortalList.length > 1 ? 's' : ''}`
            : `${targetScheme} Scheme`;

        setScrapeProgress(
            finalTargetUrl
                ? `Initializing targeted scan for ${cleanUSN} via ${portalLabel}...`
                : `Initializing ${targetScheme} Scheme deep scan for ${cleanUSN}...`
        );
        setMessage('');

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: cleanUSN,
                    role: 'faculty',
                    force: true,
                    faculty_id: faculty?.id,
                    scheme: targetScheme,
                    target_url: finalTargetUrl || undefined
                }),
            });
            const json = await res.json();

            if (json.status === 'cached' && !forceDeep && !finalTargetUrl) {
                setMessage('Results already present in database (Cache Hit).');
                setScraping(false);
                setScrapeProgress('');
                await lookupStudent(cleanUSN);
                return;
            }

            if (json.jobId || json.status === 'queued') {
                const jobId = json.jobId;
                const activeScheme = json.scheme || targetScheme;
                const queueMsg = finalTargetUrl
                    ? `Job ${jobId?.substring(0, 6)} queued. Scanning ${portalLabel} for ${cleanUSN} (estimated 3–5s)...`
                    : `Job ${jobId?.substring(0, 6)} queued. Scanning ${activeScheme} Scheme portals for ${cleanUSN}...`;
                setScrapeProgress(queueMsg);

                setScrapeJob({ id: jobId, usn: cleanUSN, startedAt: Date.now() });
            } else {
                setMessage(typeof json.error === 'object' ? (json.error.message || 'Unable to process.') : (json.error || 'Unable to process.'));
                setScraping(false);
                setScrapeProgress('');
            }
        } catch (err) {
            setMessage('Network error.');
            setScraping(false);
            setScrapeProgress('');
        }
    };



    const requestDeleteStudent = () => {
        if (!student) return;
        setConfirmingDeleteStudent(true);
    };

    const deleteStudent = async () => {
        if (!student) return;
        setConfirmingDeleteStudent(false);
        setLoading(true);
        setMessage('Deleting student data...');
        try {
            const res = await fetch('/api/admin/delete-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn: student.usn }),
            });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error(`Server returned HTML/Invalid JSON (Status: ${res.status}): ` + text.substring(0, 100));
            }

            if (json.success) {
                setMessage(json.message);
                setStudent(null);
                setMarks({});
                setUsn('');
                setServerBacklogs(null);
                setServerActiveBacklogsCount(null);
            } else {
                setMessage(`Error: ${json.error}`);
            }
        } catch (err) {
            console.error('Delete fetch error:', err);
            setMessage('Network/Parse Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePDF = async () => {
        if (!student) return;
        setPdfLoading(true);
        try {
            const { generateResultPDF } = await import('../../../lib/generatePDF');
            const semesters = Object.keys(marks).map(Number).filter(Boolean).sort((a, b) => a - b);
            const onlySemester = semesters.length === 1 ? semesters[0] : null;
            await generateResultPDF({
                studentName: student.name || student.usn,
                usn: student.usn,
                branch: student.branch || '',
                scheme: student.scheme || '2022',
                batch: student.batchLabel || student.batch || '',
                semesterMarks: marks,
                cgpa,
                isLateralEntry: Boolean(entry?.isLateral),
                // A single-semester record downloads as "6th Sem Result - <USN>.pdf";
                // a multi-semester one as "Consolidated Result - <USN>.pdf".
                fileName: resultFileName({
                    semester: onlySemester,
                    usn: student.usn,
                    suffix: onlySemester ? 'Result' : 'Consolidated Result'
                })
            });
        } catch (err) { setMessage('PDF Error: ' + err.message); console.error(err); } finally { setPdfLoading(false); }
    };

    const totalSubjects = Object.values(marks).flat().length;
    // Active Backlogs: prefer canonical activeBacklogSubjects computed server-side,
    // fallback to isFailedSubject() filter on marks
    const backlogs = serverBacklogs !== null
        ? serverBacklogs
        : Object.values(marks).flat().filter(m => isFailedSubject(m));
    const failCount = serverActiveBacklogsCount !== null
        ? serverActiveBacklogsCount
        : backlogs.length;
    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(b) - Number(a));


    return (
        <>
        <FacultyDashboardView
            backlogs={backlogs}
            backlogDialogRef={backlogDialogRef}
            backlogTriggerRef={backlogTriggerRef}
            cgpa={cgpa}
            closeBacklogModal={closeBacklogModal}
            deleteStudent={requestDeleteStudent}
            entry={entry}
            lookupIssue={lookupIssue}
            failCount={failCount}
            fetchFromVTU={fetchFromVTU}
            handlePDF={handlePDF}
            loading={loading}
            lookupStudent={lookupStudent}
            marks={marks}
            message={message}
            pdfLoading={pdfLoading}
            scraping={scraping}
            scrapeProgress={scrapeProgress}
            semStats={semStats}
            setMessage={setMessage}
            setShowBacklogModal={() => setShowBacklogModal(true)}
            setUsn={setUsn}
            sgpas={sgpas}
            showBacklogModal={showBacklogModal}
            sortedSemesters={sortedSemesters}
            stopScraping={stopScraping}
            student={student}
            totalSubjects={totalSubjects}
            usn={usn}
            assignedSubjects={assignedSubjects}
            assignedLoading={assignedLoading}
            assignedClasses={assignedClasses}
            availablePortals={availablePortals}
            selectedPortalUrl={selectedPortalUrl}
            setSelectedPortalUrl={setSelectedPortalUrl}
            selectedPortalUrls={selectedPortalUrls}
            setSelectedPortalUrls={setSelectedPortalUrls}
            batchResults={batchResults}
            setBatchResults={setBatchResults}
            inspectedStudent={inspectedStudent}
            setInspectedStudent={setInspectedStudent}
            customPortalUrl={customPortalUrl}
            setCustomPortalUrl={setCustomPortalUrl}
            addSubjectOpen={addSubjectOpen}
            setAddSubjectOpen={setAddSubjectOpen}
            addSubjectForm={addSubjectForm}
            setAddSubjectForm={setAddSubjectForm}
            subjectOptions={subjectOptions}
            subjectOptionsLoading={subjectOptionsLoading}
            addSubjectSaving={addSubjectSaving}
            addSubjectError={addSubjectError}
            handleAddSubject={handleAddSubject}
            handleRemoveAssignment={handleRemoveAssignment}
            removingAssignmentId={removingAssignmentId}
            setAssignmentToConfirmRemove={setAssignmentToConfirmRemove}
            loadAssignments={loadAssignments}
            assignmentSyncMsg={assignmentSyncMsg}
            facultyId={faculty?.id}
            refreshPortals={refreshPortals}
        />
        <ConfirmDialog
            open={Boolean(assignmentToConfirmRemove)}
            title="Remove Subject from Teaching Load?"
            description={`Are you sure you want to remove ${assignmentToConfirmRemove?.subject_code || ''}${assignmentToConfirmRemove?.subject_catalog?.subject_name ? ` (${assignmentToConfirmRemove.subject_catalog.subject_name})` : ''} from your active teaching load? This unassigns the course from your personal roster, but will NOT delete any student marks, grades, or curriculum catalog records.`}
            confirmLabel="Remove from Load"
            busy={removingAssignmentId === assignmentToConfirmRemove?.id}
            onCancel={() => setAssignmentToConfirmRemove(null)}
            onConfirm={async () => {
                if (!assignmentToConfirmRemove) return;
                const targetId = assignmentToConfirmRemove.id;
                setAssignmentToConfirmRemove(null);
                await handleRemoveAssignment(targetId);
            }}
        />
        <ConfirmDialog
            open={confirmingDeleteStudent}
            title="Delete this student?"
            description={`This will permanently delete ALL data for ${student?.name || student?.usn}. This cannot be undone.`}
            busy={loading}
            onCancel={() => setConfirmingDeleteStudent(false)}
            onConfirm={deleteStudent}
        />
        </>
    );
}
export default function FacultyDashboard() {
    return (
        <AuthGuard role="faculty">
            <FacultyDashboardContent />
        </AuthGuard>
    );
}
