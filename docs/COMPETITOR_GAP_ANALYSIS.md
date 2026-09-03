# Competitor Gap Analysis — AITM Results Analyzer vs GradeFlow

**Source:** teardown of `results.aitm.edu.in` (faculty account walkthrough, 3 Sep 2026), 19 routes / 10 reports / 10 findings.
**Method:** every capability below was checked against the live GradeFlow codebase (not assumed) — routes, API handlers, DB schema/migrations, and component code were read directly. "NONE FOUND" means an exhaustive grep across `app/`, `lib/`, `components/`, `database/`, `supabase/` turned up nothing, not that it wasn't looked for.

Verdict key: **HAVE** (equal or better) · **PARTIAL** (real gap, but real groundwork exists) · **MISSING** (nothing exists) · **DELIBERATELY-SKIPPED** (excluded by your instructions, e.g. dark mode, manual CIE entry).

---

## Table 1 — Capability by capability

| Capability | Where it lives in their product | Our equivalent (file/route) or NONE | Verdict | Effort |
|---|---|---|---|---|
| Dashboard KPI tiles + grade/CGPA distribution | `/` — 6 KPI tiles, CGPA bracket chart, grade donut | `app/admin/analytics/page.jsx` + `app/api/admin/analytics/route.js` (superset: KPIs, branch/semester/CGPA/backlog distributions, per-class rollup, academic_health) | HAVE | — |
| Semester Toppers by department (dashboard cards) | `/` toppers panel, per-semester per-department cards | `app/leaderboard` (semester SGPA ranking) + `app/api/admin/analytics/rankings` (top_students) — different layout, same data | HAVE | Low, if you want the exact card layout on the admin dashboard |
| Students directory (filter + export) | `/students` — dept/sem/batch/text filters, Excel+PDF | `app/admin/analytics/students` (`StudentIntelligence.jsx`) + `app/admin/terminal` (Students tab, search by USN/name) + export routes (CSV/Excel/PDF) | HAVE | — |
| Student record — full profile, SGPA trend, per-sem marksheet, transcript PDF, deactivate | `/students/<uuid>` | `app/faculty/dashboard` (per-semester subject marks, SGPA/CGPA, transcript PDF via `lib/generatePDF.js`) + `app/admin/terminal` per-student drawer (marks, suspend/reactivate = "deactivate") | PARTIAL | Medium — see "SGPA trend chart" and "guardian block" rows below |
| — SGPA trend chart on an arbitrary student's record (admin/faculty view) | part of student record | Only exists for the **logged-in student's own** view (`app/analytics/page.jsx`, recharts) — not exposed when a faculty/admin opens someone else's record | MISSING | Low-Medium (data already computed server-side; needs a chart on the existing faculty/admin student-detail views) |
| — Parent/Guardian contact block | student record, empty in their product too | **NONE FOUND** — no guardian/parent field anywhere in schema or UI | MISSING | Medium (new table + student-record UI; see open question #1) |
| Departments directory (read-only cards) | `/departments` | `branches` table exists; branch_distribution appears inside Overview analytics; no standalone directory page | PARTIAL | Low |
| Subjects catalog with faculty column | `/subjects` — faculty column is **empty for every row** in their product | `app/faculty/subjects` (full CRUD, bulk upload, credits) + `app/admin/analytics/subjects` (faculty column **is populated**, sourced from `faculty_subject_assignments`) | HAVE (exceeds) | — (see architecture note on duplicate faculty-assignment tables) |
| Semester Analysis: Credits view vs Marks view toggle (Cr/Ci/G/Gi/CrP vs Int/Ext/Total/Grade) | `/analytics/semester-analysis` | **NONE FOUND** anywhere — every export/report uses one fixed column set | MISSING | Medium (calc engine already produces per-subject grade points/credits; this is a display-mode toggle + one more export column set) |
| Per-subject grade tally + appeared/passed/failed/pass% footers | same page | `app/api/admin/analytics/subjects`, class-consolidated PDF ("Result Analysis Subject Wise") — both already do this | HAVE | — |
| Backlog Analysis table (per report) | same page | Class-consolidated PDF ("Arrears Analysis") + `app/admin/analytics/backlogs` (`BacklogIntelligence.jsx`) | HAVE | — |
| Consolidated Batch/progression report: SGPA per semester I..N + cumulative CGPA/Cr Earned, LE handling, row shading | `/analytics/batch-report` | Per-semester data already flows end-to-end (`semester_data` map in `app/api/class-students/route.js`, `semStats` in `lib/vtuAcademicEngine.js`) and is used for the roster's per-semester toggle — but **no report lays semesters out side-by-side per student with cumulative CGPA/credits columns and LE-aware shading** | PARTIAL | Medium (engine work is done; this is a new report assembly + export) |
| Exam-session-scoped analysis (results *as declared* in one session — Regular/Reval/Make-Up/Summer) | `/analytics/exam-wise`, 19 sessions | `exam_sessions` table + `examSession` filter exist, but the filter only **selects which students appear** — SGPA/CGPA/backlogs are still computed from the student's full canonical record ("current best"), not frozen to that session's marks. `exam_type` enum only allows `regular / supplementary / improvement` — no Revaluation/Make-Up/Summer values | PARTIAL | High — needs (a) new session-type values, (b) a real "compute from this session's declared marks only" code path alongside (not replacing) the canonical one. See open question #2 |
| Class/section analysis across departments (mixed section, Dept column, Ab markers) | `/analytics/class-analysis` | `classes`/`class_students` schema could technically hold a mixed roster (usn-keyed), but `ClassIntelligence.jsx` and the class-students catalog lookup both assume **one branch per class** — credit resolution uses `classData.branch` for everyone | PARTIAL | Medium-High — schema is close; the branch-per-class assumption is baked into catalog resolution and needs a per-student branch path (already exists in `students.branch`, just not used consistently here) |
| Batch Analytics (5 tiles, subject perf, batch toppers, backlog roster, PDF) | `/analytics/batch` | `app/admin/analytics` Overview + Subjects + Rankings + Backlogs tabs cover this, plus CSV/Excel/PDF export (competitor only has PDF here) | HAVE (exceeds on export) | — |
| Subject Analytics — single-subject deep dive (6 tiles, grade bar, top-10 performers in that subject) | `/analytics/subject` | `app/admin/analytics/subjects` gives a **list of all subjects** with pass%, not a one-subject drill-down; per-subject top scorers exist only at class scope (`subjectToppers` in `ClassesContent.jsx`), not cohort-wide | PARTIAL | Low-Medium (data is one query away — `subject_marks` filtered by code — mostly new route + UI) |
| Dept. Overview (one row per semester: students/passed/failed/pass%/avg SGPA) | `/analytics/department` | `branch_distribution`/`semester_distribution` exist as separate aggregates on the Overview dashboard; no single dept-by-semester rollup table | PARTIAL | Low (both aggregates already computed; needs a cross-tab) |
| Compare Students (2+ USNs side by side) | `/analytics/compare` (built, but **not linked from their own menu**) | **NONE FOUND** | MISSING | Low-Medium (all per-student fields already exist via `buildStudentRow`; needs a small route + UI) |
| Users admin screen (accounts, role/status/join date) | `/users` — **read-only** | `app/admin/terminal` (Students + Faculty tabs) — role, status, join date, **plus** suspend/reactivate/reset-credentials/delete, which their product doesn't have at all | HAVE (exceeds) | — |
| Scraper trigger | `/scraper` — **admin-only, and silently broken** (redirects even though it's the dashboard's first Quick Action) | `app/api/scrape`, `app/api/scrape/bulk`, `app/faculty/vtu-urls` — faculty-accessible and working | HAVE (exceeds) | — |
| Send Results (parent/student dispatch) | `/send-results` — admin-only, behavior unconfirmed even for them | **NONE FOUND** — no guardian data, no email/SMS dispatch code path | MISSING | High — blocked on guardian data (above) + an external email/SMS provider decision. See open question #1 |
| Settings | `/settings` — admin-only | `app/settings`, `system_settings` table | HAVE | — |
| Student self-service portal | `/portal` — **hangs forever** with no student record behind the login | `app/dashboard` — has a proper empty state ("No Academic Records Yet") instead of an infinite spinner | HAVE (exceeds) | — |
| Rank/Merit list, CGPA-ordered with tie-break | Batch Toppers, stops at 10 | `app/leaderboard` — full ranking, proper multi-level tie-break (CGPA → backlogs → credits → USN); `app/api/admin/analytics/rankings` also exists but its tie-break is USN-only (weaker than the leaderboard's) | HAVE | Low, to bring Rankings-tab tie-break up to leaderboard's standard (consistency polish, not a competitor gap) |
| Backlog register across ALL semesters (not just one report) | implied by "Backlog Analysis exists but only inside one semester's report" (their own gap) | `app/api/admin/analytics/backlogs` already aggregates a student's full-history failed subjects when no semester filter is applied — it's just presented as one flat tab, not a dedicated register/printable format | PARTIAL | Low (mostly a report-format addition on top of data that already exists) |
| Batch-over-batch trend (same semester, different intake years) | listed as a gap in *their* product too | **NONE FOUND** | MISSING | Medium (needs a query across multiple `academic_year`/`batch` values at once — everything else is single-batch scoped today) |
| Revaluation impact (before/after a Reval session) | listed as a gap in *their* product too | **NONE FOUND**, and `exam_type` doesn't even have a Revaluation value yet | MISSING | High — depends on the exam-session-scoped work above being done first. See open question #2 |
| Eligibility & Detention list (credit threshold to carry forward) | listed as a gap in *their* product too | **NONE FOUND** — closest analog is the Risk tab's backlog-count tiers (`CRITICAL/HIGH/MODERATE/SAFE`), which is a different rule (backlog count, not credit threshold) | MISSING | Medium, **but the actual threshold rule needs to be specified first** — see open question #3 |
| Bulk/consolidated transcript printing (whole class at once) | listed as a gap in *their* product too | `generateResultPDF` (`lib/generatePDF.js`) only ever runs for one USN per call, from a per-student button. Class-wide "consolidated" PDF exists but is a **tabular result sheet**, not individual transcripts | MISSING (as stated) | Low-Medium (loop the existing single-student generator across a class roster and concatenate) |
| Faculty-to-subject mapping | listed as their #1 missing data field | `faculty_subject_assignments` (admin-managed, feeds analytics) — but see the duplicate-table issue below | HAVE (exceeds) | — (architecture cleanup, not a feature gap) |
| Excel + PDF export on every table-producing report | Two of their nine report screens (Subject Analytics, Dept. Overview) have no export at all | Ours: `app/faculty/reports` (no export at all), `app/admin/audit-log` (no export), `app/admin/terminal` roster (no CSV/PDF of the account list), `app/admin/faculty-assignments` / exam-sessions management (no export) | PARTIAL | Low per page — same export helpers already exist, just not wired up on these four |
| Global header search (USN/name, from any page) | present in their shell, but **broken** — returns nothing for a valid USN | **NONE FOUND** — every search box in GradeFlow is local to its own page | MISSING (they have the affordance, ours doesn't exist either) | Low-Medium — optional; not explicitly requested in your "specific things to check" list, flagging for a scope call |
| No dark mode / theme toggle | not evaluated (not in their write-up) | Intentionally absent | DELIBERATELY-SKIPPED | — |
| Manual internal-marks / CIE entry | not evaluated | Intentionally absent | DELIBERATELY-SKIPPED | — |

---

## Table 2 — Things we already have that they don't (regression-guard list — do not weaken any of these while building the above)

| Capability | Why it matters |
|---|---|
| Named, individual faculty logins with a real audit trail (`faculty_activity`, `audit_logs`) | Their product runs the entire faculty body through 3 shared accounts (one literally named `faculty`) — nothing is attributable to a person. Ours attributes every action to a real logged-in faculty member. |
| Suspend/reactivate/reset-credentials/delete for both students and faculty | Their `/users` screen is read-only on the account they walked through. |
| Working, faculty-accessible scraper + VTU URL management | Their `/scraper` silently redirects even for the account whose dashboard advertises it as the first Quick Action. |
| Student self-service dashboard with a real empty state | Their `/portal` hangs on "Loading your results…" forever for any account without a linked student record. |
| CSV **and** Excel **and** PDF export on the admin analytics suite | They top out at Excel+PDF on their best-covered reports, and have zero export on two of their nine analytics screens. |
| Risk analytics (backlog-tier classification, CRITICAL/HIGH/MODERATE/SAFE) | No analog described anywhere in their teardown. |
| Credit-audit tool (dry-run + apply, reconciles `subject_marks.credits` drift against the live catalog) | No analog described anywhere in their teardown — this is a data-integrity feature, not just a report. |
| Server-side calculation discipline (mostly) | Their own write-up states exports are "built in the browser from whatever is on screen, not rendered server-side" — no described server validation at all. Ours computes SGPA/CGPA/grades/pass% server-side in `lib/analytics-data.js` / `lib/vtuAcademicEngine.js` for the entire `app/admin/analytics/*` suite and all export routes (**with two known exceptions — see below**). |
| Multi-level tie-break on the student leaderboard (CGPA → backlogs → credits → USN) | Their Batch Toppers table gives no indication of how ties are broken and stops at ten. |

---

## Architecture issues found during this audit (not competitor gaps — flagging per your API-first hard rule, not fixing silently)

These came up while tracing calculation paths and directly violate "the client only renders what the API returns":

1. **`app/analytics/page.jsx`** (student/faculty self-service analytics) — `calcSGPA()` and the body of `fetchStudentAnalytics()` recompute grade points, dedupe subjects, and derive credit-weighted SGPA/CGPA **in the browser**, using `normalizeSubjectResult` client-side, instead of consuming a precomputed server value.
2. **`app/faculty/dashboard/page.jsx`** — the API route returns raw `students`/`subject_marks`/`marks` rows; `calculateAcademicRecord` is then run **client-side** in the page component to produce SGPA/CGPA/backlogs for display.
3. **`components/ClassesContent.jsx`** — the roster's SGPA/CGPA/backlog aggregation and all of `lib/export-utils.js`'s consolidated-report math run **client-side**, even though `app/api/class-students/route.js` already computes and returns per-student `semester_data` (sgpa/backlogs/credits) server-side — the client appears to be recomputing what the API already hands it.

None of these were touched. Flagging per your instruction to surface, not silently rewrite, existing violations — worth a decision on whether to fold a fix into this competitor-parity work or track separately.

**Schema/data-consistency findings** (also pre-existing, also not touched):

4. `students.lateral_entry` is read in code (`app/api/student/leaderboard/route.js`) but is **not declared in any schema.sql or migration file** — undocumented column drift.
5. Two parallel, inconsistent faculty↔subject tables: `faculty_subject_assignments` (admin-managed, used by analytics) and a separate `faculty_assignments` table (read by `app/api/faculty/dashboard/route.js` for the faculty dashboard's "assigned subjects" KPI). They can drift out of sync.
6. Two different `audit_logs` schemas: `scripts/setup_supabase_db.py` defines one column set (`action`, `details` jsonb, `user_id`, `ip_address`); the actual app code (`lib/audit-logger.js`) writes a completely different set (`faculty_id`, `faculty_name`, `action_type`, `entity_type`, `old_values`, `new_values`, `metadata`). No migration file matches what the app actually writes.
7. The `classes` and `class_students` tables exist only in `scripts/setup_supabase_db.py`, not in `database/schema.sql` or any tracked migration — the canonical schema is split across three inconsistent sources.

---

## Open questions before I write any migration or feature code

1. **Guardian contacts + Send Results** — this needs a real product decision, not just a table: what fields (name/relation/phone/email — one guardian or multiple?), and for dispatch, what channel (email via which provider, SMS, both)? This is the highest-effort item and gates on your answer.
2. **Exam-session-scoped "as declared" analysis + Revaluation** — do you want a second, session-frozen calculation path added *alongside* the existing canonical "current best" one (additive, per your hard rules), or do you consider the current canonical-record approach the correct one and this competitor behavior not worth copying? I'd lean toward recommending we add it, but it's real effort and I want your call before starting.
3. **Eligibility/Detention rule** — VTU credit-carry-forward rules vary by scheme/regulation year. What's the actual threshold you want enforced (e.g. "must clear X% of Sem N credits to register for Sem N+2")? I don't want to guess a rule for something this consequential.
4. **The three architecture violations and four schema inconsistencies above** — fix now as part of this work, or track as a separate follow-up? They're pre-existing, not caused by anything in this task, but items 2-3 (client-side recompute) sit exactly on the rule you called out as a hard requirement.

## Suggested build order (pending your go-ahead)

Roughly cheapest-and-highest-value first, deferring anything blocked on an open question above:

1. Export coverage gaps (4 pages, low effort each) — `faculty/reports`, `audit-log`, `admin/terminal` roster, faculty-assignments/exam-sessions management.
2. Compare Students (low-medium — all data already exists).
3. Subject Analytics single-subject drill-down (low-medium).
4. Dept. Overview cross-tab, Departments directory page (low).
5. Backlog register report format (low — data already computed).
6. Consolidated Batch/progression report with LE handling and row shading (medium).
7. Rankings-tab tie-break upgrade to match leaderboard (low, consistency polish).
8. Credits view / Marks view toggle on semester analysis (medium).
9. Class/section analysis across departments (medium-high — touches catalog-resolution assumptions, needs care).
10. Batch-over-batch trend (medium).
11. Eligibility/Detention list — **blocked on open question 3**.
12. Exam-session-scoped analysis + Revaluation impact — **blocked on open question 2**.
13. Guardian contacts + Send Results — **blocked on open question 1**.
14. Bulk transcript printing (low-medium, can slot in anywhere).

Waiting for your go-ahead on scope, plus answers to the four open questions, before writing any migration or feature code.
