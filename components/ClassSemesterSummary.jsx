'use client';
import { processStudentResults } from '../lib/semester-utils';
import { exportToExcel } from '../lib/export-utils';
import { useState, useEffect } from 'react';
import { fetchCatalogIndex } from '../lib/subjectCreditResolver';
import { supabase } from '../lib/supabase';

export default function ClassSemesterSummary({ students = [], allMarks = [], selectedSem }) {
    const [summaryData, setSummaryData] = useState({});

    // Credits are resolved by the canonical engine (lib/vtuAcademicEngine.js) from
    // the live subject_catalog table — one catalog fetch for the whole roster,
    // not a separate lookup per student.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!students.length) {
                if (!cancelled) setSummaryData({});
                return;
            }

            const marksByUsn = {};
            allMarks.forEach(m => {
                if (!marksByUsn[m.usn]) marksByUsn[m.usn] = [];
                marksByUsn[m.usn].push(m);
            });

            const catalogIndex = await fetchCatalogIndex(supabase);

            const entries = await Promise.all(students.map(async s => {
                const studentMarks = marksByUsn[s.usn] || [];
                const result = await processStudentResults(studentMarks, s.scheme || '2022', { usn: s.usn, catalogIndex });
                return [s.usn, result];
            }));

            if (!cancelled) setSummaryData(Object.fromEntries(entries));
        })();
        return () => { cancelled = true; };
    }, [students, allMarks]);

    const handleExport = () => {
        const data = students.map(s => {
            const res = summaryData[s.usn];
            const stats = res?.stats[selectedSem] || { sgpa: 0, backlogs: 0, earnedCredits: 0 };
            return {
                USN: s.usn,
                Name: s.name,
                SGPA: stats.sgpa.toFixed(2),
                Backlogs: stats.backlogs,
                Credits: stats.earnedCredits,
                CGPA: res?.cgpa.toFixed(2) || '0.00'
            };
        });
        exportToExcel(data, `Class_Sem_${selectedSem}_Summary.xlsx`);
    };

    return (
        <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 900 }}>Class Semester Summary (Sem {selectedSem})</h3>
                <button onClick={handleExport} className="gf-btn gf-btn-ghost">
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>download</span>
                    Export Class Results
                </button>
            </div>

            <div className="gf-table-wrap">
                <table className="gf-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>SGPA</th>
                            <th>Backlogs</th>
                            <th>Credits</th>
                            <th>CGPA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map(s => {
                            const res = summaryData[s.usn];
                            const stats = res?.stats[selectedSem];
                            return (
                                <tr key={s.usn}>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{s.name}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontFamily: 'monospace' }}>{s.usn}</div>
                                    </td>
                                    <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                                        {stats ? stats.sgpa.toFixed(2) : '—'}
                                    </td>
                                    <td>
                                        {stats ? (
                                            stats.backlogs > 0 ? (
                                                <span className="gf-badge gf-badge-red">{stats.backlogs}</span>
                                            ) : (
                                                <span className="gf-badge gf-badge-stone">Clear</span>
                                            )
                                        ) : '—'}
                                    </td>
                                    <td>{stats ? `${stats.earnedCredits} / ${stats.totalCredits}` : '—'}</td>
                                    <td style={{ fontWeight: 700 }}>{res?.cgpa.toFixed(2) || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
