<div align="center">
  <h1>GradeFlow: VTU Academic Intelligence</h1>
  <p><strong>Advanced Scraper, SGPA/CGPA Calculator & Faculty Command Center</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Department-Computer%20Science%20%26%20Engineering-black?style=for-the-badge" alt="Dept of CSE">
    <a href="https://github.com/ainandaddy-cloud/vtu">
      <img src="https://img.shields.io/github/last-commit/ainandaddy-cloud/vtu?style=for-the-badge&color=2ecc71" alt="Last Commit">
    </a>
  </p>
</div>

---

## 🚀 About The Project

**GradeFlow** is a robust, production-ready academic intelligence platform specifically architected for students and faculty under **Visvesvaraya Technological University (VTU)**. It eliminates the manual work of tracking results, handling complex VTU grading criteria (Pass/Fail distinction, Backlog deduplication), and provides a high-performance scraping engine for real-time data retrieval.

## ✨ Key Features

*   **📊 Accurate SGPA/CGPA Logic:** Strictly follows VTU 2022/2025 NEP schemes with robust deduplication (prioritizing your best attempts).
*   **🕷️ High-Speed Scraper:** Real-time multi-portal scraper with automated Captcha solving and job queue management.
*   **🏢 Faculty Command Center:** Specialized dashboard for faculty to perform deep-link USN lookups, bulk academic analytics, and audit logs.
*   **📱 Modern UI:** Premium "Natural Charcoal" theme with glassmorphism effects and full mobile responsiveness.
*   **🛡️ Data Integrity:** Advanced logic to handle "Sticky USN" sessions and ensure every USN is treated as a clean, isolated record.

## 📂 Repository Structure

```
gradeflow/
├── app/                  # Next.js 14 App Router (pages & serverless API endpoints)
├── backend/              # Python VTU scraping engine, Captcha solver, and worker
├── components/           # Reusable UI component library and layouts
├── database/             # PostgreSQL schema and versioned migrations
├── docs/                 # Architecture specifications, deployment and scraper guides
├── lib/                  # Grading calculations, PDF parser, and Supabase client
├── public/               # Static college logos and icons
└── scripts/              # Database setup, catalog verification, and password migrations
```

## 📚 Documentation

Detailed guides and technical references are organized in the [`docs/`](docs/) directory:
*   [**System Architecture & Tech Stack**](docs/ARCHITECTURE.md) — Framework overview, hybrid PDF bridge, and grading engine.
*   [**Production Deployment Guide**](docs/DEPLOYMENT_GUIDE.md) — Vercel web app, Render Docker worker, and Supabase config.
*   [**Scraper Engine & Runtime**](docs/SCRAPER_GUIDE.md) — Headless Playwright worker, neural Captcha solver, and queue integration.
*   [**Competitor Gap Analysis**](docs/COMPETITOR_GAP_ANALYSIS.md) — Benchmarks and system advantages over alternatives.

## 👨‍💻 Developed & Maintained By

The GradeFlow system is built and maintained with a focus on academic excellence and technical precision.

**Development Team:**
*   [**Mohammed Ainan Armar**](https://ainanai.vercel.app/) — AI Engineer & Full Stack Developer
*   [**Rawahah Ruknuddin**](https://rawahahruknuddin.vercel.app/) — AI Product Engineer

**Academic Department:**
*   **Department of Computer Science & Engineering**

---

<div align="center">
  <sub>Building the future of Academic Intelligence for VTU Students</sub>
</div>
