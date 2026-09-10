'use client';

import React from 'react';

/**
 * Escapes regex special characters safely
 */
function escapeRegex(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * HighlightMatch
 * Highlights substring matches in a string using GradeFlow's palette
 * (--warm-highlight: #B45309 and warm amber background #FEF3C7).
 */
export function HighlightMatch({ text, query, highlightStyle }) {
    if (!text && text !== 0) return null;
    const strText = String(text);
    if (!query || typeof query !== 'string') return <>{strText}</>;

    const trimmed = query.trim();
    if (!trimmed) return <>{strText}</>;

    const words = trimmed.split(/\s+/).filter(Boolean).map(escapeRegex);
    if (words.length === 0) return <>{strText}</>;

    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    const parts = strText.split(regex);

    const defaultStyle = {
        background: '#FEF3C7',
        color: 'var(--warm-highlight, #B45309)',
        borderBottom: '2px solid var(--warm-highlight, #B45309)',
        borderRadius: '2px',
        padding: '0 2px',
        fontWeight: 800,
        textDecoration: 'none'
    };

    return (
        <>
            {parts.map((part, i) => {
                const isMatch = words.some(w => new RegExp(`^${w}$`, 'i').test(part));
                if (isMatch) {
                    return (
                        <mark
                            key={i}
                            style={{ ...defaultStyle, ...highlightStyle }}
                        >
                            {part}
                        </mark>
                    );
                }
                return part;
            })}
        </>
    );
}

export default HighlightMatch;
