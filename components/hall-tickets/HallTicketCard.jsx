import React from 'react';
import AitmLogo from './AitmLogo';
import { canonicalBranchCode, extractBranchFromUsn } from '@/lib/semester-utils';

/**
 * HallTicketCard — Exact reproduction of the official Anjuman Institute of Technology & Management
 * (AITM), Bhatkal Hall Ticket template.
 *
 * Designed with precise proportions to allow exactly 3 tickets per standard A4 portrait sheet.
 */
export default function HallTicketCard({
    student = {
        usn: '2AB23CS001',
        name: 'ABDUL NAFEH',
        branch: 'Computer Science and Engineering',
        photo_url: null
    },
    examMeta = {
        title: 'VI Semester IA-1 MARCH 2026 Examination',
        department: 'Department of Computer Science and Engineering',
        collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
        collegeAddress: 'Anjumanabad, Bhatkal-582320'
    },
    timetable = [
        { date: '24/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS601', subjectName: 'CC' },
        { date: '24/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS602', subjectName: 'ML' },
        { date: '25/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS613B', subjectName: 'CV' },
        { date: '25/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BEE654B', subjectName: 'TRES' }
    ]
}) {
    // Canonical branch code, resolved identically to the rest of the app.
    // The previous rule ("contains 'computer' and longer than 25 characters ->
    // CS, otherwise print the raw text") printed two different labels for one
    // class - "CS" for a student stored as "CS" and "Computer Science (CSE)"
    // for the next - and stamped "CS" on AI & ML tickets, because it fell
    // through to the default for every non-computer branch.
    const branchDisplay =
        canonicalBranchCode(student.branch_code)
        || canonicalBranchCode(extractBranchFromUsn(student.usn))
        || canonicalBranchCode(student.branch)
        || '—';

    return (
        <div
            className="aitm-hall-ticket-card"
            style={{
                width: '100%',
                maxWidth: '740px',
                margin: '0 auto',
                fontFamily: "'Times New Roman', Times, serif, Arial",
                color: '#000000',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
                pageBreakInside: 'avoid'
            }}
        >
            {/* Outer Box with Standard Institutional Border */}
            <div className="aitm-card-outer-box" style={{ border: '1.5px solid #000000', boxSizing: 'border-box' }}>
                {/* 1. Header Row (Logo + College Info) */}
                <div className="aitm-card-header-row" style={{ display: 'grid', gridTemplateColumns: '95px 1fr', borderBottom: '1.5px solid #000000' }}>
                    {/* Left Logo Box */}
                    <div className="aitm-card-logo-box" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        borderRight: '1.5px solid #000000',
                        backgroundColor: '#FFFFFF'
                    }}>
                        <img
                            className="aitm-card-logo-img"
                            src="/aitm-logo.png"
                            alt="AITM Crest"
                            style={{
                                width: '70px',
                                height: '70px',
                                objectFit: 'contain',
                                display: 'block'
                            }}
                        />
                    </div>

                    {/* Right Header Texts */}
                    <div className="aitm-card-header-text" style={{ padding: '6px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div className="aitm-card-college-name" style={{ fontSize: '13px', fontWeight: '900', letterSpacing: '0.01em', textTransform: 'uppercase', lineHeight: 1.25 }}>
                            {examMeta.collegeName || 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT'}
                        </div>
                        <div className="aitm-card-college-address" style={{ fontSize: '10.5px', marginTop: '2px', color: '#111827' }}>
                            {examMeta.collegeAddress || 'Anjumanabad, Bhatkal-582320'}
                        </div>
                        <div className="aitm-card-dept-name" style={{ fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>
                            {examMeta.department || 'Department of Computer Science & Engineering'}
                        </div>
                        <div className="aitm-card-hall-ticket-label" style={{ fontSize: '12px', fontWeight: '900', marginTop: '3px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            HALL TICKET
                        </div>
                    </div>
                </div>

                {/* 2. Examination Title Banner */}
                <div className="aitm-card-banner" style={{
                    borderBottom: '1.5px solid #000000',
                    textAlign: 'center',
                    padding: '3.5px 8px',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    letterSpacing: '0.02em',
                    backgroundColor: '#FAFAFA'
                }}>
                    {examMeta.title || 'VI Semester IA-1 MARCH 2026 Examination'}
                </div>

                {/* 3. Student Details Row 1: Branch + USN */}
                <div className="aitm-card-meta-row" style={{ display: 'grid', gridTemplateColumns: '70px 1fr 55px 140px', borderBottom: '1.5px solid #000000', fontSize: '11px' }}>
                    <div style={{ padding: '3.5px 6px', fontWeight: '800', borderRight: '1.5px solid #000000' }}>
                        Branch
                    </div>
                    <div style={{ padding: '3.5px 8px', borderRight: '1.5px solid #000000', fontWeight: '500' }}>
                        {branchDisplay}
                    </div>
                    <div style={{ padding: '3.5px 6px', fontWeight: '800', borderRight: '1.5px solid #000000', textAlign: 'center' }}>
                        USN
                    </div>
                    <div style={{ padding: '3.5px 8px', fontWeight: '900', letterSpacing: '0.04em', fontFamily: 'monospace, "Times New Roman"' }}>
                        {student.usn}
                    </div>
                </div>

                {/* 4. Student Details Row 2: Name */}
                <div className="aitm-card-name-row" style={{ display: 'grid', gridTemplateColumns: '70px 1fr', borderBottom: '1.5px solid #000000', fontSize: '11.5px' }}>
                    <div style={{ padding: '3.5px 6px', fontWeight: '800', borderRight: '1.5px solid #000000' }}>
                        Name
                    </div>
                    <div style={{ padding: '3.5px 8px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {student.name}
                    </div>
                </div>

                {/* 5. Timetable Grid + Student Photo Block */}
                <div className="aitm-card-timetable-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 115px', minHeight: '100px' }}>
                    {/* Timetable Table */}
                    <div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                            <thead>
                                <tr style={{ borderBottom: '1.5px solid #000000', backgroundColor: '#FAFAFA' }}>
                                    <th style={{ width: '18%', padding: '3.5px 3px', fontWeight: '800', borderRight: '1.5px solid #000000' }}>Date</th>
                                    <th style={{ width: '29%', padding: '3.5px 3px', fontWeight: '800', borderRight: '1.5px solid #000000' }}>Time</th>
                                    <th style={{ width: '18%', padding: '3.5px 3px', fontWeight: '800', borderRight: '1.5px solid #000000' }}>Subject Code</th>
                                    <th style={{ width: '35%', padding: '3.5px 3px', fontWeight: '800' }}>Subject name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timetable.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: idx < timetable.length - 1 ? '1px solid #000000' : 'none' }}>
                                        <td style={{ padding: '3.5px 3px', borderRight: '1.5px solid #000000' }}>{row.date}</td>
                                        <td style={{ padding: '3.5px 3px', borderRight: '1.5px solid #000000' }}>{row.time}</td>
                                        <td style={{ padding: '3.5px 3px', borderRight: '1.5px solid #000000', fontFamily: 'Courier, monospace', fontWeight: 'bold' }}>{row.subjectCode}</td>
                                        <td style={{ padding: '3.5px 3px', fontWeight: 'bold' }}>{row.subjectName}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Student Photo Column */}
                    <div className="aitm-card-photo-box" style={{
                        borderLeft: '1.5px solid #000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px',
                        backgroundColor: '#FFFFFF'
                    }}>
                        {student.photo_url ? (
                            <img
                                src={student.photo_url}
                                alt={student.name}
                                style={{
                                    maxWidth: '85px',
                                    maxHeight: '98px',
                                    objectFit: 'cover',
                                    border: '1px solid #9CA3AF'
                                }}
                            />
                        ) : (
                            <div style={{
                                color: '#9CA3AF',
                                fontSize: '11px',
                                letterSpacing: '0.05em',
                                fontFamily: "'Times New Roman', serif"
                            }}>
                                [ Photo ]
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 6. Signatures Row with Generous Vertical Space for Physical Signatures */}
            <div className="aitm-card-signatures" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                padding: '38px 6px 4px 6px', /* ~10.5mm clear space matching PDF sigSpace */
                fontSize: '11px',
                fontWeight: '800'
            }}>
                <div style={{ textAlign: 'left' }}>
                    Signature of Class Advisor
                </div>
                <div style={{ textAlign: 'right' }}>
                    Signature of HoD
                </div>
            </div>
        </div>
    );
}
