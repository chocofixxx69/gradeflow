# GradeFlow Scraper Guide & Runtime Integration

This guide explains how to set up, run, and integrate the VTU Result Scraper into the GradeFlow application for real-time result fetching.

## 1. System Requirements
- **Hardware**: VPS (Ubuntu 22.04 recommended) with at least 2GB RAM.
- **Software**:
  - Python 3.11+
  - Google Chrome (Stable)
  - Node.js & PM2 (for process management)
  - Supabase Project

## 2. Setup Procedure

### Step A: Database Preparation
Execute the SQL code in `database/schema.sql` within your Supabase SQL Editor. This creates the necessary tables: `students`, `results`, `subject_marks`, and `scraper_jobs`.

### Step B: Scraper Installation
On your VPS, run the setup script:
```bash
chmod +x docs/vps-setup.sh
./docs/vps-setup.sh
```

### Step C: Environment Configuration
Edit the `.env` file in the `scraper/` directory:
```env
SUPABASE_URL=https://your-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
CHROME_PATH=/usr/bin/google-chrome
HEADLESS=true
```

## 3. How to Run the Scraper

### Mode 1: Manual Single Scrape
To fetch results for a specific student manually:
```bash
source venv/bin/activate
cd scraper
python engine.py 1RV22CS001
```

### Mode 2: Batch Processing
To scrape a list of students from a CSV:
```bash
python batch_scraper.py students.csv
```

### Mode 3: Runtime Integration (The "Invisible" Worker)
This is the **most important mode**. It allows the website to trigger scrapes on-demand.
1. Start the worker using PM2 to keep it running 24/7:
   ```bash
   pm2 start "venv/bin/python worker.py" --name vtu-worker
   ```
2. When a student enters their USN on the website, the following happens:
   - **Frontend**: Calls `/api/scrape` with the USN.
   - **Backend (Next.js)**: Queues a job in the `scraper_jobs` table in Supabase.
   - **Worker (Python)**: Sees the new job, launches Chrome, solves the Captcha, scrapes the results, and saves them back to Supabase.
   - **Frontend**: Polls Supabase and displays the data as soon as it's ready.

## 4. Scraper Capabilities (Backend Runtime)

With this setup, you can achieve the following:
- **Instant Data Aggregation**: Fetch results from multiple VTU result URLs (Even/Odd/Makeup) in one go.
- **Automated Captcha Solving**: Uses a Neural Network to solve captchas with ~90% accuracy.
- **Data Persistence**: Once scraped, the data is stored permanently. The next time the same student checks, it loads **instantly** from the cache.
- **Faculty Insights**: Since data is stored in a structured way, faculty members can see performance trends across branches and semesters without student intervention.

## 5. Troubleshooting
- **Captcha Fails**: The scraper retries up to 3 times. If it fails, check if VTU has changed their captcha style.
- **Slow Scraping**: Selenium is limited by VTU's server speed. A typical scrape takes 15-30 seconds.
- **IP Blocking**: VTU may block IPs if you scrape too aggressively. Use a `polite delay` (implemented in `worker.py`).
