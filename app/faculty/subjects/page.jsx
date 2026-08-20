'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../lib/api/client';
import { logAuditAction } from '../../../lib/audit-logger';
import AuthGuard from '../../../components/AuthGuard';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Input, Button } from '@/components/ui/Foundation';

// ── Branch & Scheme Definitions (single source of truth) ──
const SCHEMES = ['2022', '2025'];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316'];

// ── Styles ──
const S = {
  page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1100px', margin: '0 auto' },
  label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)' },
  mbox: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', width: '100%', maxWidth: '480px', padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90dvh', overflowY: 'auto' },
  statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
};

const btn = (v = 'primary', extra = {}) => ({
  padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-3)', fontWeight: 700, fontSize: '13px',
  cursor: 'pointer',
  background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)',
  color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)',
  border: v === 'primary' ? 'none' : `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}`,
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  ...extra
});

export default function SubjectsPage() {
  const [faculty, setFaculty] = useState(null);
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
    const s = localStorage.getItem('faculty_session');
    if (s) setFaculty(JSON.parse(s));
    fetchBranches();
  }, [fetchBranches]);

  const fetchSubjects = useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    setError('');
    try {
      const { data: catData, error: catErr } = await supabase
        .from('subject_catalog')
        .select('*')
        .eq('scheme', scheme)
        .eq('branch', branch)
        .order('semester', { ascending: true })
        .order('subject_code', { ascending: true });

      if (catErr) throw catErr;
      setSubjects(catData || []);
    } catch (err) {
      setError(err.message);
      console.error('Subjects fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [scheme, branch]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // ── Derived Data ──
  const filtered = subjects.filter(s => {
    const matchSem = filterSem === 'all' || String(s.semester) === String(filterSem);
    const matchSearch = !searchQuery || 
      s.subject_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subject_code?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSem && matchSearch;
  });

  const bySemseter = SEMESTERS.reduce((acc, sem) => {
    acc[sem] = subjects.filter(s => s.semester === sem);
    return acc;
  }, {});

  const totalCredits = subjects.reduce((s, sub) => s + (Number(sub.credits) || 0), 0);
  const semCount = new Set(subjects.map(s => s.semester)).size;

  // Chart data
  const creditsBySem = SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => ({
    name: `Sem ${sem}`,
    value: bySemseter[sem].reduce((s, sub) => s + (Number(sub.credits) || 0), 0),
    count: bySemseter[sem].length,
  }));

  const subjectCountBySem = SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => ({
    name: `Sem ${sem}`,
    value: bySemseter[sem].length,
  }));

  // ── Handlers ──
  const openAdd = () => {
    setEditing(null);
    setFormData({ name: '', code: '', credits: 3, semester: filterSem === 'all' ? 1 : Number(filterSem) });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setFormData({ name: s.subject_name, code: s.subject_code, credits: s.credits, semester: s.semester });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.code?.trim()) return alert('Name and Code are required.');
    if (Number(formData.credits) < 0) return alert('Credits must be a positive number.');
    setSaving(true);
    try {
      const payload = {
        subject_name: formData.name.trim(),
        subject_code: formData.code.trim().toUpperCase(),
        credits: Number(formData.credits),
        semester: Number(formData.semester),
        scheme,
        branch,
      };

      let res;
      if (editing) {
        await apiRequest('/api/subjects', {
          method: 'PUT',
          body: JSON.stringify({ id: editing.id, ...payload })
        });
        await logAuditAction({
          action_type: 'EDIT_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: editing.id,
          old_values: { subject_name: editing.subject_name, subject_code: editing.subject_code, credits: editing.credits, semester: editing.semester },
          new_values: payload
        });
      } else {
        const created = await apiRequest('/api/subjects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        await logAuditAction({
          action_type: 'ADD_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: created?.id || 'NEW',
          new_values: payload
        });
      }
      fetchSubjects();
      setShowForm(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBranchSave = async () => {
    if (!branchData.code?.trim() || !branchData.label?.trim()) return alert('Code and Label are required.');
    setSaving(true);
    try {
      await apiRequest('/api/system/meta', {
        method: 'POST',
        body: JSON.stringify({
          code: branchData.code.trim().toUpperCase(),
          label: branchData.label.trim()
        })
      }).catch(() => null);
      await fetchBranches();
      setShowBranchForm(false);
      setBranchData({ code: '', label: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk Add ──
  // Accepts pasted CSV-like text (code,name,credits,semester per line, header row
  // optional) or an uploaded .csv/.xlsx with the same columns.
  const parseBulkText = (text) => {
    const rows = [];
    const errors = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 4) { errors.push(`Line ${i + 1}: expected code,name,credits,semester`); return; }
      const [code, name, credits, semester] = parts;
      if (/^code$/i.test(code) && /^name$/i.test(name)) return; // skip header row
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
    reader.onload = (evt) => {
      try {
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
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
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

    // One sheet per semester
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

    // All subjects sheet
    const allRows = [
      ['Subject Code', 'Subject Name', 'Credits', 'Semester', 'Scheme', 'Branch'],
      ...subjects.map(s => [s.subject_code, s.subject_name, s.credits, s.semester, s.scheme, s.branch])
    ];
    const allWs = XLSX.utils.aoa_to_sheet(allRows);
    allWs['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, allWs, 'All Subjects');

    XLSX.writeFile(wb, `GradeFlow_Subjects_${scheme}_${branch}.xlsx`);
  };

  const displayedBranchLabel = branches.find(b => b.code === branch)?.label || branch;

  return (
    <AuthGuard role="faculty">
      <div style={S.page}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
          <PageHeader>
            <PageHeaderTitle>Subject Library</PageHeaderTitle>
            <PageHeaderSubtitle>Manage academic subjects, credits, and branches. Changes to credits reflect dynamically in SGPA/CGPA calculations.</PageHeaderSubtitle>
          </PageHeader>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowBranchForm(true)} variant="ghost">
              <span className="material-icons-round" style={{ fontSize: '17px', marginRight: 'var(--space-2)' }}>account_tree</span>
              Add Branch
            </Button>
            <Button onClick={exportToExcel} variant="ghost">
              <span className="material-icons-round" style={{ fontSize: '17px', marginRight: 'var(--space-2)' }}>download</span>
              Export Excel
            </Button>
            <Button onClick={() => setShowBulkForm(true)} variant="ghost">
              <span className="material-icons-round" style={{ fontSize: '17px', marginRight: 'var(--space-2)' }}>upload_file</span>
              Bulk Add
            </Button>
            <Button onClick={openAdd} variant="primary">
              <span className="material-icons-round" style={{ fontSize: '17px', marginRight: 'var(--space-2)' }}>add</span>
              Add Subject
            </Button>
          </div>
        </div>

        {/* Error / Info */}
        {error && subjects.length === 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: 'var(--red)', fontSize: '13px', fontWeight: 700 }}>
            ⚠ {error}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={S.label}>Scheme</label>
            <select value={scheme} onChange={e => setScheme(e.target.value)} style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', color: 'var(--tx-main)', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}>
              {SCHEMES.map(s => <option key={s} value={s}>{s} Scheme</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Branch</label>
            <select value={branch} onChange={e => setBranch(e.target.value)} style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', color: 'var(--tx-main)', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}>
              {branches.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Semester</label>
            <select value={filterSem} onChange={e => setFilterSem(e.target.value)} style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', color: 'var(--tx-main)', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}>
              <option value="all">All Semesters</option>
              {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
          <div>
            <Input
              label="Search"
              placeholder="Search subject or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { icon: 'book', label: 'Total Subjects', value: subjects.length },
            { icon: 'star', label: 'Total Credits', value: totalCredits },
            { icon: 'layers', label: 'Semesters', value: semCount },
            { icon: 'filter_list', label: 'Filtered', value: filtered.length },
          ].map(stat => (
            <div key={stat.label} style={S.statCard}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--primary)' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[{ id: 'list', label: 'Subject List', icon: 'list' }, { id: 'charts', label: 'Analytics', icon: 'pie_chart' }].map(tab => (
            <Button key={tab.id} onClick={() => setActiveTab(tab.id)} variant={activeTab === tab.id ? 'primary' : 'ghost'} style={{ fontSize: '13px' }}>
              <span className="material-icons-round" style={{ fontSize: '16px', marginRight: 'var(--space-2)' }}>{tab.icon}</span>
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Content Tabs */}
        {activeTab === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {SEMESTERS.map(sem => {
              const semSubs = bySemseter[sem].filter(s => 
                !searchQuery || 
                s.subject_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.subject_code?.toLowerCase().includes(searchQuery.toLowerCase())
              );
              
              if (filterSem !== 'all' && String(sem) !== String(filterSem)) return null;
              if (semSubs.length === 0 && filterSem === 'all' && !searchQuery) return null;

              return (
                <div key={sem} style={{ padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <div style={{ background: 'var(--primary)', color: 'var(--bg)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px' }}>
                      {sem}
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Semester {sem} Subjects</h3>
                    <span style={{ fontSize: '12px', color: 'var(--tx-dim)', marginLeft: 'auto', fontWeight: 600 }}>
                      {semSubs.length} Subjects • {semSubs.reduce((acc, s) => acc + (Number(s.credits) || 0), 0)} Credits
                    </span>
                  </div>

                  {semSubs.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px', color: 'var(--tx-muted)', fontSize: '13px' }}>
                      No subjects {searchQuery ? 'matching search' : 'defined'} for Semester {sem}.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
                      {semSubs.map(s => (
                        <Card key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                          <CardContent style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--primary)', background: 'var(--primary-low)', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.04em' }}>
                                {s.subject_code}
                              </span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <Button onClick={() => openEdit(s)} variant="ghost" size="sm" style={{ padding: '4px', minWidth: '44px' }} title="Edit" aria-label={`Edit ${s.subject_code}`}>
                                  <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">edit</span>
                                </Button>
                              </div>
                            </div>
                            <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0, lineHeight: 1.4, color: 'var(--tx-main)' }}>{s.subject_name}</h4>
                            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-low)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--tx-dim)' }}>stars</span>
                                <span style={{ fontSize: '12px', fontWeight: 700 }}>{s.credits} Credits</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {subjects.length === 0 && !loading && (
              <div style={{ padding: '80px 20px', textAlign: 'center', background: 'var(--surface-low)', borderRadius: '24px', border: '1px dashed var(--border)' }}>
                <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--tx-dim)', marginBottom: '16px' }}>find_in_page</span>
                <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>No Subjects Found</h3>
                <p style={{ color: 'var(--tx-muted)', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                  No subjects for <strong>{scheme}</strong> scheme in <strong>{displayedBranchLabel}</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'charts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
            <Card>
              <CardContent style={{ padding: 'var(--space-6)' }}>
                <div style={S.label}>Credits distribution</div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={creditsBySem} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                      {creditsBySem.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent style={{ padding: 'var(--space-6)' }}>
                <div style={S.label}>Semester stats</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {creditsBySem.map((c, i) => (
                    <div key={i} style={{ display: 'flex', borderBottom: '1px solid var(--border-low)', paddingBottom: '6px' }}>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{c.value} Credits</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Subject Form Modal */}
        {showForm && (
          <div style={S.modal}>
            <div style={S.mbox}>
              <h2 style={{ fontSize: '20px', fontWeight: 900 }}>{editing ? 'Edit Subject' : 'Add New Subject'}</h2>
              <div>
                <Input label="Subject Code" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <Input label="Subject Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '16px' }}>
                <div>
                  <Input label="Credits" type="number" value={formData.credits} onChange={e => setFormData({...formData, credits: e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Semester</label>
                  <select style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', color: 'var(--tx-main)', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', outline: 'none' }} value={formData.semester} onChange={e => setFormData({...formData, semester: e.target.value})}>
                    {SEMESTERS.map(s => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <Button onClick={()=>setShowForm(false)} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving...' : 'Save Subject'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Branch Form Modal */}
        {showBranchForm && (
          <div style={S.modal}>
            <div style={S.mbox}>
              <h2 style={{ fontSize: '20px', fontWeight: 900 }}>Add New Branch</h2>
              <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginTop: '-12px' }}>Enter department details to categorize subjects.</p>
              <div>
                <Input label="Branch Code" placeholder="e.g. AI" value={branchData.code} onChange={e => setBranchData({...branchData, code: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <Input label="Branch Name" placeholder="e.g. Artificial Intelligence" value={branchData.label} onChange={e => setBranchData({...branchData, label: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <Button onClick={()=>setShowBranchForm(false)} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
                <Button onClick={handleBranchSave} disabled={saving} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving...' : 'Add Branch'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Add Modal */}
        {showBulkForm && (
          <div style={S.modal}>
            <div style={{ ...S.mbox, maxWidth: '640px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900 }}>Bulk Add Subjects</h2>
              <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginTop: '-12px' }}>
                Adds subjects to <strong>{scheme} scheme / {displayedBranchLabel}</strong>. Paste rows or upload a CSV/Excel file with columns: <code>code, name, credits, semester</code>.
              </p>
              <div>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  label="Upload CSV/Excel"
                  onChange={handleBulkFile}
                />
              </div>
              <div>
                <label style={S.label}>Or Paste Rows</label>
                <textarea
                  value={bulkText}
                  onChange={e => handleBulkTextChange(e.target.value)}
                  placeholder={'BCS301, Mathematics for Computer Science, 4, 3\nBCS302, Digital Design & Computer Organization, 4, 3'}
                  rows={8}
                  style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', color: 'var(--tx-main)', fontSize: '13px', fontFamily: 'monospace', outline: 'none', resize: 'vertical' }}
                />
              </div>
              {bulkError && (
                <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px 14px', color: 'var(--red)', fontSize: '12px', fontWeight: 600 }}>
                  ⚠ {bulkError}
                </div>
              )}
              {bulkRows.length > 0 && (
                <div style={{ fontSize: '13px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                  {bulkRows.length} subject{bulkRows.length === 1 ? '' : 's'} ready to import
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <Button onClick={() => { setShowBulkForm(false); setBulkText(''); setBulkRows([]); setBulkError(''); }} variant="ghost" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
                <Button onClick={handleBulkSave} disabled={saving || !bulkRows.length} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Importing...' : `Import ${bulkRows.length || ''} Subject${bulkRows.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

