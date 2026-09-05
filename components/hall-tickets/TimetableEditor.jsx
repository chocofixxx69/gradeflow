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
    onAutoFill = () => {}
}) {
    const handleUpdateRow = (index, field, value) => {
        const updated = [...timetable];
        updated[index] = { ...updated[index], [field]: value };
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
                        style={{
                            background: 'var(--surface-low)',
                            color: 'var(--primary)',
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
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>auto_fix_high</span>
                        Auto-fill from Syllabus
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
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '190px' }}>Time Slot</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '110px' }}>Subject Code</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '95px' }}>Subject (Short)</th>
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
