'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest } from '../../../lib/api/client';
import { recordFacultyAction } from '../../../lib/api/faculty-action';
import AuthGuard from '../../../components/AuthGuard';

function BatchUploadContent() {
    const [faculty, setFaculty] = useState(null);
    const [activeTab, setActiveTab] = useState('sgpa'); // 'sgpa' | 'attainment'
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [previewData, setPreviewData] = useState(null);
    const [uploadStats, setUploadStats] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        const s = localStorage.getItem('faculty_session');
        if (s) setFaculty(JSON.parse(s));
    }, []);

    // ── Parse uploaded file ──
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setMsg('');
        setUploadStats(null);

        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let wb;
            if (ext === 'csv') {
                const text = await file.text();
                wb = XLSX.read(text, { type: 'string' });
            } else {
                const buf = await file.arrayBuffer();
                wb = XLSX.read(buf, { type: 'array' });
            }

            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            
            if (!rows.length) {
                setError('File is empty or could not be parsed.');
                return;
            }

            setPreviewData({ rows, headers: Object.keys(rows[0]), fileName: file.name });
        } catch (err) {
            console.error('File parse error:', err);
            setError('Failed to parse file. Use .csv, .xlsx, or .xls format.');
        }

        if (fileRef.current) fileRef.current.value = '';
    };

    // ── Batch Upload SGPA ──
    const uploadSGPA = async () => {
        if (!previewData?.rows?.length) return;
        setLoading(true);
        setError('');
        setMsg('');

        try {
            const stats = await apiRequest('/api/faculty/batch-upload/sgpa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: previewData.rows }),
            });

            setUploadStats(stats);
            setMsg(`✓ Batch SGPA Upload Complete: ${stats.inserted} records processed, ${stats.skipped} skipped, ${stats.errors} errors.`);
            setPreviewData(null);

            // Log activity
            if (faculty?.id) {
                await recordFacultyAction(faculty, 'BATCH_SGPA_UPLOAD', `${stats.inserted} records`);
            }
        } catch (err) {
            console.error('Batch SGPA error:', err);
            setError('Batch upload failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Batch Upload CO-PO / Attainment ──
    const uploadAttainment = async () => {
        if (!previewData?.rows?.length) return;
        setLoading(true);
        setError('');
        setMsg('');

        try {
            const stats = await apiRequest('/api/faculty/batch-upload/attainment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: previewData.rows }),
            });

            setUploadStats(stats);
            setMsg(`✓ CO-PO Mapping Upload Complete: ${stats.inserted} mappings processed, ${stats.skipped} skipped, ${stats.errors} errors.`);
            setPreviewData(null);

            if (faculty?.id) {
                await recordFacultyAction(faculty, 'BATCH_COPO_UPLOAD', `${stats.inserted} mappings`);
            }
        } catch (err) {
            console.error('Attainment upload error:', err);
            setError('Batch upload failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Download Template ──
    const downloadTemplate = (type) => {
        const wb = XLSX.utils.book_new();
        if (type === 'sgpa') {
            const ws = XLSX.utils.aoa_to_sheet([
                ['USN', 'Semester', 'SGPA'],
                ['1VT22CS001', 3, 8.5],
                ['1VT22CS002', 3, 7.2],
                ['1VT22CS003', 3, 9.1],
            ]);
            XLSX.utils.book_append_sheet(wb, ws, 'SGPA Data');
        } else {
            const ws = XLSX.utils.aoa_to_sheet([
                ['Subject Code', 'CO', 'PO', 'Attainment Level'],
                ['22CS33', 'CO1', 'PO1', 3],
                ['22CS33', 'CO1', 'PO2', 2],
                ['22CS33', 'CO2', 'PO1', 3],
                ['22CS34', 'CO1', 'PO1', 2],
            ]);
            XLSX.utils.book_append_sheet(wb, ws, 'CO-PO Mapping');
        }
        XLSX.writeFile(wb, `GradeFlow_${type === 'sgpa' ? 'SGPA' : 'COPO'}_Template.xlsx`);
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1000px', margin: '0 auto' },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: 'var(--space-1)' },
        subtitle: { fontSize: '13px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: 'var(--space-8)' },
        card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-7)', marginBottom: 'var(--space-6)' },
        tabBar: { display: 'flex', gap: 'var(--space-2)', background: 'var(--surface-low)', padding: 'var(--space-1)', borderRadius: 'var(--radius-4)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 'var(--space-8)' },
        tabBtn: (active) => ({
            padding: 'var(--space-3) var(--space-6)', borderRadius: 'var(--radius-3)', border: 'none',
            background: active ? 'var(--primary)' : 'transparent',
            color: active ? 'var(--bg)' : 'var(--tx-muted)',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }),
        uploadZone: {
            border: '2px dashed var(--border)', borderRadius: 'var(--radius-6)',
            padding: 'var(--space-9)', textAlign: 'center', cursor: 'pointer',
            transition: 'all 0.2s', background: 'var(--surface-low)',
        },
        btn: (v = 'primary') => ({
            padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-3)', fontWeight: 700, fontSize: '13px',
            cursor: 'pointer', fontFamily: 'inherit', border: 'none',
            background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)',
            color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` })
        }),
        msgBox: (type) => ({
            padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-4)', marginBottom: 'var(--space-5)',
            fontSize: '13px', fontWeight: 700, lineHeight: 1.5,
            background: type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)',
            color: type === 'error' ? 'var(--red)' : 'var(--green)',
            border: `1px solid ${type === 'error' ? 'var(--red)' : 'var(--green)'}`,
        }),
        th: { padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' },
        td: { padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    };

    return (
        <div style={c.page} className="gf-fade-up">
            <div style={c.eyebrow}>Outsource Data Management</div>
            <h1 style={c.title}>Batch Upload</h1>
            <p style={c.subtitle}>
                Upload SGPA data or CO-PO attainment mappings in bulk using spreadsheet files.
                Download the templates below for the correct format.
            </p>

            {/* Tab Bar */}
            <div style={c.tabBar}>
                <button style={c.tabBtn(activeTab === 'sgpa')} onClick={() => { setActiveTab('sgpa'); setPreviewData(null); setMsg(''); setError(''); }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>grade</span>
                    SGPA Batch Upload
                </button>
                <button style={c.tabBtn(activeTab === 'attainment')} onClick={() => { setActiveTab('attainment'); setPreviewData(null); setMsg(''); setError(''); }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>hub</span>
                    CO-PO / Attainment Mapping
                </button>
            </div>

            {/* Messages */}
            {msg && <div style={c.msgBox('success')}>{msg}</div>}
            {error && <div style={c.msgBox('error')}>{error}</div>}

            {/* Upload Stats */}
            {uploadStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                    {[
                        { label: 'Total Rows', val: uploadStats.total, color: 'var(--tx-main)' },
                        { label: 'Processed', val: uploadStats.inserted, color: 'var(--green)' },
                        { label: 'Skipped', val: uploadStats.skipped, color: 'var(--amber)' },
                        { label: 'Errors', val: uploadStats.errors, color: uploadStats.errors > 0 ? 'var(--red)' : 'var(--green)' },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: 'var(--space-4) var(--space-5)' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-1)' }}>{s.label}</div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: s.color }}>{s.val}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Instructions & Template Download */}
            <div style={c.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-1)' }}>
                            {activeTab === 'sgpa' ? '📊 SGPA Batch Upload' : '🔗 CO-PO Attainment Mapping'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', lineHeight: 1.5 }}>
                            {activeTab === 'sgpa'
                                ? 'Upload a spreadsheet with columns: USN, Semester, SGPA. Each row updates the academic record for that student\'s semester.'
                                : 'Upload a spreadsheet with columns: Subject Code, CO (Course Outcome), PO (Program Outcome), Attainment Level. Maps course outcomes to program outcomes.'}
                        </div>
                    </div>
                    <button style={c.btn('ghost')} onClick={() => downloadTemplate(activeTab)}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>download</span>
                        Download Template
                    </button>
                </div>

                {/* Required columns info */}
                <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius-4)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>
                        Required Columns
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {(activeTab === 'sgpa'
                            ? ['USN', 'Semester', 'SGPA']
                            : ['Subject Code', 'CO', 'PO', 'Attainment Level']
                        ).map(col => (
                            <span key={col} style={{
                                padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-2)', fontSize: '11px', fontWeight: 800,
                                background: 'var(--primary)', color: 'var(--bg)',
                            }}>{col}</span>
                        ))}
                    </div>
                </div>

                {/* Upload Zone */}
                <div
                    style={c.uploadZone}
                    onClick={() => !loading && fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                    onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--border)';
                        if (e.dataTransfer.files?.[0]) {
                            handleFile({ target: { files: [e.dataTransfer.files[0]] } });
                        }
                    }}
                >
                    <input
                        type="file"
                        ref={fileRef}
                        style={{ display: 'none' }}
                        accept=".csv,.xlsx,.xls,.ods"
                        onChange={handleFile}
                    />
                    <span className="material-icons-round" style={{ fontSize: '40px', color: loading ? 'var(--primary)' : 'var(--tx-dim)', marginBottom: 'var(--space-3)', display: 'block' }}>
                        {loading ? 'sync' : 'cloud_upload'}
                    </span>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-2)' }}>
                        {loading ? 'Processing...' : 'Drop your spreadsheet here'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                        Supports CSV, Excel (.xlsx, .xls), ODS files
                    </div>
                </div>
            </div>

            {/* Preview Table */}
            {previewData && (
                <div style={c.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                Preview: {previewData.fileName}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                {previewData.rows.length} rows · {previewData.headers.length} columns
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button
                                style={c.btn('ghost')}
                                onClick={() => setPreviewData(null)}
                            >Cancel</button>
                            <button
                                style={c.btn('primary')}
                                onClick={activeTab === 'sgpa' ? uploadSGPA : uploadAttainment}
                                disabled={loading}
                            >
                                {loading && <span className="material-icons-round gf-spin" style={{ fontSize: '16px' }}>sync</span>}
                                {loading ? 'Uploading...' : `Upload ${previewData.rows.length} Records`}
                            </button>
                        </div>
                    </div>

                    <div className="gf-table-wrap">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={c.th}>#</th>
                                    {previewData.headers.map(h => (
                                        <th key={h} style={c.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.rows.slice(0, 20).map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ ...c.td, color: 'var(--tx-dim)', fontSize: '10px' }}>{i + 1}</td>
                                        {previewData.headers.map(h => (
                                            <td key={h} style={c.td}>{String(row[h] ?? '')}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {previewData.rows.length > 20 && (
                        <div style={{ textAlign: 'center', padding: 'var(--space-3)', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                            Showing first 20 of {previewData.rows.length} rows...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function BatchUploadPage() {
    return (
        <AuthGuard role="faculty">
            <BatchUploadContent />
        </AuthGuard>
    );
}
