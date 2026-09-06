# VTUCalc: Technical Documentation & Framework Overview

This document outlines the architecture, frameworks, and technologies used to build the **VTU CGPA Calculator**. The system is designed for high performance, privacy, and industry-standard scalability.

## 🚀 1. Core Framework: Next.js 14
We used **Next.js 14** as the foundation. It provides the following advantages for this system:
- **React 18**: Powers the dynamic and responsive user interface.
- **App Router**: Enables high-performance server-side rendering (SSR) and modern routing.
- **Serverless API Routes**: Used for handling heavy tasks like PDF parsing without requiring a dedicated backend server.

## 🎨 2. Styling: Vanilla CSS (Custom Design System)
Instead of generic UI libraries, we built a **Custom Design System** from scratch using **Modern CSS**:
- **Glassmorphism**: High-end UI effects with `backdrop-filter` and transparency.
- **Responsive Layout**: Fluid grid systems and media queries for mobile-to-desktop compatibility.
- **CSS Variables**: A centralized color system for consistent branding and performance-grade performance.
- **Animations**: native CSS `@keyframes` for smooth, high-frame-rate transitions.

## 📄 3. PDF Engine: Python Bridge (Hybrid Architecture)
To handle the "Upload" feature, we now use a hybrid **Node.js + Python** architecture:
- **Python Integration**: Next.js spawns a Python child process using `pdfplumber` and `pypdf`.
- **Advanced Table Detection**: Python's `pdfplumber` allows for precise extraction of structured grades and subject tables, which is significantly more accurate than standard text parsers.
- **Node.js Bridge**: The results are passed back to the Next.js API in JSON format, ensuring a seamless experience for the user.
- **Heuristic Parsing**: Custom Python logic identifies USN, Scheme, and Semester data with high reliability.

## 🧮 4. Business Logic: Native Javascript (ES6+)
The core grading logic resides in `lib/vtuGrades.js`:
- **Functional Architecture**: Pure functions calculate SGPA, CGPA, and Percentages for **2022** and **2025** schemes.
- **Scheme Mapping**: A centralized object containing only the primary relevant VTU grading rules (2022 & 2025), optimizing memory usage and code clarity.

## 🏫 6. Faculty & Admin Ecosystem (GradeFlow)
The system has been expanded into a comprehensive institutional platform:
- **Faculty Dashboard**: Allows instructors to look up any student USN, fetch their official records from VTU portals in real-time, and download detailed academic reports.
- **Class Management**: Admins and Faculty can create classes, enroll students, and move/transfer them between groups.
- **Dynamic Branching**: All branches and department data are now fetched dynamically from the `branches` database table, allowing for easy expansion.
- **Advanced Analytics**: Automatic calculation of Class Average CGPA, Backlog counts, and Subject-wise topper lists, with export capabilities to Excel.

## 📦 7. Deployment & Database
- **Supabase (PostgreSQL)**: Secure storage for subject catalogs, student profiles, and audit logs.
- **Vercel**: High-availability hosting for the Next.js application.
- **Real-time Scrapers**: Integrated VTU results scraping engine with job queuing and status tracking.

---
**GradeFlow** (By VTUCalc) is now a full-scale institutional utility for managing academic data with modern web aesthetics and precision.
