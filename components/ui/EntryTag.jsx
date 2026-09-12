'use client';

/**
 * The one badge that says how a student entered the programme.
 *
 * VTU lateral entry IS the diploma route: a diploma holder is admitted straight
 * into the third semester, so semesters 1 and 2 never exist for them and they
 * graduate with the batch admitted the year before (lib/vtu-identity.js
 * resolveCohort). Faculty could previously only infer this from a 4xx serial in
 * the USN, which is exactly the kind of tribal knowledge a gazette should not
 * require — so every roster, gazette and transcript now labels it outright.
 */

const TONES = {
    diploma: {
        label: 'Diploma · Lateral Entry',
        short: 'Diploma',
        icon: 'school',
        fg: '#7C3AED',
        bg: 'rgba(124, 58, 237, 0.10)',
        border: 'rgba(124, 58, 237, 0.28)',
        title: 'Lateral entry — admitted into the 3rd semester on a diploma. Semesters 1 and 2 are not part of this student’s programme.'
    },
    regular: {
        label: 'Regular Intake',
        short: 'Regular',
        icon: 'person',
        fg: 'var(--tx-muted)',
        bg: 'var(--surface-low)',
        border: 'var(--border)',
        title: 'Regular intake — admitted into the 1st semester after PUC / 12th.'
    }
};

export function EntryTag({ lateral = false, compact = false, showRegular = false, style, ...props }) {
    if (!lateral && !showRegular) return null;
    const tone = lateral ? TONES.diploma : TONES.regular;

    return (
        <span
            title={tone.title}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: compact ? '3px' : '5px',
                padding: compact ? '1px 6px' : '3px 9px',
                borderRadius: '999px',
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                color: tone.fg,
                fontSize: compact ? '10px' : '11px',
                fontWeight: 800,
                letterSpacing: '0.02em',
                lineHeight: 1.6,
                whiteSpace: 'nowrap',
                ...style
            }}
            {...props}
        >
            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: compact ? '12px' : '13px' }}>
                {tone.icon}
            </span>
            {compact ? tone.short : tone.label}
        </span>
    );
}

/** Shorthand for the diploma case, which is the one that actually needs flagging. */
export function DiplomaTag(props) {
    return <EntryTag lateral compact {...props} />;
}

export default EntryTag;
