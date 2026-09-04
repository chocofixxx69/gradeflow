import React from 'react';
import { Button, Input } from '@/components/ui/Foundation';

const STANDARD_TIME_SLOTS = [
    '10:00 am to 11:00 am',
    '02:30 pm to 03:30 pm',
    '10:00 am to 11:30 am',
    '02:00 pm to 03:30 pm',
    '09:30 am to 12:30 pm',
    '02:00 pm to 05:00 pm'
];

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

            {/* Timetable Rows Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
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
                                    <input
                                        type="text"
                                        value={row.date}
                                        placeholder="24/03/2026"
                                        onChange={(e) => handleUpdateRow(idx, 'date', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            color: 'var(--tx-main)',
                                            fontSize: '12px',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={row.time}
                                            placeholder="10:00 am to 11:00 am"
                                            onChange={(e) => handleUpdateRow(idx, 'time', e.target.value)}
                                            style={{
                                                flex: 1,
                                                minWidth: '130px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) handleUpdateRow(idx, 'time', e.target.value);
                                            }}
                                            defaultValue=""
                                            style={{
                                                maxWidth: '85px',
                                                padding: '4px 4px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface-low)',
                                                color: 'var(--tx-muted)',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="" disabled>Presets</option>
                                            {STANDARD_TIME_SLOTS.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
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
        </div>
    );
}
