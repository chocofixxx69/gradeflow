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
        function parsePart(p) {
            const cleaned = p.trim().toLowerCase();
            let period = cleaned.includes('pm') ? 'pm' : cleaned.includes('am') ? 'am' : null;
            const numMatch = cleaned.match(/(\d{1,2})(?:[:.](\d{1,2}))?/);
            if (!numMatch) return null;
            let h = parseInt(numMatch[1], 10);
            let m = numMatch[2] ? parseInt(numMatch[2], 10) : 0;
            if (isNaN(h)) return null;

            if (h >= 13 && h <= 23) {
                h -= 12;
                period = 'pm';
            } else if (h === 0) {
                h = 12;
                period = 'am';
            }
            return { h, m, period };
        }

        const p1 = parsePart(parts[0]);
        const p2 = parsePart(parts[1]);
        if (!p1 || !p2) return str;

        if (!p1.period && !p2.period) {
            p1.period = (p1.h >= 8 && p1.h <= 11) ? 'am' : 'pm';
            if (p2.h === 12 || (p2.h >= 1 && p2.h <= 7)) {
                p2.period = 'pm';
            } else {
                p2.period = 'am';
            }
        } else if (p2.period && !p1.period) {
            if (p2.period === 'am') {
                p1.period = 'am';
            } else {
                p1.period = (p1.h >= 8 && p1.h <= 11) ? 'am' : 'pm';
            }
        } else if (p1.period && !p2.period) {
            if (p1.period === 'am') {
                p2.period = (p2.h === 12 || (p2.h >= 1 && p2.h <= 7)) ? 'pm' : 'am';
            } else {
                p2.period = 'pm';
            }
        }

        const formatSlot = (item) => `${String(item.h).padStart(2, '0')}:${String(item.m).padStart(2, '0')} ${item.period}`;
        return `${formatSlot(p1)} to ${formatSlot(p2)}`;
    }

    return str;
}

function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 9999;
    const m = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (!m) return 9999;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    let period = m[3] ? m[3].toLowerCase() : null;
    if (!period) {
        period = (h === 12 || (h >= 1 && h <= 7)) ? 'pm' : 'am';
    }
    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return h * 60 + min;
}

