'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Foundation';
import styles from './Landing.module.css';

export default function LandingPage() {
    return (
        <div className={styles.page}>
            {/* Header Navigation */}
            <header className={styles.nav}>
                <Link href="/" className={styles.logo}>
                    <div className={styles.logoBox}>G</div>
                    <div className={styles.logoInfo}>
                        <span className={styles.logoText}>GradeFlow</span>
                        <span className={styles.logoBadge}>Academic Intelligence</span>
                    </div>
                </Link>

                <nav className={styles.navCenter} aria-label="Landing Navigation">
                    <a href="#features" className={styles.navLink}>Features</a>
                    <a href="#portals" className={styles.navLink}>Portals</a>
                    <Link href="/calculator" className={styles.navLink}>Calculator</Link>
                    <Link href="/curriculum" className={styles.navLink}>Curriculum</Link>
                    <Link href="/guide" className={styles.navLink}>Guide</Link>
                </nav>

                <div className={styles.navRight}>
                    <Button as={Link} href="/auth" variant="ghost" size="sm">
                        Sign In
                    </Button>
                    <Button as={Link} href="/auth/student" variant="primary" size="sm" iconEnd="arrow_forward">
                        Student Access
                    </Button>
                </div>
            </header>

            {/* Hero Section */}
            <section className={`${styles.hero} gf-fade-up`}>
                <div className={styles.eyebrowBadge}>
                    <span className={`material-icons-round ${styles.eyebrowIcon}`}>verified</span>
                    VTU CGPA · SGPA · Academic Intelligence Platform
                </div>

                <h1 className={styles.heroTitle}>
                    Track it. <span className={styles.heroTitleAccent}>Understand it.</span>
                </h1>

                <p className={styles.heroSubtitle}>
                    GradeFlow calculates your SGPA and CGPA semester by semester, surfaces every pending backlog in real time, and turns VTU raw marks into actionable intelligence. Built specifically for VTU engineering students and faculty.
                </p>

                <div className={styles.heroCtaGroup}>
                    <Button
                        as={Link}
                        href="/auth/student"
                        variant="primary"
                        size="lg"
                        iconEnd="arrow_forward"
                        style={{ padding: '0 28px', height: '48px', fontSize: '15px' }}
                    >
                        Sign in as Student
                    </Button>
                    <Button
                        as={Link}
                        href="/faculty/login"
                        variant="secondary"
                        size="lg"
                        iconStart="school"
                        style={{ padding: '0 28px', height: '48px', fontSize: '15px' }}
                    >
                        Faculty Access
                    </Button>
                </div>

                <Link href="/calculator" className={styles.heroQuickLink}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>calculate</span>
                    Need a quick calculation? Try Open SGPA Calculator →
                </Link>

                {/* 3 Spotlight Feature Pillars */}
                <div className={styles.pillarGrid}>
                    <div className={styles.pillarCard}>
                        <div className={styles.pillarIconWrap}>
                            <span className="material-icons-round">calculate</span>
                        </div>
                        <h3 className={styles.pillarTitle}>Live SGPA & CGPA Engine</h3>
                        <p className={styles.pillarDesc}>
                            Official VTU credit formulas for 2022 NEP, 2021, and 2018 schemes. Automatic weighted credit point calculations with zero manual math.
                        </p>
                    </div>

                    <div className={styles.pillarCard}>
                        <div className={styles.pillarIconWrap}>
                            <span className="material-icons-round">gpp_maybe</span>
                        </div>
                        <h3 className={styles.pillarTitle}>Zero-Backlog Assurance</h3>
                        <p className={styles.pillarDesc}>
                            Every failed (F), absent (A), or uncredited subject is audited across all semesters before registration cycles catch you off guard.
                        </p>
                    </div>

                    <div className={styles.pillarCard}>
                        <div className={styles.pillarIconWrap}>
                            <span className="material-icons-round">insights</span>
                        </div>
                        <h3 className={styles.pillarTitle}>Institutional Analytics</h3>
                        <p className={styles.pillarDesc}>
                            Class-wide counselor dashboards, section SGPA averages, and fast VTU marksheet PDF parsing for streamlined department reviews.
                        </p>
                    </div>
                </div>
            </section>

            {/* Role Gateway / Portals Section */}
            <section id="portals" className={styles.portalsSection}>
                <div className={styles.sectionInner}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>CHOOSE YOUR WORKSPACE</span>
                        <h2 className={styles.sectionTitle}>Two Portals. One Intelligent Engine.</h2>
                        <p className={styles.sectionSubtitle}>
                            Dedicated environments designed specifically for student progress tracking and institutional faculty administration.
                        </p>
                    </div>

                    <div className={styles.portalGrid}>
                        {/* Student Portal Card */}
                        <div className={styles.portalCard}>
                            <div className={styles.portalCardTop}>
                                <div className={styles.portalBadgeRow}>
                                    <span className={styles.portalRoleTag}>For Students</span>
                                    <div className={styles.portalIcon}>
                                        <span className="material-icons-round">school</span>
                                    </div>
                                </div>
                                <h3 className={styles.portalCardTitle}>Student Academic Hub</h3>
                                <p className={styles.portalCardDesc}>
                                    Sign in with your official USN to access your complete semester scorecard, track cumulative CGPA, and project target grades.
                                </p>

                                <ul className={styles.portalFeatureList}>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Instant SGPA & CGPA calculation per semester
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Real-time backlog & arrears alert radar
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Upload & parse VTU result PDF marksheets
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        One-click export to PDF, Excel, and Sheets
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <div className={styles.portalDivider} />
                                <div className={styles.portalActions}>
                                    <Button as={Link} href="/auth/student?mode=login" fullWidth variant="primary" iconEnd="arrow_forward">
                                        Sign In as Student
                                    </Button>
                                    <Button as={Link} href="/auth/student?mode=activate" fullWidth variant="ghost">
                                        First Time? Activate USN Profile
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Faculty Portal Card */}
                        <div className={styles.portalCard}>
                            <div className={styles.portalCardTop}>
                                <div className={styles.portalBadgeRow}>
                                    <span className={styles.portalRoleTag}>For Faculty</span>
                                    <div className={styles.portalIcon}>
                                        <span className="material-icons-round">groups</span>
                                    </div>
                                </div>
                                <h3 className={styles.portalCardTitle}>Faculty & Staff Suite</h3>
                                <p className={styles.portalCardDesc}>
                                    Institutional management for professors, proctors, and HODs to monitor batch performance, analyze distributions, and export NAAC reports.
                                </p>

                                <ul className={styles.portalFeatureList}>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Section-wide SGPA and pass percentage metrics
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Subject-wise pass/fail & difficulty analysis
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Batch result upload & automated VTU scraping
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Class counseling logs & student audit trails
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <div className={styles.portalDivider} />
                                <div className={styles.portalActions}>
                                    <Button as={Link} href="/faculty/login" fullWidth variant="primary" iconEnd="login">
                                        Sign In as Faculty
                                    </Button>
                                    <Button as={Link} href="/faculty/register" fullWidth variant="ghost">
                                        Request Faculty Access
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Core Capabilities Section */}
            <section id="features" className={styles.featuresSection}>
                <div className={styles.sectionInner}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>PRECISION CAPABILITIES</span>
                        <h2 className={styles.sectionTitle}>Everything You Need for Academic Tracking.</h2>
                        <p className={styles.sectionSubtitle}>
                            Built to handle the intricacies of VTU grading schemes, credit matrices, and institutional record requirements.
                        </p>
                    </div>

                    <div className={styles.featuresGrid}>
                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>01</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">auto_awesome</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>VTU Scheme Compliant</h3>
                            <p className={styles.featureText}>
                                Built-in support for 2022 NEP, 2021, and 2018 credit schemes. Pre-configured grading scales (O, A+, A, B+, B, C, P, F) with precise grade points.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>02</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">radar</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Smart Backlog Radar</h3>
                            <p className={styles.featureText}>
                                Automatically isolates uncleared subjects, tracks re-attempt histories, and shows exact credit deficits before graduation requirements.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>03</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">picture_as_pdf</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Fast PDF Parsing</h3>
                            <p className={styles.featureText}>
                                Drag and drop official VTU provisional result PDFs to populate your marks table instantly without typing a single subject code.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>04</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">menu_book</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Branch Curriculum Matrix</h3>
                            <p className={styles.featureText}>
                                Complete curriculum directories for CSE, ISE, ECE, ME, Civil, and allied engineering streams with syllabus codes and credit distributions.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>05</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">trending_up</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Performance Trajectory</h3>
                            <p className={styles.featureText}>
                                Visualize semester-by-semester SGPA trends, cumulative CGPA progression curves, and identify academic velocity over time.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>06</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">table_chart</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Instant Report Export</h3>
                            <p className={styles.featureText}>
                                Generate beautiful print-ready PDF scorecards, export clean Excel datasets, or sync directly into Google Sheets for institutional filing.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Calculator Callout */}
            <section className={styles.calcBannerSection}>
                <div className={styles.calcBanner}>
                    <div className={styles.calcBannerContent}>
                        <h3 className={styles.calcBannerTitle}>Want a Quick Grade Estimate?</h3>
                        <p className={styles.calcBannerDesc}>
                            Use our open VTU SGPA & CGPA Calculator to estimate your scores, simulate grade points, or calculate percentage equivalents without logging in.
                        </p>
                    </div>
                    <Button
                        as={Link}
                        href="/calculator"
                        variant="primary"
                        size="lg"
                        iconEnd="arrow_forward"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        Launch Calculator
                    </Button>
                </div>
            </section>

            {/* Institutional Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerLinks}>
                        <Link href="/auth/student" className={styles.footerLink}>Student Portal</Link>
                        <Link href="/faculty/login" className={styles.footerLink}>Faculty Portal</Link>
                        <Link href="/calculator" className={styles.footerLink}>SGPA Calculator</Link>
                        <Link href="/curriculum" className={styles.footerLink}>Curriculum</Link>
                        <Link href="/guide" className={styles.footerLink}>User Guide</Link>
                    </div>

                    <p className={styles.footerText}>
                        © 2026 GradeFlow · Academic Intelligence System · Private Institutional Network
                    </p>

                    <div className={styles.footerCredits}>
                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', opacity: 0.75, fontWeight: 600 }}>
                            Developed by <strong>Mohammed Ainan Armar</strong> & <strong>Rawahah Ruknuddin</strong>
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--tx-muted)', opacity: 0.9 }}>
                            Powered by{' '}
                            <a
                                href="https://automaticxai.online"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: 800 }}
                            >
                                automaticxai.online
                            </a>
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
