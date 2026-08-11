'use client';

import { useState, useRef } from 'react';

export default function PDFUpload({ onExtracted }) {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const inputRef = useRef();

    const handleFile = (f) => {
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.pdf')) {
            setError('Please select a valid .pdf file.');
            setFile(null);
            return;
        }
        // Allow up to 30MB
        if (f.size > 30 * 1024 * 1024) {
            setError('File too large. Max 30MB.');
            setFile(null);
            return;
        }
        setFile(f);
        setError('');
        setSuccess('');
    };

    const process = async () => {
        if (!file) return;
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const fd = new FormData();
            fd.append('pdf', file);

            const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd });
            const json = await res.json();

            if (!json.success) throw new Error(json.detail || json.error || 'Parsing failed.');

            const data = json.data;
            const subjectCount = data.subjects?.length || 0;

            if (subjectCount === 0) {
                throw new Error('No subjects found in this PDF. Please ensure it is a valid VTU result document.');
            }

            setSuccess(`✓ Extracted ${subjectCount} subjects from PDF`);
            onExtracted(data);
            setFile(null);
        } catch (e) {
            setError(e.message || 'Error processing PDF.');
        } finally {
            setLoading(false);
        }
    };

    const st = {
        container: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
        btnBase: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '10px', fontWeight: 700,
            minHeight: '44px',
            fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
        },
        ghost: {
            background: 'var(--surface-low)', border: '1px solid var(--border)',
            color: 'var(--tx-muted)',
        },
        solid: {
            background: 'var(--primary)', border: 'none',
            color: 'var(--bg)',
        },
        error: { color: '#DC2626', fontSize: '11px', fontWeight: 700, marginLeft: '4px' },
        success: { color: '#16A34A', fontSize: '11px', fontWeight: 700, marginLeft: '4px' },
    };

    return (
        <div style={st.container}>
            <input
                type="file" ref={inputRef} style={{ display: 'none' }}
                accept=".pdf"
                aria-label="Upload VTU result PDF"
                onChange={e => handleFile(e.target.files[0])}
            />

            <button
                type="button"
                style={{ ...st.btnBase, ...st.ghost }}
                onClick={() => inputRef.current.click()}
                aria-label={file ? `Selected PDF ${file.name}. Choose another PDF` : 'Upload VTU result PDF'}
                title="Upload VTU result PDF (max 30MB)"
            >
                <span className="material-icons-round" style={{ fontSize: '18px' }} aria-hidden="true">
                    {file ? 'check_circle' : 'upload_file'}
                </span>
                {file ? (file.name.length > 18 ? file.name.substring(0, 15) + '...' : file.name) : 'Upload PDF'}
            </button>

            {file && (
                <button
                    type="button"
                    style={{ ...st.btnBase, ...st.solid, opacity: loading ? 0.7 : 1 }}
                    onClick={(e) => { e.stopPropagation(); process(); }}
                    disabled={loading}
                    aria-busy={loading}
                >
                    <span className="material-icons-round" style={{ fontSize: '16px' }} aria-hidden="true">{loading ? 'sync' : 'play_arrow'}</span>
                    {loading ? 'Parsing...' : 'Extract Marks'}
                </button>
            )}

            {error && <span style={st.error} role="alert">{error}</span>}
            {success && <span style={st.success} role="status" aria-live="polite">{success}</span>}
        </div>
    );
}
