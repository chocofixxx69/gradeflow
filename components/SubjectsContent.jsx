'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../lib/api/client';
import { logAuditAction } from '../lib/audit-logger';
import { supabase } from '../lib/supabase';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { getXLSX } from '@/lib/lazy-export-libs';
import { matchesGeneric } from '@/lib/search-utils';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Input, Button, Select, Badge, IconButton } from '@/components/ui/Foundation';
import { TableWrapper, Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { writeWorkbook } from '../lib/workbook-export';

// ── Branch & Scheme Definitions (single source of truth) ──
const SCHEMES = ['2022', '2025'];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const PIE_COLORS = ['#174B4D', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316'];

// Helper to determine subject course type for visual taxonomy
function getCourseTag(credits, code = '', name = '') {
  const cr = Number(credits) || 0;
  const upperCode = (code || '').toUpperCase();
  const upperName = (name || '').toUpperCase();

  if (upperCode.includes('L') || upperName.includes('LAB') || upperName.includes('PRACTICAL') || cr === 1) {
    return { label: 'Practical / Lab', tone: 'success', bg: 'rgba(22, 101, 52, 0.1)', color: '#166534', icon: 'science' };
  }
  if (cr >= 4) {
    return { label: 'Core Theory', tone: 'primary', bg: 'rgba(23, 75, 77, 0.1)', color: 'var(--primary, #174B4D)', icon: 'menu_book' };
  }
  if (
    upperCode.endsWith('A') || upperCode.endsWith('B') || upperCode.endsWith('C') || upperCode.endsWith('D') ||
    upperName.includes('ELECTIVE') || upperCode.includes('PE') || upperCode.includes('OE')
  ) {
    return { label: 'Elective', tone: 'warning', bg: 'rgba(180, 83, 9, 0.1)', color: '#b45309', icon: 'alt_route' };
  }
  if (cr === 2) {
    return { label: 'AEC / Skill', tone: 'neutral', bg: 'rgba(120, 147, 151, 0.15)', color: '#3A6A6D', icon: 'psychology' };
  }
  return { label: 'Theory', tone: 'neutral', bg: 'rgba(23, 75, 77, 0.08)', color: 'var(--primary, #174B4D)', icon: 'description' };
}

// Format singular/plural credits
function formatCredits(cr) {
  const n = Number(cr) || 0;
  return `${n} ${n === 1 ? 'Credit' : 'Credits'}`;
}

// ── Styles ──
const S = {
  page: { padding: 'var(--page-py, 24px) var(--page-px, 24px)', maxWidth: '1280px', margin: '0 auto' },
  label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2, 6px)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5, 20px)' },
  mbox: { background: 'var(--bg, #FFFFFF)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7, 16px)', width: '100%', maxWidth: '520px', padding: 'var(--space-8, 28px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5, 18px)', maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' },
  statCard: { background: 'var(--surface, #FFFFFF)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6, 12px)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' },
};

export function SubjectsContent() {
  const [scheme, setScheme] = useState('2022');
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('CS');
  const [filterSem, setFilterSem] = useState('all');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', credits: 3, semester: 1 });
  const [branchData, setBranchData] = useState({ code: '', label: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkError, setBulkError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'charts'
  const [searchQuery, setSearchQuery] = useState('');

  // Enhanced UX States:
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [collapsedSems, setCollapsedSems] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await apiRequest('/api/system/meta').catch(() => null);
      const branchList = data?.branches || [];
      setBranches(branchList);
      if (branchList.length && !branch) setBranch(branchList[0].code);
    } catch (e) {
      console.error('Error fetching branches:', e);
    }
  }, [branch]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const [refreshBanner, setRefreshBanner] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSubjects = useCallback(async (isManual = false) => {
    if (!branch) return;
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    setError('');
    const prevCount = subjects.length;
    try {
      const { data: catData, error: catErr } = await supabase
        .from('subject_catalog')
        .select('*')
        .eq('scheme', scheme)
        .eq('branch', branch)
        .order('semester', { ascending: true })
        .order('subject_code', { ascending: true });

      if (catErr) throw catErr;
      const newSubjects = catData || [];
      setSubjects(newSubjects);

      if (isManual) {
        const diff = newSubjects.length - prevCount;
        if (diff > 0) {
          setRefreshBanner({
            type: 'new',
            text: `✓ Catalog updated: +${diff} new subjects detected!`
          });
        } else {
          setRefreshBanner({
            type: 'current',
            text: `✓ Subject catalog is current: All ${newSubjects.length} courses synchronized.`
          });
        }
        setTimeout(() => setRefreshBanner(null), 4500);
      }
    } catch (err) {
      setError(err.message);
      console.error('Subjects fetch error:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [scheme, branch, subjects.length]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // ── Derived Data ──
  const filtered = useMemo(() => {
    return subjects.filter(s => {
      const matchSem = filterSem === 'all' || String(s.semester) === String(filterSem);
      const matchSearch = matchesGeneric(s, searchQuery, ['subject_name', 'subject_code']);
      return matchSem && matchSearch;
    });
  }, [subjects, filterSem, searchQuery]);

  const bySemseter = useMemo(() => {
    return SEMESTERS.reduce((acc, sem) => {
      acc[sem] = subjects.filter(s => s.semester === sem);
      return acc;
    }, {});
  }, [subjects]);

  const totalCredits = useMemo(() => {
    return subjects.reduce((s, sub) => s + (Number(sub.credits) || 0), 0);
  }, [subjects]);

  const semCount = useMemo(() => {
    return new Set(subjects.map(s => s.semester)).size;
  }, [subjects]);

  // Chart data
  const creditsBySem = useMemo(() => {
    return SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => ({
      name: `Sem ${sem}`,
      value: bySemseter[sem].reduce((s, sub) => s + (Number(sub.credits) || 0), 0),
      count: bySemseter[sem].length,
    }));
  }, [bySemseter]);

  // ── Handlers ──
  const openAdd = () => {
    setEditing(null);
    setFormData({
      name: '',
      code: '',
      credits: 3,
      semester: filterSem === 'all' ? 1 : Number(filterSem)
    });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setFormData({
      name: s.subject_name,
      code: s.subject_code,
      credits: s.credits,
      semester: s.semester
    });
    setShowForm(true);
  };

  const openDuplicate = (s) => {
    setEditing(null);
    setFormData({
      name: `${s.subject_name} (Variant)`,
      code: `${s.subject_code}_V2`,
      credits: s.credits,
      semester: s.semester
    });
    setShowForm(true);
  };

  const handleDeleteClick = (s) => {
    setDeleteTarget(s);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const target = deleteTarget;
    const prevSubjects = [...subjects];

    // Optimistic delete
    setSubjects(prev => prev.filter(s => s.id !== target.id));

    try {
      const res = await apiRequest(`/api/subjects?id=${target.id}`, {
        method: 'DELETE'
      });

      if (res?.error) throw new Error(res.error);

      logAuditAction({
        action_type: 'DELETE_SUBJECT',
        entity_type: 'subject_catalog',
        entity_id: target.id,
        old_values: {
          subject_name: target.subject_name,
          subject_code: target.subject_code,
          credits: target.credits,
          semester: target.semester
        }
      }).catch(() => null);

      setDeleteTarget(null);
      fetchSubjects();
    } catch (err) {
      console.error('Delete subject error:', err);
      setSubjects(prevSubjects);
      alert('Failed to delete subject: ' + err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.code?.trim()) return alert('Name and Code are required.');
    if (Number(formData.credits) < 0) return alert('Credits must be a positive number.');

    const cleanCode = formData.code.trim().toUpperCase();
    const cleanName = formData.name.trim();
    const cleanCredits = Number(formData.credits);
    const cleanSemester = Number(formData.semester);

    const payload = {
      subject_name: cleanName,
      subject_code: cleanCode,
      credits: cleanCredits,
      semester: cleanSemester,
      scheme,
      branch,
    };

    // 1. Instant Optimistic UI Update
    const prevSubjects = [...subjects];
    const editingTarget = editing;

    if (editingTarget) {
      setSubjects(prev => prev.map(s => s.id === editingTarget.id ? { ...s, ...payload } : s));
    } else {
      const tempId = 'temp_' + Date.now();
      setSubjects(prev => [...prev, { id: tempId, ...payload }]);
    }

    setShowForm(false);

    // 2. Background persistence & DB synchronization
    try {
      if (editingTarget) {
        apiRequest('/api/subjects', {
          method: 'PUT',
          body: JSON.stringify({ id: editingTarget.id, ...payload })
        })
          .then(() => fetchSubjects())
          .catch(err => {
            console.error('Subject update error:', err);
            setSubjects(prevSubjects);
            alert('Failed to save subject: ' + err.message);
          });

        logAuditAction({
          action_type: 'EDIT_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: editingTarget.id,
          old_values: {
            subject_name: editingTarget.subject_name,
            subject_code: editingTarget.subject_code,
            credits: editingTarget.credits,
            semester: editingTarget.semester
          },
          new_values: payload
        }).catch(() => null);
      } else {
        const created = await apiRequest('/api/subjects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (created?.subject?.id) {
          setSubjects(prev => prev.map(s => String(s.id).startsWith('temp_') ? created.subject : s));
        }
        fetchSubjects();
        logAuditAction({
          action_type: 'ADD_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: created?.id || 'NEW',
          new_values: payload
        }).catch(() => null);
      }
    } catch (err) {
      setSubjects(prevSubjects);
      alert(err.message);
    }
  };

  const handleBranchSave = async () => {
    if (!branchData.code?.trim() || !branchData.label?.trim()) return alert('Code and Label are required.');
    const newBranch = {
      code: branchData.code.trim().toUpperCase(),
      label: branchData.label.trim(),
      name: branchData.label.trim()
    };

    setBranches(prev => [...prev.filter(b => b.code !== newBranch.code), newBranch]);
    setBranch(newBranch.code);
    setShowBranchForm(false);
    setBranchData({ code: '', label: '' });

    try {
      await apiRequest('/api/system/meta', {
        method: 'POST',
        body: JSON.stringify({
          code: newBranch.code,
          label: newBranch.label
        })
      }).catch(() => null);
      fetchBranches();
    } catch (err) {
      console.error('Add branch error:', err);
    }
  };

  // ── Bulk Add ──
  const parseBulkText = (text) => {
    const rows = [];
    const errors = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 4) { errors.push(`Line ${i + 1}: expected code,name,credits,semester`); return; }
      const [code, name, credits, semester] = parts;
      if (/^code$/i.test(code) && /^name$/i.test(name)) return;
      if (!code || !name) { errors.push(`Line ${i + 1}: code and name are required`); return; }
      const cr = Number(credits), sem = Number(semester);
      if (!Number.isFinite(cr) || cr < 0) { errors.push(`Line ${i + 1}: invalid credits "${credits}"`); return; }
      if (!Number.isFinite(sem) || sem < 1 || sem > 8) { errors.push(`Line ${i + 1}: invalid semester "${semester}"`); return; }
      rows.push({ code: code.toUpperCase(), name, credits: cr, semester: sem });
    });
    return { rows, errors };
  };

  const handleBulkTextChange = (text) => {
    setBulkText(text);
    if (!text.trim()) { setBulkRows([]); setBulkError(''); return; }
    const { rows, errors } = parseBulkText(text);
    setBulkRows(rows);
    setBulkError(errors.length ? errors.slice(0, 5).join(' • ') + (errors.length > 5 ? ` • +${errors.length - 5} more` : '') : '');
  };

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await getXLSX();
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const text = aoa.map(row => row.join(',')).join('\n');
        handleBulkTextChange(text);
      } catch (err) {
        setBulkError('Could not read file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return alert('No valid rows to import.');
    setSaving(true);
    try {
      const payload = bulkRows.map(r => ({
        subject_code: r.code,
        subject_name: r.name,
        credits: r.credits,
        semester: r.semester,
        scheme,
        branch,
      }));
      const { error } = await supabase
        .from('subject_catalog')
        .upsert(payload, { onConflict: 'scheme,branch,semester,subject_code' });
      if (error) throw error;
      await logAuditAction({
        action_type: 'BULK_ADD_SUBJECTS',
        entity_type: 'subject_catalog',
        entity_id: `${scheme}_${branch}`,
        new_values: { count: payload.length, scheme, branch },
      });
      fetchSubjects();
      setShowBulkForm(false);
      setBulkText('');
      setBulkRows([]);
      setBulkError('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Excel Export ──
  const exportToExcel = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();

    const summaryRows = [
      ['GradeFlow - Subject Catalog Export'],
      [`Scheme: ${scheme}  |  Branch: ${branch}`],
      [`Total Subjects: ${subjects.length}  |  Total Credits: ${totalCredits}`],
      [],
      ['Semester', 'Subject Count', 'Total Credits'],
      ...SEMESTERS.filter(s => bySemseter[s]?.length > 0).map(s => [
        `Semester ${s}`,
        bySemseter[s].length,
        bySemseter[s].reduce((acc, sub) => acc + (Number(sub.credits) || 0), 0)
      ])
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    SEMESTERS.forEach(sem => {
      const subs = bySemseter[sem];
      if (!subs?.length) return;
      const branchLabel = branches.find(b => b.code === branch)?.label || branch;
      const rows = [
        [`Semester ${sem} - ${branchLabel} | ${scheme} Scheme`],
        ['Subject Code', 'Subject Name', 'Credits'],
        ...subs.map(s => [s.subject_code, s.subject_name, s.credits]),
        [],
        ['Total Credits', '', subs.reduce((acc, s) => acc + (Number(s.credits) || 0), 0)]
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, `Sem ${sem}`);
    });

    const allRows = [
      ['Subject Code', 'Subject Name', 'Credits', 'Semester', 'Scheme', 'Branch'],
      ...subjects.map(s => [s.subject_code, s.subject_name, s.credits, s.semester, s.scheme, s.branch])
    ];
    const allWs = XLSX.utils.aoa_to_sheet(allRows);
    allWs['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, allWs, 'All Subjects');

    writeWorkbook(XLSX, wb, `GradeFlow_Subjects_${scheme}_${branch}.xlsx`);
  };

  const displayedBranchLabel = branches.find(b => b.code === branch)?.label || branch;

  // Toggle semester accordion
  const toggleSemester = (sem) => {
    setCollapsedSems(prev => ({ ...prev, [sem]: !prev[sem] }));
  };

  const areAllCollapsed = SEMESTERS.every(s => collapsedSems[s]);
  const toggleCollapseAll = () => {
    if (areAllCollapsed) {
      setCollapsedSems({});
    } else {
      const all = {};
      SEMESTERS.forEach(s => { all[s] = true; });
      setCollapsedSems(all);
    }
  };

  return (
    <div style={S.page}>
      {/* ── Page Header & Top Operations ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <PageHeader>
          <PageHeaderTitle>Subject Library</PageHeaderTitle>
          <PageHeaderSubtitle>
            Manage academic subjects, credit allocations, and curriculum branches. Credits dynamically synchronize with SGPA/CGPA calculations.
          </PageHeaderSubtitle>
        </PageHeader>

        {/* Grouped Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            onClick={() => { fetchBranches(); fetchSubjects(true); }}
            variant="ghost"
            size="sm"
            disabled={loading || isRefreshing}
            title="Refresh database catalog"
          >
            <span
              className="material-icons-round"
              style={{
                fontSize: '18px',
                marginRight: '6px',
                display: 'inline-block',
                animation: (loading || isRefreshing) ? 'spin 1s linear infinite' : 'none'
              }}
            >
              refresh
            </span>
            {(loading || isRefreshing) ? 'Syncing...' : 'Refresh'}
          </Button>

          <Button onClick={exportToExcel} variant="ghost" size="sm">
            <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>download</span>
            Export Excel
          </Button>

          <Button onClick={() => setShowBulkForm(true)} variant="ghost" size="sm">
            <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>upload_file</span>
            Bulk Add
          </Button>

          <Button onClick={openAdd} variant="primary">
            <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>add</span>
            Add Subject
          </Button>
        </div>
      </div>

      {/* ── Dynamic Refresh / Info Banner ── */}
      {refreshBanner && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            background: refreshBanner.type === 'new' ? 'var(--success-bg, #E8F5E9)' : 'var(--surface-low, #FDF6ED)',
            color: refreshBanner.type === 'new' ? 'var(--success, #166534)' : 'var(--tx-main)',
            border: `1px solid ${refreshBanner.type === 'new' ? 'var(--success-border, #A5D6A7)' : 'var(--border)'}`,
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '18px' }}>
            {refreshBanner.type === 'new' ? 'check_circle' : 'verified'}
          </span>
          {refreshBanner.text}
        </div>
      )}

      {/* Error alert */}
      {error && subjects.length === 0 && (
        <div style={{ background: 'var(--red-bg, #FFEBEE)', border: '1px solid var(--red, #B91C1C)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: 'var(--red, #B91C1C)', fontSize: '13px', fontWeight: 700 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── KPI Stat Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={S.statCard}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(23, 75, 77, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <span className="material-icons-round" style={{ fontSize: '22px' }}>auto_stories</span>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Subjects</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', lineHeight: 1.1 }}>{subjects.length}</div>
          </div>
        </div>

        <div style={S.statCard}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(180, 83, 9, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
            <span className="material-icons-round" style={{ fontSize: '22px' }}>stars</span>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Credits</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', lineHeight: 1.1 }}>{totalCredits}</div>
          </div>
        </div>

        <div style={S.statCard}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(22, 101, 52, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534' }}>
            <span className="material-icons-round" style={{ fontSize: '22px' }}>layers</span>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Semesters</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', lineHeight: 1.1 }}>{semCount} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-muted)' }}>/ 8</span></div>
          </div>
        </div>

        <div style={{ ...S.statCard, borderColor: (filtered.length !== subjects.length || searchQuery) ? 'var(--primary)' : 'var(--border)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(58, 106, 109, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary, #3A6A6D)' }}>
            <span className="material-icons-round" style={{ fontSize: '22px' }}>filter_alt</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filtered Matches</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: (filtered.length !== subjects.length || searchQuery) ? 'var(--primary)' : 'var(--tx-main)', lineHeight: 1.1 }}>
                {filtered.length}
              </div>
              {(filtered.length !== subjects.length || searchQuery) && (
                <button
                  onClick={() => { setFilterSem('all'); setSearchQuery(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar & Search ── */}
      <div
        style={{
          background: 'var(--surface, #FFFFFF)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-6, 12px)',
          padding: '16px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
          <div>
            <Select
              label="Scheme"
              value={scheme}
              onChange={e => setScheme(e.target.value)}
              options={SCHEMES.map(s => ({ value: s, label: `${s} Scheme` }))}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2, 6px)' }}>
              <label style={{ ...S.label, marginBottom: 0 }}>Branch</label>
              <button
                type="button"
                onClick={() => setShowBranchForm(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: 0
                }}
                title="Create a new academic branch"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span>
                New Branch
              </button>
            </div>
            <Select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              options={branches.map(b => ({ value: b.code, label: `${b.code} - ${b.name || b.label}` }))}
            />
          </div>

          <div>
            <Select
              label="Semester Filter"
              value={filterSem}
              onChange={e => setFilterSem(e.target.value)}
              options={[{ value: 'all', label: 'All Semesters (1–8)' }, ...SEMESTERS.map(s => ({ value: String(s), label: `Semester ${s} (${bySemseter[s]?.length || 0} subjects)` }))]}
            />
          </div>

          <div>
            <div style={{ position: 'relative' }}>
              <Input
                label="Search Subjects"
                placeholder="Search subject or code (e.g. BCS301)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    bottom: '9px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--tx-muted)',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                  title="Clear search"
                >
                  <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Semester Quick Jump Navigation & View Toggle ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {/* Semester Jump Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '4px', maxWidth: '100%' }}>
          <button
            type="button"
            onClick={() => setFilterSem('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: filterSem === 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: filterSem === 'all' ? 'var(--primary)' : 'var(--surface, #FFFFFF)',
              color: filterSem === 'all' ? '#FFFFFF' : 'var(--tx-muted)',
              transition: 'all 0.15s ease'
            }}
          >
            All ({subjects.length})
          </button>
          {SEMESTERS.map(sem => {
            const count = bySemseter[sem]?.length || 0;
            const isSelected = String(filterSem) === String(sem);
            return (
              <button
                key={sem}
                type="button"
                onClick={() => setFilterSem(isSelected ? 'all' : String(sem))}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--primary)' : count > 0 ? 'var(--surface, #FFFFFF)' : 'rgba(0,0,0,0.02)',
                  color: isSelected ? '#FFFFFF' : count > 0 ? 'var(--tx-main)' : 'var(--tx-muted)',
                  opacity: count === 0 && !isSelected ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                Sem {sem} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* View Mode & Secondary View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* List vs Analytics tab */}
          <div style={{ display: 'inline-flex', background: 'var(--surface-low, #FDF6ED)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === 'list' ? 'var(--surface, #FFFFFF)' : 'transparent',
                color: activeTab === 'list' ? 'var(--primary)' : 'var(--tx-muted)',
                boxShadow: activeTab === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>view_module</span>
              Catalog
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('charts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === 'charts' ? 'var(--surface, #FFFFFF)' : 'transparent',
                color: activeTab === 'charts' ? 'var(--primary)' : 'var(--tx-muted)',
                boxShadow: activeTab === 'charts' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>pie_chart</span>
              Analytics
            </button>
          </div>

          {/* Grid vs Table View Switcher (only in catalog view) */}
          {activeTab === 'list' && (
            <div style={{ display: 'inline-flex', background: 'var(--surface-low, #FDF6ED)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Cards Grid View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'grid' ? 'var(--surface, #FFFFFF)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--primary)' : 'var(--tx-muted)',
                  boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '18px' }}>grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Dense Table View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'table' ? 'var(--surface, #FFFFFF)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--primary)' : 'var(--tx-muted)',
                  boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '18px' }}>table_rows</span>
              </button>
            </div>
          )}

          {/* Expand/Collapse All toggle when viewing all semesters */}
          {activeTab === 'list' && filterSem === 'all' && (
            <button
              type="button"
              onClick={toggleCollapseAll}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--tx-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={areAllCollapsed ? 'Expand all semesters' : 'Collapse all semesters'}
            >
              <span className="material-icons-round" style={{ fontSize: '16px' }}>
                {areAllCollapsed ? 'unfold_more' : 'unfold_less'}
              </span>
              {areAllCollapsed ? 'Expand All' : 'Collapse All'}
            </button>
          )}
        </div>
      </div>

      {/* ── Main Catalog Tab ── */}
      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {SEMESTERS.map(sem => {
            const semSubs = bySemseter[sem].filter(s =>
              matchesGeneric(s, searchQuery, ['subject_name', 'subject_code'])
            );

            if (filterSem !== 'all' && String(sem) !== String(filterSem)) return null;
            if (semSubs.length === 0 && filterSem === 'all' && !searchQuery) return null;

            const semCredits = semSubs.reduce((acc, s) => acc + (Number(s.credits) || 0), 0);
            const isCollapsed = collapsedSems[sem] && filterSem === 'all';

            return (
              <div
                key={sem}
                id={`sem-section-${sem}`}
                style={{
                  background: 'var(--surface, #FFFFFF)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-6, 12px)',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                {/* Semester Accordion Header */}
                <div
                  onClick={() => filterSem === 'all' && toggleSemester(sem)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: 'var(--surface-low, #FDF6ED)',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                    cursor: filterSem === 'all' ? 'pointer' : 'default',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        background: 'var(--primary)',
                        color: '#FFFFFF',
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '14px'
                      }}
                    >
                      {sem}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--tx-main)' }}>
                        Semester {sem} Subjects
                      </h3>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--tx-muted)',
                        fontWeight: 700,
                        background: 'var(--surface, #FFFFFF)',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {semSubs.length} Subjects • {semCredits} Credits
                    </span>

                    {filterSem === 'all' && (
                      <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-muted)', transition: 'transform 0.2s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        expand_more
                      </span>
                    )}
                  </div>
                </div>

                {/* Semester Content (Cards or Table) */}
                {!isCollapsed && (
                  <div style={{ padding: '18px' }}>
                    {semSubs.length === 0 ? (
                      <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px', color: 'var(--tx-muted)', fontSize: '13px' }}>
                        No subjects {searchQuery ? 'matching search query' : 'defined'} for Semester {sem}.
                      </div>
                    ) : viewMode === 'grid' ? (
                      /* ── Grid View ── */
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
                        {semSubs.map(s => {
                          const tag = getCourseTag(s.credits, s.subject_code, s.subject_name);
                          return (
                            <Card
                              key={s.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                border: '1px solid var(--border)',
                                borderRadius: '10px'
                              }}
                            >
                              <CardContent style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
                                {/* Top Badges & Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        color: 'var(--primary)',
                                        background: 'var(--surface-low, #FDF6ED)',
                                        border: '1px solid var(--border)',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontFamily: 'monospace',
                                        letterSpacing: '0.04em'
                                      }}
                                    >
                                      {s.subject_code}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: tag.color,
                                        background: tag.bg,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                    >
                                      <span className="material-icons-round" style={{ fontSize: '13px' }}>{tag.icon}</span>
                                      {tag.label}
                                    </span>
                                  </div>

                                  {/* Quick Actions */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <button
                                      type="button"
                                      onClick={() => openDuplicate(s)}
                                      style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                      title="Duplicate subject as variant"
                                    >
                                      <span className="material-icons-round" style={{ fontSize: '17px' }}>content_copy</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(s)}
                                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                      title="Edit subject"
                                    >
                                      <span className="material-icons-round" style={{ fontSize: '17px' }}>edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteClick(s)}
                                      style={{ background: 'none', border: 'none', color: 'var(--destructive, #B91C1C)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                      title="Delete subject"
                                    >
                                      <span className="material-icons-round" style={{ fontSize: '17px' }}>delete_outline</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Subject Name with Min Height for Equal Rhythm */}
                                <div style={{ flex: 1, minHeight: '44px' }}>
                                  <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, lineHeight: 1.4, color: 'var(--tx-main)' }}>
                                    {s.subject_name}
                                  </h4>
                                </div>

                                {/* Footer info */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingTop: '10px',
                                    borderTop: '1px solid var(--border-low, #EAEAEA)',
                                    fontSize: '12px',
                                    color: 'var(--tx-muted)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '15px', color: '#b45309' }}>star</span>
                                    {formatCredits(s.credits)}
                                  </div>
                                  <div style={{ fontSize: '11px', fontWeight: 600 }}>
                                    Sem {s.semester}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      /* ── Table View ── */
                      <TableWrapper>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableHeader style={{ width: '130px' }}>Code</TableHeader>
                              <TableHeader>Subject Name</TableHeader>
                              <TableHeader style={{ width: '110px' }}>Semester</TableHeader>
                              <TableHeader style={{ width: '140px' }}>Category</TableHeader>
                              <TableHeader style={{ width: '110px' }}>Credits</TableHeader>
                              <TableHeader align="right" style={{ width: '110px' }}>Actions</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {semSubs.map(s => {
                              const tag = getCourseTag(s.credits, s.subject_code, s.subject_name);
                              return (
                                <TableRow key={s.id}>
                                  <TableCell>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        color: 'var(--primary)',
                                        background: 'var(--surface-low, #FDF6ED)',
                                        border: '1px solid var(--border)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontFamily: 'monospace'
                                      }}
                                    >
                                      {s.subject_code}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div style={{ fontWeight: 600, color: 'var(--tx-main)', fontSize: '13px' }}>
                                      {s.subject_name}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                      Sem {s.semester}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: tag.color,
                                        background: tag.bg,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                    >
                                      <span className="material-icons-round" style={{ fontSize: '13px' }}>{tag.icon}</span>
                                      {tag.label}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--tx-main)' }}>
                                      {formatCredits(s.credits)}
                                    </span>
                                  </TableCell>
                                  <TableCell align="right">
                                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        onClick={() => openDuplicate(s)}
                                        style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                        title="Duplicate"
                                      >
                                        <span className="material-icons-round" style={{ fontSize: '17px' }}>content_copy</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openEdit(s)}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                        title="Edit"
                                      >
                                        <span className="material-icons-round" style={{ fontSize: '17px' }}>edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteClick(s)}
                                        style={{ background: 'none', border: 'none', color: 'var(--destructive, #B91C1C)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                        title="Delete"
                                      >
                                        <span className="material-icons-round" style={{ fontSize: '17px' }}>delete_outline</span>
                                      </button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableWrapper>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Global Empty State */}
          {subjects.length === 0 && !loading && (
            <div style={{ padding: '70px 20px', textAlign: 'center', background: 'var(--surface-low, #FDF6ED)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
              <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--tx-dim)', marginBottom: '14px' }}>find_in_page</span>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--tx-main)' }}>No Subjects Found</h3>
              <p style={{ color: 'var(--tx-muted)', fontSize: '13px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
                No subjects registered for <strong>{scheme} Scheme</strong> in <strong>{displayedBranchLabel}</strong>.
              </p>
              <Button onClick={openAdd} variant="primary" size="sm">
                <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>add</span>
                Add First Subject
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Analytics Tab ── */}
      {activeTab === 'charts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px' }}>
          <Card>
            <CardContent style={{ padding: '24px' }}>
              <div style={S.label}>Credits Distribution by Semester</div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={creditsBySem} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={2}>
                    {creditsBySem.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent style={{ padding: '24px' }}>
              <div style={S.label}>Curriculum Credit Weightage</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                {creditsBySem.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-low, #EAEAEA)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-main)' }}>{c.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>({c.count} subjects)</span>
                    </div>
                    <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '13px' }}>{formatCredits(c.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Subject Form Modal (Add / Edit / Duplicate) ── */}
      {showForm && (
        <div style={S.modal}>
          <div style={S.mbox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--tx-main)' }}>
                {editing ? 'Edit Subject' : 'Add Academic Subject'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <div>
              <Input
                label="Subject Code"
                placeholder="e.g. BCS301"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
            </div>

            <div>
              <Input
                label="Subject Name"
                placeholder="e.g. Mathematics for Computer Science"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '14px' }}>
              <div>
                <Input
                  label="Credits"
                  type="number"
                  min="0"
                  max="12"
                  value={formData.credits}
                  onChange={e => setFormData({ ...formData, credits: e.target.value })}
                />
              </div>
              <div>
                <Select
                  label="Semester"
                  value={formData.semester}
                  onChange={e => setFormData({ ...formData, semester: e.target.value })}
                  options={SEMESTERS.map(s => ({ value: s, label: `Semester ${s}` }))}
                />
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', background: 'var(--surface-low, #FDF6ED)', padding: '10px 12px', borderRadius: '8px' }}>
              Saving to <strong>{scheme} Scheme</strong> • <strong>{displayedBranchLabel}</strong>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <Button onClick={() => setShowForm(false)} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving...' : editing ? 'Update Subject' : 'Create Subject'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Branch Form Modal ── */}
      {showBranchForm && (
        <div style={S.modal}>
          <div style={S.mbox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--tx-main)' }}>
                Add Academic Branch
              </h2>
              <button
                type="button"
                onClick={() => setShowBranchForm(false)}
                style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--tx-muted)', margin: 0 }}>
              Create a new department or engineering discipline code in the institutional metadata.
            </p>

            <div>
              <Input
                label="Branch Code"
                placeholder="e.g. AI or CD"
                value={branchData.code}
                onChange={e => setBranchData({ ...branchData, code: e.target.value.toUpperCase() })}
              />
            </div>

            <div>
              <Input
                label="Branch Full Name"
                placeholder="e.g. Artificial Intelligence & Data Science"
                value={branchData.label}
                onChange={e => setBranchData({ ...branchData, label: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <Button onClick={() => setShowBranchForm(false)} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </Button>
              <Button onClick={handleBranchSave} disabled={saving} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Adding...' : 'Save Branch'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Add Modal ── */}
      {showBulkForm && (
        <div style={S.modal}>
          <div style={{ ...S.mbox, maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--tx-main)' }}>
                Bulk Import Subjects
              </h2>
              <button
                type="button"
                onClick={() => { setShowBulkForm(false); setBulkText(''); setBulkRows([]); setBulkError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--tx-muted)', margin: 0 }}>
              Importing courses for <strong>{scheme} Scheme / {displayedBranchLabel}</strong>. Upload a spreadsheet or paste CSV rows with format: <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 4px', borderRadius: '4px' }}>code, name, credits, semester</code>.
            </p>

            <div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                label="Upload Spreadsheet (.xlsx, .csv)"
                onChange={handleBulkFile}
              />
            </div>

            <div>
              <label style={S.label}>Or Paste Text Directly</label>
              <textarea
                value={bulkText}
                onChange={e => handleBulkTextChange(e.target.value)}
                placeholder={'BCS301, Mathematics for Computer Science, 4, 3\nBCS302, Digital Design & Computer Organization, 4, 3'}
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--surface-low, #FDF6ED)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--tx-main)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            {bulkError && (
              <div style={{ background: 'var(--red-bg, #FFEBEE)', border: '1px solid var(--red, #B91C1C)', borderRadius: '8px', padding: '8px 12px', color: 'var(--red, #B91C1C)', fontSize: '12px', fontWeight: 600 }}>
                ⚠ {bulkError}
              </div>
            )}

            {bulkRows.length > 0 && (
              <div style={{ fontSize: '13px', color: 'var(--success, #166534)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                {bulkRows.length} subject{bulkRows.length === 1 ? '' : 's'} parsed and verified for import
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <Button onClick={() => { setShowBulkForm(false); setBulkText(''); setBulkRows([]); setBulkError(''); }} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </Button>
              <Button onClick={handleBulkSave} disabled={saving || !bulkRows.length} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Importing...' : `Import ${bulkRows.length || ''} Subject${bulkRows.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Safe Deletion Confirm Dialog ── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Academic Subject"
        description={`Are you sure you want to delete ${deleteTarget?.subject_code} (${deleteTarget?.subject_name}) from the ${scheme} scheme catalog? This action cannot be undone.`}
        confirmLabel="Delete Subject"
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />
    </div>
  );
}
