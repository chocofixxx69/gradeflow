'use client';
import { useMemo } from 'react';
import { processStudentResults } from '../lib/semester-utils';
import { exportToExcel } from '../lib/export-utils';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ClassSemesterSummary({ students = [], allMarks = [], selectedSem }) {
    const [dynamicMarks, setDynamicMarks] = useState([]);
    
    // Process marks dynamically based on live subjects DB
    useEffect(() => {
        const fetchDynamicSubjects = async () => {
            if (!allMarks || allMarks.length === 0) return;
            const schemes = [...new Set(students.map(s => s.scheme || '2022'))];
            const { data: subjects } = await supabase.from('subjects').select('*').in('scheme', schemes);
            
            if (subjects && subjects.length > 0) {
                const map = {};
                subjects.forEach(s => map[`${s.scheme}_${s.code.toUpperCase()}`] = s);
                
                // create a map for student usn -> scheme for quick lookup
                const usnSchemeMap = {};
                students.forEach(s => usnSchemeMap[s.usn] = s.scheme || '2022');
                
                const mapped = allMarks.map(m => {
                    const sch = usnSchemeMap[m.usn];
                    const code = (m.subject_code || m.code || '').toUpperCase();
                    const sub = map[`${sch}_${code}`];
                    return sub ? { ...m, credits: sub.credits } : m;
                });
                setDynamicMarks(mapped);
            } else {
                setDynamicMarks(allMarks);
            }
        };
        fetchDynamicSubjects();
    }, [allMarks, students]);

    const summaryData = useMemo(() => {
        const map = {};
        const marksByUsn = {};
        dynamicMarks.forEach(m => {
            if (!marksByUsn[m.usn]) marksByUsn[m.usn] = [];
            marksByUsn[m.usn].push(m);
        });

        students.forEach(s => {
            const studentMarks = marksByUsn[s.usn] || [];
            map[s.usn] = processStudentResults(studentMarks, s.scheme || '2022');
        });
        
        return map;
    }, [students, dynamicMarks]);

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
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
