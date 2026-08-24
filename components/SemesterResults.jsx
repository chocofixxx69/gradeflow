'use client';
import { useState, useMemo, useEffect } from 'react';
import { processStudentResults } from '../lib/semester-utils';
import { unifyGrade, getGradeDetails, getGradeBadgeTone } from '../lib/vtuGrades';
import { getOfficialCredit } from '../lib/vtu-curriculum-catalog';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { exportToExcel, exportToPDF, exportToCSV } from '../lib/export-utils';
import { supabase } from '../lib/supabase';

const COLORS = ['#16A34A', '#DC2626', '#FFBB28', '#D97706'];

export default function SemesterResults({ marks = [], scheme = '2022', studentName = 'Student', usn = '' }) {
    const [selectedSem, setSelectedSem] = useState('all');
    const [dynamicMarks, setDynamicMarks] = useState([]);
    
    // Fetch dynamic subjects mapped by scheme — uses subject_catalog (the actual scraped table)
    useEffect(() => {
        const fetchSubjects = async () => {
            if (!marks || marks.length === 0) {
                setDynamicMarks(marks);
                return;
            }
            const { data: subjects } = await supabase
                .from('subject_catalog')
                .select('subject_code, subject_name, credits')
                .eq('scheme', scheme);
                
            if (subjects && subjects.length > 0) {
                const subjectMap = {};
                subjects.forEach(s => subjectMap[s.subject_code.toUpperCase()] = s);
                
                const updatedMarks = marks.map(m => {
                    const code = (m.subject_code || m.code || '').toUpperCase();
                    const dbCatalogCredit = subjectMap[code]?.credits;
                    const dbMarkCredit = m.credits;
                    const offCr = getOfficialCredit(code, scheme, null, m.semester);
                    const finalCredits = (dbCatalogCredit != null && Number(dbCatalogCredit) > 0)
                        ? Number(dbCatalogCredit)
                        : ((dbMarkCredit != null && Number(dbMarkCredit) > 0)
                            ? Number(dbMarkCredit)
                            : (offCr !== null ? offCr : 3));
                    return {
                        ...m,
                        credits: finalCredits,
                        subject_name: m.subject_name || subjectMap[code]?.subject_name || m.name
                    };
                });
                setDynamicMarks(updatedMarks);
            } else {
                setDynamicMarks(marks);
            }
        };
        fetchSubjects();
    }, [marks, scheme]);

    const { grouped, stats, cgpa } = useMemo(() => {
        return processStudentResults(dynamicMarks, scheme);
    }, [dynamicMarks, scheme]);

    const semesters = Object.keys(grouped).sort((a, b) => a - b);

    const handleExportExcel = () => {
        const data = selectedSem === 'all' 
            ? semesters.map(sem => ({ 
                Semester: sem, SGPA: stats[sem].sgpa.toFixed(2), 
                Backlogs: stats[sem].backlogs, 
                Credits: stats[sem].earnedCredits + '/' + stats[sem].totalCredits 
              }))
            : grouped[selectedSem].map(m => ({
                Code: m.subject_code || m.code,
                Subject: m.subject_name || m.name,
                Internal: m.internal ?? m.cie_marks ?? 0,
                External: m.external ?? m.see_marks ?? 0,
                Total: m.total ?? m.total_marks ?? 0,
                Grade: m.grade,
                Status: unifyGrade(m.grade)
              }));
        
        exportToExcel(data, `${usn || 'Student'}_Sem_${selectedSem}_Results.xlsx`);
    };

    const handleExportPDF = () => {
        const title = selectedSem === 'all' ? 'Academic Transcript' : `Semester ${selectedSem} Result`;
        const subtitle = `${studentName} (${usn}) - Scheme ${scheme}`;
        const columns = selectedSem === 'all' 
            ? ['Semester', 'SGPA', 'Backlogs', 'Credits Attempted', 'Credits Earned']
            : ['Code', 'Subject', 'Internal', 'External', 'Total', 'Status'];
        
        const data = selectedSem === 'all'
            ? semesters.map(sem => [sem, stats[sem].sgpa.toFixed(2), stats[sem].backlogs, stats[sem].totalCredits, stats[sem].earnedCredits])
            : grouped[selectedSem].map(m => [
                m.subject_code || m.code, m.subject_name || m.name, 
                m.internal ?? m.cie_marks ?? 0, m.external ?? m.see_marks ?? 0, 
                m.total ?? m.total_marks ?? 0, unifyGrade(m.grade)
              ]);

        exportToPDF({ title, subtitle, columns, data, fileName: `${usn || 'Student'}_Results.pdf` });
    };

    const handleExportSheets = () => {
        const data = selectedSem === 'all' 
            ? semesters.map(sem => ({ Semester: sem, SGPA: stats[sem].sgpa.toFixed(2), Backlogs: stats[sem].backlogs }))
            : grouped[selectedSem].map(m => ({ 
                Code: m.subject_code || m.code, 
                Subject: m.subject_name || m.name, 
                Total: m.total ?? m.total_marks ?? 0, 
                Grade: m.grade 
              }));
        exportToCSV(data, `${usn || 'Student'}_Sheets_Import.csv`);
    };
    
    if (semesters.length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                No semester records found.
            </div>
        );
    }

    // Prepare data for Chart
    const currentStats = selectedSem === 'all' 
        ? semesters.reduce((acc, sem) => {
            acc.passed += stats[sem].subjectCount - stats[sem].backlogs;
            acc.failed += stats[sem].backlogs;
            return acc;
          }, { passed: 0, failed: 0 })
        : { 
            passed: stats[selectedSem].subjectCount - stats[selectedSem].backlogs, 
            failed: stats[selectedSem].backlogs 
          };

    const chartData = [
        { name: 'Passed', value: currentStats.passed },
        { name: 'Failed', value: currentStats.failed },
    ].filter(d => d.value > 0);

    return (
        <div className="gf-fade-up" style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '16px' }}>Semester performance</h3>
            
            {/* Semester Tabs */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px' }}>
                <button 
                    onClick={() => setSelectedSem('all')}
                    style={tabBtnStyle(selectedSem === 'all')}
                >
                    Overall
                </button>
                {semesters.map(sem => (
                    <button 
                        key={sem}
                        onClick={() => setSelectedSem(sem)}
                        style={tabBtnStyle(selectedSem === sem)}
                    >
                        Sem {sem}
                    </button>
                ))}
            </div>

            <div className="gf-two-col" style={{ alignItems: 'start' }}>
                {/* Left: Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {selectedSem === 'all' ? (
                        <div className="gf-table-wrap">
                            <table className="gf-table">
                                <thead>
                                    <tr>
                                        <th>Semester</th>
                                        <th>SGPA</th>
                                        <th>Backlogs</th>
                                        <th>Credits Attempted</th>
                                        <th>Credits Earned</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {semesters.map(sem => (
                                        <tr key={sem}>
                                            <td style={{ fontWeight: 700 }}>Semester {sem}</td>
                                            <td style={{ color: 'var(--primary)', fontWeight: 800 }}>{stats[sem].sgpa.toFixed(2)}</td>
                                            <td>
                                                {stats[sem].backlogs > 0 ? (
                                                    <span className="gf-badge gf-badge-red">{stats[sem].backlogs}</span>
                                                ) : (
                                                    <span className="gf-badge gf-badge-stone">Clear</span>
                                                )}
                                            </td>
                                            <td>{stats[sem].earnedCredits} / {stats[sem].totalCredits}</td>
                                            <td>{stats[sem].earnedCredits}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <>
                            <div className="gf-table-wrap gf-desktop-table-wrap">
                                <table className="gf-table">
                                    <thead>
                                        <tr>
                                            <th>Subject</th>
                                            <th>CR</th>
                                            <th>Internal</th>
                                            <th>External</th>
                                            <th>Total</th>
                                            <th>Grade</th>
                                            <th>GP</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grouped[selectedSem].map((m, idx) => {
                                            const details = getGradeDetails(m, scheme);
                                            const offCr = getOfficialCredit(m.subject_code || m.code, scheme, null, Number(selectedSem));
                                            const displayCr = offCr !== null ? offCr : (m.credits || 0);
                                            return (
                                                <tr key={idx}>
                                                    <td>
                                                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{m.subject_name || m.name}</div>
                                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontFamily: 'monospace' }}>{m.subject_code || m.code}</div>
                                                    </td>
                                                    <td style={{ fontWeight: 700 }}>{displayCr}</td>
                                                    <td>{m.internal ?? m.cie_marks ?? '—'}</td>
                                                    <td>{m.external ?? m.see_marks ?? '—'}</td>
                                                    <td style={{ fontWeight: 800 }}>{m.total ?? m.total_marks ?? '—'}</td>
                                                    <td>
                                                        <span className={`gf-badge ${details.isPass ? 'gf-badge-green' : 'gf-badge-red'}`} style={{ fontWeight: 800 }}>
                                                            {details.grade}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 700 }}>{details.gpFormatted}</td>
                                                    <td>
                                                        <span className={`gf-badge ${details.isPass ? 'gf-badge-green' : 'gf-badge-red'}`}>
                                                            {details.isPass ? 'Pass' : 'Fail'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="gf-mobile-subject-list">
                                {grouped[selectedSem].map((m, idx) => {
                                    const details = getGradeDetails(m, scheme);
                                    const offCr = getOfficialCredit(m.subject_code || m.code, scheme, null, Number(selectedSem));
                                    const displayCr = offCr !== null ? offCr : (m.credits || 0);
                                    return (
                                        <div key={idx} className="gf-mobile-subject-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                <div>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--tx-dim)' }}>
                                                        {m.subject_code || m.code}
                                                    </div>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', wordBreak: 'break-word' }}>
                                                        {m.subject_name || m.name}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <span className={`gf-badge ${details.isPass ? 'gf-badge-green' : 'gf-badge-red'}`} style={{ fontWeight: 800 }}>
                                                        {details.grade}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-low)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', marginTop: '8px' }}>
                                                <div><span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Credits:</span> {displayCr}</div>
                                                <div><span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Total:</span> <strong>{m.total ?? m.total_marks ?? '—'}</strong></div>
                                                <div><span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>GP:</span> <strong>{details.gpFormatted}</strong></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Right: Chart & Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="gf-card" style={{ padding: '20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '16px' }}>
                            {selectedSem === 'all' ? 'Overall Statistics' : `Semester ${selectedSem} Stats`}
                        </div>
                        
                        {chartData.length > 0 ? (
                            <div style={{ height: '220px', width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: '12px' }}>
                                No subject data to chart
                            </div>
                        )}

                        <div className="gf-divider" style={{ margin: '16px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-muted)' }}>
                                {selectedSem === 'all' ? 'CGPA' : 'SGPA'}
                            </span>
                            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>
                                {(selectedSem === 'all' ? cgpa : stats[selectedSem].sgpa).toFixed(2)}
                            </span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-muted)' }}>Backlogs</span>
                            <span style={{ 
                                fontSize: '14px', 
                                fontWeight: 800, 
                                color: (selectedSem === 'all' ? semesters.reduce((a, s) => a + stats[s].backlogs, 0) : stats[selectedSem].backlogs) > 0 ? 'var(--red)' : 'var(--green)' 
                            }}>
                                {selectedSem === 'all' ? semesters.reduce((a, s) => a + stats[s].backlogs, 0) : stats[selectedSem].backlogs}
                            </span>
                        </div>
                    </div>

                    {/* Export Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleExportExcel} className="gf-btn gf-btn-ghost" style={{ flex: 1, fontSize: '12px', height: '36px' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>download</span>
                            Excel
                        </button>
                        <button onClick={handleExportPDF} className="gf-btn gf-btn-ghost" style={{ flex: 1, fontSize: '12px', height: '36px' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>picture_as_pdf</span>
                            PDF
                        </button>
                        <button onClick={handleExportSheets} className="gf-btn gf-btn-ghost" style={{ flex: 1, fontSize: '12px', height: '36px' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>table_view</span>
                            Sheets
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function tabBtnStyle(active) {
    return {
        padding: '8px 16px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--primary)' : 'var(--surface-low)',
        color: active ? 'var(--bg)' : 'var(--tx-muted)',
        fontWeight: 700,
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s'
    };
}
