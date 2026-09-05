import React, { useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui/Foundation';

const STANDARD_TIME_SLOTS = [
    // Morning 1-hr & 1.5-hr slots
    '09:00 am to 10:00 am',
    '09:30 am to 10:30 am',
    '10:00 am to 11:00 am',
    '10:00 am to 11:30 am',
    '11:00 am to 12:00 pm',
    '11:30 am to 12:30 pm',
    // Afternoon 1-hr & 1.5-hr slots
    '01:30 pm to 02:30 pm',
    '02:00 pm to 03:00 pm',
    '02:00 pm to 03:30 pm',
    '02:30 pm to 03:30 pm',
    '03:00 pm to 04:00 pm',
    // 3-hour End Sem / External Exam slots
    '09:30 am to 12:30 pm',
    '02:00 pm to 05:00 pm'
];

/**
 * Normalizes user typed or custom time inputs into the standard VTU format:
 * "hh:mm am to hh:mm pm".
 * Handles inputs like: "9 to 10", "9 am to 10", "9.30 to 10.30", "09:30-10:30"
 */
function normalizeTimeRange(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const str = raw.trim();
    if (!str) return str;

    const standardMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*to\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (standardMatch) {
        const [_, h1, m1, p1, h2, m2, p2] = standardMatch;
        return `${h1.padStart(2, '0')}:${m1} ${p1.toLowerCase()} to ${h2.padStart(2, '0')}:${m2} ${p2.toLowerCase()}`;
    }

    const parts = str.split(/\s*(?:to|-)\s*/i);
    if (parts.length === 2) {
        function parsePart(p, defaultPeriod) {
            const cleaned = p.trim().toLowerCase();
            let period = cleaned.includes('pm') ? 'pm' : cleaned.includes('am') ? 'am' : defaultPeriod;
            const numMatch = cleaned.match(/(\d{1,2})(?:[:.](\d{1,2}))?/);
            if (!numMatch) return null;
            let h = parseInt(numMatch[1], 10);
            let m = numMatch[2] ? parseInt(numMatch[2], 10) : 0;
            if (isNaN(h)) return null;
            if (!period) {
                period = (h >= 1 && h <= 7) ? 'pm' : 'am';
            }
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
        }

        let p2Period = parts[1].toLowerCase().includes('pm') ? 'pm' : parts[1].toLowerCase().includes('am') ? 'am' : null;
        let p1Period = parts[0].toLowerCase().includes('pm') ? 'pm' : parts[0].toLowerCase().includes('am') ? 'am' : p2Period;
        
        const t1 = parsePart(parts[0], p1Period);
        const t2 = parsePart(parts[1], p2Period || (t1 && t1.includes('am') ? 'am' : 'pm'));
        if (t1 && t2) {
            return `${t1} to ${t2}`;
        }
    }

    return str;
}

function toISO(ddmmyyyy) {
    const m = String(ddmmyyyy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function toDisplay(iso) {
    const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function abbreviate(name) {
    const STOP = new Set(['AND', 'OF', 'THE', 'FOR', 'IN', 'TO', 'A', 'AN', '&', 'WITH', 'USING']);
    const words = String(name || '')
        .replace(/\(.*?\)/g, ' ')
        .replace(/[^A-Za-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean)
        .filter(w => !STOP.has(w.toUpperCase()));
    if (!words.length) return '';
    if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
    return words.map(w => w[0].toUpperCase()).join('').slice(0, 5);
}

function electiveFamilyKey(code) {
    const m = String(code || '').toUpperCase().match(/^(\d*B)[A-Z]{2,3}(\d{3})[A-Z]?$/);
    return m ? `${m[1]}XX${m[2]}X` : null;
}

export default function TimetableEditor({
    timetable = [],
    onChange = () => {},
    onAutoFill = () => {},
    loading = false,
    catalogSubjects = []
}) {
    // Catalog lookups for the class currently in scope. Keyed by code, and by
    // elective family so BCS613B still resolves against BXX613X.
    const { byCode, byFamily, options } = useMemo(() => {
        const code = new Map();
        const family = new Map();
        (catalogSubjects || []).forEach(s => {
            const c = String(s.code || s.subject_code || '').toUpperCase().trim();
            const n = String(s.name || s.subject_name || '').trim();
            if (!c) return;
            const entry = { code: c, name: n };
            code.set(c, entry);
            const fam = electiveFamilyKey(c);
            if (fam) family.set(fam, entry);
        });
        return {
            byCode: code,
            byFamily: family,
            options: [...code.values()].sort((a, b) => a.code.localeCompare(b.code)),
        };
    }, [catalogSubjects]);

    /** Catalog entry for a typed code, falling back to its elective family. */
    const lookup = (raw) => {
        const c = String(raw || '').toUpperCase().trim();
        if (!c) return null;
        return byCode.get(c) || byFamily.get(electiveFamilyKey(c)) || null;
    };

    const handleUpdateRow = (index, field, value) => {
        const updated = [...timetable];
        updated[index] = { ...updated[index], [field]: value };
        onChange(updated);
    };

    /**
     * Picking or typing a subject code fills the short name from the catalog.
     * Only fills when the short name is blank or still matches the previous
     * code's abbreviation, so a hand-written short name is never overwritten.
     */
    const handleCodeChange = (index, rawValue) => {
        const value = String(rawValue || '').toUpperCase();
        const row = timetable[index] || {};
        const prev = lookup(row.subjectCode);
        const next = lookup(value);

        const shortIsAuto = !row.subjectName
            || (prev && row.subjectName === abbreviate(prev.name));

        const updated = [...timetable];
        updated[index] = {
            ...row,
            subjectCode: value,
            subjectName: (next && shortIsAuto) ? abbreviate(next.name) : row.subjectName,
        };
        onChange(updated);
    };

    /**
     * The short-name field also accepts a full subject name picked from the
     * catalog list - selecting one sets the code and collapses the field to the
     * abbreviation, which is what the ticket prints.
     */
    const handleShortChange = (index, rawValue) => {
        const value = String(rawValue || '');
        const match = options.find(o => o.name.toLowerCase() === value.toLowerCase().trim());
        const row = timetable[index] || {};

        const updated = [...timetable];
        updated[index] = match
            ? { ...row, subjectCode: match.code, subjectName: abbreviate(match.name) }
            : { ...row, subjectName: value };
        onChange(updated);
    };

    const handleAddRow = () => {
        const lastRow = timetable[timetable.length - 1];
        const nextRow = {
            date: lastRow?.date || new Date().toISOString().split('T')[0].split('-').reverse().join('/'),
            time: '10:00 am to 11:00 am',
            subjectCode: '',
            subjectName: ''
        };
        onChange([...timetable, nextRow]);
    };

    const handleRemoveRow = (index) => {
        if (timetable.length <= 1) return;
        const updated = timetable.filter((_, i) => i !== index);
        onChange(updated);
    };

    // Sorts rows by date then start time, so the printed ticket reads in the
    // order candidates actually sit the papers.
    const handleSortByDate = () => {
        const sorted = [...timetable].sort((a, b) => {
            const d = toISO(a.date).localeCompare(toISO(b.date));
            if (d !== 0) return d;
            return String(a.time || '').localeCompare(String(b.time || ''));
        });
        onChange(sorted);
    };

    const scheduleSummary = useMemo(() => {
        const isoDates = timetable.map(r => toISO(r.date)).filter(Boolean).sort();
        if (!isoDates.length) return null;
        const unique = [...new Set(isoDates)];
        const collisions = [];
        const seen = new Map();
        timetable.forEach((r) => {
            const key = `${toISO(r.date)}|${String(r.time || '').trim().toLowerCase()}`;
            if (!toISO(r.date)) return;
            if (seen.has(key)) collisions.push(key);
            else seen.set(key, true);
        });
        return {
            days: unique.length,
            first: toDisplay(unique[0]),
            last: toDisplay(unique[unique.length - 1]),
            collisions: collisions.length,
            undated: timetable.filter(r => !toISO(r.date)).length,
        };
    }, [timetable]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>schedule</span>
                    Exam Schedule / Timetable ({timetable.length} Subjects)
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={onAutoFill}
                        disabled={loading}
                        style={{
                            background: 'var(--surface-low)',
                            color: 'var(--primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: loading ? 'wait' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>
                            {loading ? 'sync' : 'auto_fix_high'}
                        </span>
                        {loading ? 'Fetching Syllabus...' : 'Auto-fill from Syllabus'}
                    </button>
                    <button
                        type="button"
                        onClick={handleSortByDate}
                        title="Sort rows by date, then start time"
                        style={{
                            background: 'var(--surface-low)',
                            color: 'var(--tx-main)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>sort</span>
                        Sort by Date
                    </button>
                    <button
                        type="button"
                        onClick={handleAddRow}
                        style={{
                            background: 'var(--primary)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span>
                        Add Subject
                    </button>
                </div>
            </div>

            {/* Schedule summary */}
            {scheduleSummary && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', fontSize: '11.5px', color: 'var(--tx-dim)' }}>
                    <span>
                        <strong style={{ color: 'var(--tx-main)' }}>{scheduleSummary.days}</strong>{' '}
                        exam {scheduleSummary.days === 1 ? 'day' : 'days'} · {scheduleSummary.first}
                        {scheduleSummary.last !== scheduleSummary.first ? ` to ${scheduleSummary.last}` : ''}
                    </span>
                    {scheduleSummary.collisions > 0 && (
                        <span style={{ color: '#DC2626', fontWeight: 700 }}>
                            {scheduleSummary.collisions} slot clash{scheduleSummary.collisions === 1 ? '' : 'es'} — two papers at the same time
                        </span>
                    )}
                    {scheduleSummary.undated > 0 && (
                        <span style={{ color: '#B45309', fontWeight: 700 }}>
                            {scheduleSummary.undated} row{scheduleSummary.undated === 1 ? '' : 's'} without a valid date
                        </span>
                    )}
                </div>
            )}

            {/* Timetable Rows Table */}
            <div style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '120px' }}>Date (DD/MM/YYYY)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '180px' }}>Time Slot</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '175px' }}>
                                Catalog Subject
                                <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 500, color: 'var(--tx-muted)' }}>
                                    Populates code & name
                                </span>
                            </th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '100px' }}>
                                Subject Code
                                <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 500, color: 'var(--tx-muted)' }}>
                                    Editable
                                </span>
                            </th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '85px' }}>
                                Subject (Short)
                                <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 500, color: 'var(--tx-muted)' }}>
                                    Editable
                                </span>
                            </th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', width: '32px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {timetable.map((row, idx) => {
                            const isStandard = STANDARD_TIME_SLOTS.includes(row.time);
                            return (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-low)', background: 'var(--surface)' }}>
                                    <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                                        <input
                                            type="date"
                                            value={toISO(row.date)}
                                            onChange={(e) => handleUpdateRow(idx, 'date', toDisplay(e.target.value))}
                                            style={{
                                                width: '100%',
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                border: `1px solid ${toISO(row.date) ? 'var(--border)' : '#B45309'}`,
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <select
                                                value={isStandard ? row.time : '__custom__'}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    if (v === '__custom__') {
                                                        handleUpdateRow(idx, 'time', row.time && !isStandard ? row.time : '09:00 am to 10:00 am');
                                                    } else {
                                                        handleUpdateRow(idx, 'time', v);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '5px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--surface)',
                                                    color: 'var(--tx-main)',
                                                    fontSize: '11.5px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <optgroup label="Morning IA Slots">
                                                    <option value="09:00 am to 10:00 am">09:00 am to 10:00 am</option>
                                                    <option value="09:30 am to 10:30 am">09:30 am to 10:30 am</option>
                                                    <option value="10:00 am to 11:00 am">10:00 am to 11:00 am</option>
                                                    <option value="10:00 am to 11:30 am">10:00 am to 11:30 am</option>
                                                    <option value="11:00 am to 12:00 pm">11:00 am to 12:00 pm</option>
                                                    <option value="11:30 am to 12:30 pm">11:30 am to 12:30 pm</option>
                                                </optgroup>
                                                <optgroup label="Afternoon IA Slots">
                                                    <option value="01:30 pm to 02:30 pm">01:30 pm to 02:30 pm</option>
                                                    <option value="02:00 pm to 03:00 pm">02:00 pm to 03:00 pm</option>
                                                    <option value="02:00 pm to 03:30 pm">02:00 pm to 03:30 pm</option>
                                                    <option value="02:30 pm to 03:30 pm">02:30 pm to 03:30 pm</option>
                                                    <option value="03:00 pm to 04:00 pm">03:00 pm to 04:00 pm</option>
                                                </optgroup>
                                                <optgroup label="3-Hour Examination Slots">
                                                    <option value="09:30 am to 12:30 pm">09:30 am to 12:30 pm</option>
                                                    <option value="02:00 pm to 05:00 pm">02:00 pm to 05:00 pm</option>
                                                </optgroup>
                                                <option value="__custom__">⚙️ Custom time (type or pick)...</option>
                                            </select>
                                            {!isStandard && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <input
                                                        type="text"
                                                        value={row.time}
                                                        placeholder="e.g. 09:30 am to 10:30 am"
                                                        onChange={(e) => handleUpdateRow(idx, 'time', e.target.value)}
                                                        onBlur={(e) => handleUpdateRow(idx, 'time', normalizeTimeRange(e.target.value))}
                                                        style={{
                                                            width: '100%',
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            border: '1.5px solid var(--primary)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--tx-main)',
                                                            fontSize: '11px',
                                                            fontWeight: 600
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '9.5px', color: 'var(--tx-dim)' }}>Quick:</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRow(idx, 'time', '09:00 am to 10:00 am')}
                                                            style={{
                                                                background: 'rgba(59, 130, 246, 0.08)',
                                                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                                                borderRadius: '4px',
                                                                padding: '1px 5px',
                                                                fontSize: '9.5px',
                                                                color: 'var(--primary)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            9-10 AM
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRow(idx, 'time', '09:30 am to 10:30 am')}
                                                            style={{
                                                                background: 'rgba(59, 130, 246, 0.08)',
                                                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                                                borderRadius: '4px',
                                                                padding: '1px 5px',
                                                                fontSize: '9.5px',
                                                                color: 'var(--primary)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            9:30-10:30 AM
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRow(idx, 'time', '02:30 pm to 03:30 pm')}
                                                            style={{
                                                                background: 'rgba(59, 130, 246, 0.08)',
                                                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                                                borderRadius: '4px',
                                                                padding: '1px 5px',
                                                                fontSize: '9.5px',
                                                                color: 'var(--primary)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            2:30-3:30 PM
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {/* Catalog Subject Dropdown: choosing from here auto-fills code & short name */}
                                    <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                                        <select
                                            value={
                                                catalogSubjects.some(s => (s.code || '').toUpperCase() === (row.subjectCode || '').toUpperCase())
                                                    ? (row.subjectCode || '').toUpperCase()
                                                    : (lookup(row.subjectCode) ? lookup(row.subjectCode).code : '')
                                            }
                                            onChange={(e) => {
                                                const selectedCode = e.target.value;
                                                if (!selectedCode) return;
                                                const found = catalogSubjects.find(s => (s.code || '').toUpperCase() === selectedCode.toUpperCase());
                                                if (found) {
                                                    handleUpdateRow(idx, 'subjectCode', found.code);
                                                    handleUpdateRow(idx, 'subjectName', found.shortName || abbreviate(found.name) || found.name);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '11.5px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">
                                                {catalogSubjects.length > 0 ? '— Select from Catalog —' : '— No Catalog Subjects —'}
                                            </option>
                                            {catalogSubjects.map((s) => (
                                                <option key={s.code} value={s.code}>
                                                    {s.code} · {s.name}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                                        <input
                                            type="text"
                                            value={row.subjectCode}
                                            placeholder="BCS601"
                                            onChange={(e) => handleCodeChange(idx, e.target.value)}
                                            style={{
                                                width: '100%',
                                                minWidth: '85px',
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                fontFamily: 'monospace'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                                        <input
                                            type="text"
                                            value={row.subjectName}
                                            placeholder="CC"
                                            onChange={(e) => handleUpdateRow(idx, 'subjectName', e.target.value)}
                                            style={{
                                                width: '100%',
                                                minWidth: '70px',
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px',
                                                fontWeight: 700
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveRow(idx)}
                                            disabled={timetable.length <= 1}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: timetable.length > 1 ? 'pointer' : 'not-allowed',
                                                color: timetable.length > 1 ? '#EF4444' : 'var(--tx-dim)',
                                                padding: '4px',
                                                display: 'inline-flex',
                                                alignItems: 'center'
                                            }}
                                            title="Remove Subject"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>delete_outline</span>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