function toISO(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function toDisplay(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
    return s;
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

    const [customRowFlags, setCustomRowFlags] = useState({});

    const handleUpdateRow = (index, field, value) => {
        const updated = [...timetable];
        updated[index] = { ...updated[index], [field]: value };
        onChange(updated);
    };

    const handleTimeSelectChange = (idx, value) => {
        if (value === '__custom__') {
            setCustomRowFlags(prev => ({ ...prev, [idx]: true }));
            const updated = [...timetable];
            const current = updated[idx] || {};
            updated[idx] = {
                ...current,
                isCustom: true,
                time: current.time || '09:00 am to 10:00 am'
            };
            onChange(updated);
        } else {
            setCustomRowFlags(prev => ({ ...prev, [idx]: false }));
            const updated = [...timetable];
            const current = updated[idx] || {};
            updated[idx] = {
                ...current,
                time: value,
                isCustom: false
            };
            onChange(updated);
        }
    };

    const handleResetToPreset = (idx) => {
        setCustomRowFlags(prev => ({ ...prev, [idx]: false }));
        const updated = [...timetable];
        const current = updated[idx] || {};
        const fallback = STANDARD_TIME_SLOTS.includes(current.time) ? current.time : '09:00 am to 10:00 am';
        updated[idx] = {
            ...current,
            time: fallback,
            isCustom: false
        };
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
            subjectName: '',
            isCustom: false
        };
        onChange([...timetable, nextRow]);
    };

    const handleRemoveRow = (index) => {
        if (timetable.length <= 1) return;
        setCustomRowFlags(prev => {
            const next = {};
            timetable.forEach((_, i) => {
                if (i < index && prev[i] !== undefined) next[i] = prev[i];
                else if (i > index && prev[i] !== undefined) next[i - 1] = prev[i];
            });
            return next;
        });
        const updated = timetable.filter((_, i) => i !== index);
        onChange(updated);
    };

    // Sorts rows by date then start time, so the printed ticket reads in the
    // order candidates actually sit the papers.
    const handleSortByDate = () => {
        setCustomRowFlags({});
        const sorted = [...timetable].sort((a, b) => {
            const d = toISO(a.date).localeCompare(toISO(b.date));
            if (d !== 0) return d;
            return timeToMinutes(a.time) - timeToMinutes(b.time);
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
            <style jsx>{`
                .tt-field-grid {
                    /* Date and the two short-code fields don't need much room;
                       Catalog Subject (a full course name) gets the rest. Fixed
                       tracks, not auto-fit, so all 5 fields share one row instead
                       of one wrapping alone onto its own line. */
                    grid-template-columns: 118px 150px 1.6fr 1fr 0.9fr;
                }
                @media (max-width: 900px) {
                    .tt-field-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 480px) {
                    .tt-field-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
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

            {/* Timetable rows: a responsive card grid, not a <table>. A table
                with 5 real-content columns has no honest way to fit a narrow
                container — either columns get compressed below a usable
                width (the native <input list="..."> dropdown arrow overlaps
                the value) or the table is given a min-width and forces a
                horizontal scrollbar. A CSS grid with auto-fit columns just
                reflows fields onto more lines as the container narrows, so
                everything stays readable in one vertical scroll — no
                horizontal scroll, ever. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {timetable.map((row, idx) => {
                    const isCustom = customRowFlags[idx] ?? row.isCustom ?? (Boolean(row.time) && !STANDARD_TIME_SLOTS.includes(row.time));
                    // Fixed-height label (room for the longest 2-line label in this
                    // set, e.g. "SUBJECT CODE (EDITABLE)") so every field's input
                    // starts at the same y regardless of whether its own label
                    // happens to wrap to one line or two — that's what was making
                    // inputs across a row drift up/down against each other.
                    const fieldLabel = { fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'block', minHeight: '26px', lineHeight: '1.3' };
                    return (
                        <div key={idx} style={{ border: '1px solid var(--border-low)', borderRadius: '10px', padding: '12px', background: 'var(--surface)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)' }}>Subject {idx + 1}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRow(idx)}
                                    disabled={timetable.length <= 1}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: timetable.length > 1 ? 'pointer' : 'not-allowed',
                                        color: timetable.length > 1 ? '#EF4444' : 'var(--tx-dim)',
                                        padding: '2px',
                                        display: 'inline-flex',
                                        alignItems: 'center'
                                    }}
                                    title="Remove Subject"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>delete_outline</span>
                                </button>
                            </div>
                            {/* Explicit column sizes (not auto-fit) so all 5 fields
                                share one row on a normal-width panel instead of the
                                5th ("Subject Short") orphaning onto its own line —
                                auto-fit packs as many minmax(130px,1fr) tracks as fit
                                and wraps the remainder, which is exactly what
                                stranded it before. Breakpoints below collapse to 2
                                and then 1 column as the panel narrows. */}
                            <div className="tt-field-grid" style={{ display: 'grid', gap: '10px 12px' }}>
                                <div>
                                    <label style={fieldLabel}>Date (DD/MM/YYYY)</label>
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
                                            fontSize: '12px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Time Slot</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <select
                                            value={isCustom ? '__custom__' : (STANDARD_TIME_SLOTS.includes(row.time) ? row.time : '__custom__')}
                                            onChange={(e) => handleTimeSelectChange(idx, e.target.value)}
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
                                        {isCustom && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={row.time || ''}
                                                        placeholder="e.g. 09:30 am to 10:30 am"
                                                        onChange={(e) => handleUpdateRow(idx, 'time', e.target.value)}
                                                        onBlur={(e) => handleUpdateRow(idx, 'time', normalizeTimeRange(e.target.value))}
                                                        style={{
                                                            width: '100%',
                                                            padding: '4px 22px 4px 8px',
                                                            borderRadius: '6px',
                                                            border: '1.5px solid var(--primary)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--tx-main)',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                    {row.time && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRow(idx, 'time', '')}
                                                            title="Clear"
                                                            style={{
                                                                position: 'absolute',
                                                                right: '4px',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--tx-muted)',
                                                                fontSize: '11px',
                                                                padding: '2px',
                                                                lineHeight: 1
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '9.5px', color: 'var(--tx-dim)' }}>Quick:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(idx, 'time', '09:00 am to 10:00 am')}
                                                        style={{
                                                            background: row.time === '09:00 am to 10:00 am' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.08)',
                                                            color: row.time === '09:00 am to 10:00 am' ? '#FFFFFF' : 'var(--primary)',
                                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                                            borderRadius: '4px',
                                                            padding: '1px 5px',
                                                            fontSize: '9.5px',
                                                            cursor: 'pointer',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        9-10 AM
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(idx, 'time', '09:30 am to 10:30 am')}
                                                        style={{
                                                            background: row.time === '09:30 am to 10:30 am' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.08)',
                                                            color: row.time === '09:30 am to 10:30 am' ? '#FFFFFF' : 'var(--primary)',
                                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                                            borderRadius: '4px',
                                                            padding: '1px 5px',
                                                            fontSize: '9.5px',
                                                            cursor: 'pointer',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        9:30-10:30 AM
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(idx, 'time', '02:30 pm to 03:30 pm')}
                                                        style={{
                                                            background: row.time === '02:30 pm to 03:30 pm' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.08)',
                                                            color: row.time === '02:30 pm to 03:30 pm' ? '#FFFFFF' : 'var(--primary)',
                                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                                            borderRadius: '4px',
                                                            padding: '1px 5px',
                                                            fontSize: '9.5px',
                                                            cursor: 'pointer',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        2:30-3:30 PM
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetToPreset(idx)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: 'var(--tx-dim)',
                                                            textDecoration: 'underline',
                                                            fontSize: '9.5px',
                                                            cursor: 'pointer',
                                                            marginLeft: 'auto',
                                                            padding: '1px 2px'
                                                        }}
                                                        title="Switch back to preset dropdown"
                                                    >
                                                        Presets
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Catalog Subject Dropdown: choosing from here auto-fills code & short name */}
                                <div>
                                    <label style={fieldLabel}>Catalog Subject <span style={{ textTransform: 'none', fontWeight: 500 }}>(populates code &amp; name)</span></label>
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
                                                    // One atomic update, not two handleUpdateRow calls — each of
                                                    // those builds its own copy from the same (stale, pre-render)
                                                    // timetable array, so the second call's write clobbers the
                                                    // first's: only the last field set actually survives, leaving
                                                    // code/short-name mismatched (e.g. new code, stale old name).
                                                    const updated = [...timetable];
                                                    updated[idx] = {
                                                        ...updated[idx],
                                                        subjectCode: found.code,
                                                        subjectName: found.shortName || abbreviate(found.name) || found.name,
                                                    };
                                                    onChange(updated);
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
                                </div>
                                <div>
                                    <label style={fieldLabel}>Subject Code <span style={{ textTransform: 'none', fontWeight: 500 }}>(editable)</span></label>
                                        {/* Combobox, not a select: the list gives
                                            type-to-filter over the catalog, while the
                                            field stays a normal text input so the
                                            cursor can be placed and the code edited
                                            by hand - needed for elective variants
                                            like BCS613B that the catalog only holds
                                            generically as BXX613X. */}
                                        <input
                                            type="text"
                                            list="tt-subject-codes"
                                            value={row.subjectCode}
                                            placeholder="BCS601"
                                            onChange={(e) => handleCodeChange(idx, e.target.value)}
                                            style={{
                                                width: '100%',
                                                minWidth: '85px',
                                                padding: '5px 20px 5px 8px', // right space reserved for the native list-picker arrow, so it never overlaps typed text
                                                borderRadius: '6px',
                                                border: `1px solid ${
                                                    !row.subjectCode || lookup(row.subjectCode) ? 'var(--border)' : '#B45309'
                                                }`,
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                fontFamily: 'monospace',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        {row.subjectCode && (
                                            <div style={{
                                                marginTop: '3px',
                                                fontSize: '9.5px',
                                                lineHeight: 1.3,
                                                color: lookup(row.subjectCode) ? 'var(--tx-muted)' : '#B45309'
                                            }}>
                                                {lookup(row.subjectCode)
                                                    ? lookup(row.subjectCode).name
                                                    : 'Not in this class’s catalog'}
                                            </div>
                                        )}
                                </div>
                                <div>
                                    <label style={fieldLabel}>Subject (Short) <span style={{ textTransform: 'none', fontWeight: 500 }}>(editable)</span></label>
                                        {/* Also accepts a full subject name from the
                                            list - picking one sets the code and
                                            collapses this field to the abbreviation
                                            the ticket prints. Still free text, so a
                                            custom short name can be typed over it. */}
                                        <input
                                            type="text"
                                            list="tt-subject-names"
                                            value={row.subjectName}
                                            placeholder="CC"
                                            onChange={(e) => handleShortChange(idx, e.target.value)}
                                            style={{
                                                width: '100%',
                                                minWidth: '70px',
                                                padding: '5px 20px 5px 8px', // right space reserved for the native list-picker arrow, so it never overlaps typed text
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Shared option lists backing the two comboboxes above. Rendered
                    once rather than per row - the browser matches on both the
                    option value and its text, so typing "machine" finds BCS602
                    and typing "BCS" narrows by code. */}
                <datalist id="tt-subject-codes">
                    {options.map(o => (
                        <option key={`c-${o.code}`} value={o.code}>{o.name}</option>
                    ))}
                </datalist>
                <datalist id="tt-subject-names">
                    {options.map(o => (
                        <option key={`n-${o.code}`} value={o.name}>{o.code}</option>
                    ))}
                </datalist>
            </div>
        </div>
    );
}
