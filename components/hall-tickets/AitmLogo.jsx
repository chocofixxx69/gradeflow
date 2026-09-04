import React from 'react';

/**
 * AitmLogo — Official Anjuman Institute of Technology & Management (AITM), Bhatkal crest emblem.
 * Uses the high-resolution institutional logo image with exact proportions.
 */
export default function AitmLogo({ width = 72, height = 72, className = '', style = {} }) {
    return (
        <img
            src="/aitm-logo.png"
            alt="Anjuman Institute of Technology & Management (AITM)"
            width={width}
            height={height}
            className={className}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                height: typeof height === 'number' ? `${height}px` : height,
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
                ...style
            }}
        />
    );
}
