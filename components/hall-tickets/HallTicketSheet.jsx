import React from 'react';
import HallTicketCard from './HallTicketCard';

/**
 * HallTicketSheet — Represents an A4 Sheet containing up to 3 Hall Tickets,
 * separated by the exact scissors cutting line seen in the reference template.
 */
export default function HallTicketSheet({
    students = [],
    examMeta = {},
    timetable = [],
    pageNumber = 1,
    totalPages = 1
}) {
    return (
        <div
            className="aitm-a4-sheet"
            style={{
                width: '100%',
                maxWidth: '780px',
                minHeight: '1060px', // Proportional to A4 Portrait ratio
                backgroundColor: '#FFFFFF',
                margin: '0 auto 28px auto',
                padding: '24px 24px',
                boxSizing: 'border-box',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
            }}
        >
            {students.map((student, idx) => (
                <React.Fragment key={student.usn || idx}>
                    <div className="aitm-ticket-slot" style={{ flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <HallTicketCard
                            student={student}
                            examMeta={examMeta}
                            timetable={timetable}
                        />
                    </div>

                    {/* Scissor Cutting Line between tickets on the same sheet (Exact Courier monospace line matching PDF) */}
                    {idx < students.length - 1 && (
                        <div
                            className="aitm-cutting-line"
                            style={{
                                textAlign: 'center',
                                fontFamily: "'Courier New', Courier, monospace",
                                fontWeight: 'bold',
                                fontSize: '10.5px',
                                color: '#000000',
                                margin: '8px 0',
                                letterSpacing: '0.02em',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                userSelect: 'none'
                            }}
                            title="Scissor Cutting Guide"
                        >
                            -----------------------------------------X------------------------------------------------X--------------------------------------
                        </div>
                    )}
                </React.Fragment>
            ))}

            {/* If fewer than 3 students on the last page, render empty slots to maintain layout height */}
            {students.length < 3 && Array.from({ length: 3 - students.length }).map((_, i) => (
                <div className="aitm-ticket-slot aitm-empty-slot" key={`empty-${i}`} style={{ flex: '1 1 0', visibility: 'hidden' }} />
            ))}

            {/* Subtle sheet numbering in footer for screen preview */}
            <div
                className="screen-only-page-number"
                style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '16px',
                    fontSize: '10px',
                    color: '#9CA3AF',
                    fontFamily: 'sans-serif'
                }}
            >
                Page {pageNumber} of {totalPages}
            </div>
        </div>
    );
}
