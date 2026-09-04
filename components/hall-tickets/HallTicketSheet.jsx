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
                    <div style={{ flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <HallTicketCard
                            student={student}
                            examMeta={examMeta}
                            timetable={timetable}
                        />
                    </div>

                    {/* Scissor Cutting Line between tickets on the same sheet (Single line, perfectly stretched, no wrapping) */}
                    {idx < students.length - 1 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                margin: '10px 0 14px 0',
                                color: '#1F2937',
                                userSelect: 'none',
                                overflow: 'hidden',
                                width: '100%'
                            }}
                            title="Scissor Cutting Guide"
                        >
                            <div style={{ flex: 1, borderBottom: '1.2px dashed #4B5563' }} />
                            <span style={{ padding: '0 12px', fontSize: '11px', fontWeight: 900, fontFamily: 'monospace', color: '#111827' }}>X</span>
                            <div style={{ flex: 1.2, borderBottom: '1.2px dashed #4B5563' }} />
                            <span style={{ padding: '0 12px', fontSize: '11px', fontWeight: 900, fontFamily: 'monospace', color: '#111827' }}>X</span>
                            <div style={{ flex: 1, borderBottom: '1.2px dashed #4B5563' }} />
                        </div>
                    )}
                </React.Fragment>
            ))}

            {/* If fewer than 3 students on the last page, render empty slots to maintain layout height */}
            {students.length < 3 && Array.from({ length: 3 - students.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{ flex: '1', visibility: 'hidden' }} />
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
