'use client';

export default function GradeFlowLogo({ size = 36, showText = false, textRole = '' }) {
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div
                className="gf-logo-box"
                aria-hidden="true"
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    position: 'relative',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                }}
            >
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 44 44"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: '100%', height: '100%', display: 'block' }}
                >
                    <defs>
                        <linearGradient id="gfLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1E6568" />
                            <stop offset="60%" stopColor="#144648" />
                            <stop offset="100%" stopColor="#0B2B2D" />
                        </linearGradient>
                        <linearGradient id="gfFlowGrad" x1="15%" y1="85%" x2="85%" y2="15%">
                            <stop offset="0%" stopColor="#2DD4BF" />
                            <stop offset="50%" stopColor="#5EEAD4" />
                            <stop offset="100%" stopColor="#FFFFFF" />
                        </linearGradient>
                    </defs>

                    {/* Outer rounded squircle background with subtle highlight rim */}
                    <rect width="44" height="44" rx="11" fill="url(#gfLogoBg)" />
                    <rect x="0.75" y="0.75" width="42.5" height="42.5" rx="10.25" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1.5" />

                    {/* Academic Graduation Chevron Cap */}
                    <path
                        d="M22 10L33 16.5L22 23L11 16.5L22 10Z"
                        fill="url(#gfFlowGrad)"
                        fillOpacity="0.95"
                    />

                    {/* Dynamic Academic "G" Flow Loop wrapping underneath */}
                    <path
                        d="M33 21.5V26.5C33 30.5 28.5 34 22 34C15.5 34 11 30.5 11 26.5V22L15 24.3V26.5C15 28.2 18 30.2 22 30.2C26 30.2 29 28.2 29 26.5V22.5H22V19.2H33V21.5Z"
                        fill="#FFFFFF"
                    />

                    {/* Precision Academic Intelligence Accent Node */}
                    <circle cx="33" cy="16.5" r="2.2" fill="#5EEAD4" />
                </svg>
            </div>

            {showText && (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        color: 'var(--tx-main)',
                        lineHeight: 1.15
                    }}>
                        GradeFlow
                    </span>
                    {textRole && (
                        <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: 'var(--tx-dim)',
                            marginTop: '2px'
                        }}>
                            {textRole}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
