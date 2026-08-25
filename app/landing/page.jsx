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
                    <div className={styles.navBtnGhost}>
                        <Button as={Link} href="/auth" variant="ghost" size="sm">
                            Sign In
                        </Button>
                    </div>
                    <Button as={Link} href="/auth/student" variant="primary" size="sm" iconEnd="arrow_forward">
                        Student Access
                    </Button>
                </div>
            </header>

            {/* Hero Section */}
            <section className={`${styles.hero} gf-fade-up`}>
                <div className={styles.eyebrowBadge}>
                    <span className={`material-icons-round ${styles.eyebrowIcon}`}>verified</span>
                    <span className={styles.eyebrowDesktop}>VTU CGPA · SGPA · Academic Intelligence Platform</span>
                    <span className={styles.eyebrowMobile}>VTU Academic Intelligence</span>
                </div>

                <h1 className={styles.heroTitle}>
                    Track it. <span className={styles.heroTitleAccent}>Understand it.</span>
                </h1>

                <p className={styles.heroSubtitle}>
                    GradeFlow calculates your SGPA and CGPA with official VTU formulas, tracks backlogs, parses marksheet PDFs, and auto-fetches results directly from VTU portals. Built for VTU students and faculty.
                </p>

                <div className={styles.heroCtaGroup}>
                    <Button
                        as={Link}
                        href="/auth/student"
                        variant="primary"
                        size="lg"
                        iconEnd="arrow_forward"
                        className={styles.heroCtaBtn}
                        style={{ height: '46px', fontSize: '14.5px' }}
                    >
                        Sign in as Student
                    </Button>
                    <Button
                        as={Link}
                        href="/faculty/login"
                        variant="secondary"
                        size="lg"
                        iconStart="school"
                        className={styles.heroCtaBtn}
                        style={{ height: '46px', fontSize: '14.5px' }}
                    >
                        Faculty Access
                    </Button>
                </div>

                <Link href="/calculator" className={styles.heroQuickLink}>
                    <span className="material-icons-round" style={{ fontSize: '16px', flexShrink: 0 }}>calculate</span>
                    <span>Need a quick calculation? Try Open SGPA Calculator →</span>
                </Link>
            </section>

            {/* Role Gateway / Portals Section */}
            <section id="portals" className={styles.portalsSection}>
                <div className={styles.sectionInner}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>CHOOSE YOUR WORKSPACE</span>
                        <h2 className={styles.sectionTitle}>Two Portals. One Unified Platform.</h2>
                        <p className={styles.sectionSubtitle}>
                            Dedicated environments built specifically for student academic tracking and institutional faculty administration.
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
                                    Sign in with your USN to access your complete semester scorecard, track cumulative CGPA, and analyze your subject performance.
                                </p>

                                <ul className={styles.portalFeatureList}>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Official VTU 2022/2025 NEP SGPA & CGPA logic
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Backlog status and attempt history tracking
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Upload & parse VTU provisional result PDFs
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Export grade card to PDF and Excel (.xlsx)
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
                                <h3 className={styles.portalCardTitle}>Faculty Command Center</h3>
                                <p className={styles.portalCardDesc}>
                                    Institutional portal for instructors, proctors, and HODs to look up USNs, view class analytics, and manage student groups.
                                </p>

                                <ul className={styles.portalFeatureList}>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Deep-link student USN lookup & result fetching
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Class-wide average CGPA & backlog counts
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Class creation, enrollment & student transfers
                                    </li>
                                    <li className={styles.portalFeatureItem}>
                                        <span className={`material-icons-round ${styles.portalFeatureCheck}`}>check_circle</span>
                                        Export class results and analytics to Excel
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
                        <span className={styles.sectionEyebrow}>SYSTEM CAPABILITIES</span>
                        <h2 className={styles.sectionTitle}>Built for VTU Academic Tracking</h2>
                        <p className={styles.sectionSubtitle}>
                            Core tools and automated workflows built directly into the GradeFlow engine.
                        </p>
                    </div>

                    <div className={styles.featuresGrid}>
                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>01</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">calculate</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>VTU 2022 & 2025 NEP Engine</h3>
                            <p className={styles.featureText}>
                                Implements exact VTU grading criteria with minimum external threshold rules (18 marks SEE) and weighted credit point sums.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>02</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">fact_check</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Backlog & Attempt Tracking</h3>
                            <p className={styles.featureText}>
                                Automatically flags failed (F) and absent (A) subjects, deduplicating multiple re-attempts to keep your best passing score.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>03</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">picture_as_pdf</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Python PDF Marksheet Parser</h3>
                            <p className={styles.featureText}>
                                Backend Python bridge extracts subject codes, internals, externals, and grades directly from official VTU marksheet PDFs.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>04</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">cloud_sync</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Real-Time VTU Portal Scraper</h3>
                            <p className={styles.featureText}>
                                Connects to live VTU result portals to fetch semester marks directly by USN, with automated captcha resolution and sync.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>05</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">analytics</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>Faculty Analytics & Class Intel</h3>
                            <p className={styles.featureText}>
                                Institutional dashboard for faculty to view class average CGPA, track backlog numbers, and monitor student academic standing.
                            </p>
                        </div>

                        <div className={styles.featureCard}>
                            <div className={styles.featureHeader}>
                                <span className={styles.featureNum}>06</span>
                                <div className={styles.featureIconWrap}>
                                    <span className="material-icons-round">file_download</span>
                                </div>
                            </div>
                            <h3 className={styles.featureTitle}>PDF & Excel Export</h3>
                            <p className={styles.featureText}>
                                One-click export for students to download formatted PDF grade sheets, and for faculty to export class records to Excel (.xlsx).
                            </p>
                        </div>
                    </div>
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

                    {/* Highlighted Developer Card */}
                    <div className={styles.developerCreditCard}>
                        <div className={styles.developerCreditHeader}>
                            <span className="material-icons-round" style={{ fontSize: '15px' }}>code</span>
                            <span>ENGINEERED & DEVELOPED BY</span>
                        </div>
                        <div className={styles.developerNamesRow}>
                            <a
                                href="https://ainanai.vercel.app/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.developerChip}
                                title="Mohammed Ainan — AI Engineer & Full Stack Developer"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>person</span>
                                <span>Mohammed Ainan Armar</span>
                            </a>
                            <span className={styles.developerAmp}>&</span>
                            <a
                                href="https://rawahahruknuddin.vercel.app/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.developerChip}
                                title="Rawahah Ruknuddin — AI Product Engineer"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>person</span>
                                <span>Rawahah Ruknuddin</span>
                            </a>
                        </div>
                        <div className={styles.poweredByLine}>
                            Department of Computer Science & Engineering
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
