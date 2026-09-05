import React, { useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui/Foundation';

const STANDARD_TIME_SLOTS = [
    '10:00 am to 11:00 am',
    '02:30 pm to 03:30 pm',
    '10:00 am to 11:30 am',
    '02:00 pm to 03:30 pm',
    '09:30 am to 12:30 pm',
    '02:00 pm to 05:00 pm'
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['M','T','W','T','F','S','S'];

// The timetable stores dates as DD/MM/YYYY because that is what the printed hall
// ticket shows and what the PDF writer expects. <input type="date"> speaks
// ISO, so convert at the boundary rather than changing the stored format and
// breaking HallTicketCard and the PDF.
function toISO(ddmmyyyy) {
    const m = String(ddmmyyyy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function toDisplay(iso) {
    const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Monday-first weekday index, so the grid matches how a timetable is read. */
function mondayIndex(jsDay) {
    return (jsDay + 6) % 7;
}

/**
 * "Cloud Computing (Open Stack /Google)" -> "CC"
 * "Natural Language Processing"          -> "NLP"
 * Initials of the significant words, which is the convention the printed
 * ticket already uses (CC, ML, CV, TRES).
 */
function abbreviate(name) {
    const STOP = new Set(['AND', 'OF', 'THE', 'FOR', 'IN', 'TO', 'A', 'AN', '&', 'WITH', 'USING']);
    const words = String(name || '')
        .replace(/\(.*?\)/g, ' ')          // drop parenthetical asides
        .replace(/[^A-Za-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean)
        .filter(w => !STOP.has(w.toUpperCase()));
    if (!words.length) return '';
    if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
    return words.map(w => w[0].toUpperCase()).join('').slice(0, 5);
}

/**
 * VTU catalogues elective slots generically - BXX613X "Professional Elective
 * Course" - while a student actually sits a specific variant such as BCS613B or
 * BEE654B. Mirrors the mapping in lib/subjectCreditResolver.js so a real
 * elective code is recognised as belonging to its family rather than being
 * flagged as unknown.
 */
function electiveFamilyKey(code) {
    const m = String(code || '').toUpperCase().match(/^(\d*B)[A-Z]{2,3}(\d{3})[A-Z]?$/);
    return m ? `${m[1]}XX${m[2]}X` : null;
}

/**
 * Compact month view of the exam schedule.
 *
 * Deliberately not a date picker - each row already has a native date input,
 * which gives the OS picker for free and is more accessible than anything
 * hand-rolled. What was missing is the overview: whether the papers are spread
 * sensibly, and whether two of them collide in the same slot on the same day.
 */
function ScheduleCalendar({ timetable, activeMonth, onMonthChange }) {
    const byDay = useMemo(() => {
        const map = new Map();
        (timetable || []).forEach((row, idx) => {
            const iso = toISO(row.date);
            if (!iso) return;
            if (!map.has(iso)) map.set(iso, []);
            map.get(iso).push({ ...row, idx });
        });
        return map;
    }, [timetable]);

    const { year, month } = activeMonth;
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = mondayIndex(first.getDay());

    const cells = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const pad = n => String(n).padStart(2, '0');

    return (
        <div style={{
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 12px',
            background: 'var(--surface)',
            minWidth: '240px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => onMonthChange(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', fontSize: '16px', lineHeight: 1, padding: '2px 6px' }}
                >‹</button>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>
                    {MONTH_NAMES[month]} {year}
                </div>
                <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => onMonthChange(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', fontSize: '16px', lineHeight: 1, padding: '2px 6px' }}
                >›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {WEEKDAYS.map((w, i) => (
                    <div key={`wd-${i}`} style={{ textAlign: 'center', fontSize: '9.5px', fontWeight: 700, color: 'var(--tx-muted)', paddingBottom: '2px' }}>
                        {w}
                    </div>
                ))}
                {cells.map((d, i) => {
                    if (d === null) return <div key={`e-${i}`} />;
                    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
                    const exams = byDay.get(iso) || [];
                    const slots = exams.map(e => (e.time || '').trim().toLowerCase());
                    const hasCollision = new Set(slots).size !== slots.length;
                    const has = exams.length > 0;

                    return (
                        <div
                            key={iso}
                            title={has
                                ? exams.map(e => `${e.time || '—'} · ${e.subjectCode || 'unset'}`).join('\n') +
                                  (hasCollision ? '\n\nTwo papers share a slot on this day.' : '')
                                : undefined}
                            style={{
                                position: 'relative',
                                aspectRatio: '1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10.5px',
                                fontWeight: has ? 800 : 500,
                                borderRadius: '5px',
                                color: has ? '#FFFFFF' : 'var(--tx-dim)',
                                background: hasCollision ? '#DC2626' : has ? 'var(--primary)' : 'transparent',
                                cursor: has ? 'help' : 'default'
                            }}
                        >
                            {d}
                            {exams.length > 1 && (
                                <span style={{
                                    position: 'absolute', bottom: '1px', right: '2px',
                                    fontSize: '7.5px', fontWeight: 900, lineHeight: 1
                                }}>
                                    {exams.length}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
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

    // The calendar opens on the month of the first scheduled paper, falling back
    // to today when the table is empty.
    const firstISO = timetable.map(r => toISO(r.date)).filter(Boolean).sort()[0];
    const [activeMonth, setActiveMonth] = useState(() => {
        const base = firstISO ? new Date(firstISO) : new Date();
        return { year: base.getFullYear(), month: base.getMonth() };
    });

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

            {/* Schedule summary: reads the same data the tickets will print. */}
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

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Timetable Rows Table */}
            <div style={{ flex: '1 1 460px', minWidth: 0, overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '115px' }}>Date (DD/MM/YYYY)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '150px' }}>Time Slot</th>
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
                        {timetable.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-low)', background: 'var(--surface)' }}>
                                <td style={{ padding: '6px 10px' }}>
                                    {/* Native date input: gives the OS calendar
                                        picker and rejects impossible dates, which
                                        free text could not. Stored back as
                                        DD/MM/YYYY, the format the ticket prints. */}
                                    <input
                                        type="date"
                                        value={toISO(row.date)}
                                        onChange={(e) => handleUpdateRow(idx, 'date', toDisplay(e.target.value))}
                                        style={{
                                            width: '100%',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: `1px solid ${toISO(row.date) ? 'var(--border)' : '#B45309'}`,
                                            background: 'var(--surface)',
                                            color: 'var(--tx-main)',
                                            fontSize: '12px'
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                    {/* One control instead of a text box beside a
                                        separate "Presets" dropdown that only wrote
                                        into it. Custom reveals the free-text field
                                        for a slot outside the standard set. */}
                                    {(() => {
                                        const isStandard = STANDARD_TIME_SLOTS.includes(row.time);
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <select
                                                    value={isStandard ? row.time : '__custom__'}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        handleUpdateRow(idx, 'time', v === '__custom__' ? '' : v);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        minWidth: '150px',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface)',
                                                        color: 'var(--tx-main)',
                                                        fontSize: '12px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {STANDARD_TIME_SLOTS.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                    <option value="__custom__">Custom time…</option>
                                                </select>
                                                {!isStandard && (
                                                    <input
                                                        type="text"
                                                        value={row.time}
                                                        placeholder="e.g. 11:00 am to 12:30 pm"
                                                        onChange={(e) => handleUpdateRow(idx, 'time', e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--tx-main)',
                                                            fontSize: '12px'
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })()}
                                </td>
                                {/* Catalog Subject Dropdown: choosing from here auto-fills code & short name */}
                                <td style={{ padding: '6px 10px' }}>
                                    <select
                                        value={
                                            catalogSubjects.some(s => s.code?.toUpperCase() === (row.subjectCode || '').toUpperCase())
                                                ? (row.subjectCode || '').toUpperCase()
                                                : ''
                                        }
                                        onChange={(e) => {
                                            const selectedCode = e.target.value;
                                            if (!selectedCode) return;
                                            const found = catalogSubjects.find(s => s.code?.toUpperCase() === selectedCode.toUpperCase());
                                            if (found) {
                                                handleUpdateRow(idx, 'subjectCode', found.code);
                                                handleUpdateRow(idx, 'subjectName', found.shortName || found.name);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '4px 8px',
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
                                <td style={{ padding: '6px 10px' }}>
                                    <input
                                        type="text"
                                        value={row.subjectCode}
                                        placeholder="BCS601"
                                        onChange={(e) => handleUpdateRow(idx, 'subjectCode', e.target.value.toUpperCase())}
                                        style={{
                                            width: '100%',
                                            minWidth: '85px',
                                            padding: '4px 8px',
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
                                <td style={{ padding: '6px 10px' }}>
                                    <input
                                        type="text"
                                        value={row.subjectName}
                                        placeholder="CC"
                                        onChange={(e) => handleUpdateRow(idx, 'subjectName', e.target.value)}
                                        style={{
                                            width: '100%',
                                            minWidth: '70px',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            color: 'var(--tx-main)',
                                            fontSize: '12px',
                                            fontWeight: 700
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '6px 6px', textAlign: 'center' }}>
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
                        ))}
                    </tbody>
                </table>
            </div>

            <ScheduleCalendar
                timetable={timetable}
                activeMonth={activeMonth}
                onMonthChange={setActiveMonth}
            />
            </div>
        </div>
    );
}
