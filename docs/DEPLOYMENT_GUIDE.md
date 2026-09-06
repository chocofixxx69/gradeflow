# GradeFlow Production Deployment Guide

GradeFlow operates on a hybrid architecture designed for scalability, low latency, and continuous background data collection.

```
gradeflow/
├── app/                  # Next.js 14 App Router (UI & API routes)
├── backend/              # Python VTU Scraper Engine & Background Worker
│   ├── scraper/          # Playwright scraper, Captcha solver, credit resolver
│   ├── Dockerfile        # Render/VPS container deployment
│   └── render_server.py  # HTTP healthcheck & queue processor
├── components/           # React UI design system components
├── database/             # Canonical schema and SQL migrations
├── docs/                 # System architecture and deployment guides
├── lib/                  # Core VTU grading algorithms and Supabase clients
├── public/               # Optimized static branding assets
└── scripts/              # Migration, audit, and database setup tools
```

---

## 1. Web Application Deployment (Vercel)

The Next.js web application and internal API routes are deployed directly to **Vercel**.

### Build Settings
- **Framework Preset**: Next.js
- **Build Command**: `next build`
- **Output Directory**: `.next`
- **Node.js Version**: 18.x or 20.x

### Environment Variables
Configure the following in the Vercel Dashboard (**Project Settings → Environment Variables**):
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anonymous Public Key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Secret (server-side only)
- `ADMIN_TOKEN`: Production administration secret token
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk Auth Publishable Key (if enabled)
- `CLERK_SECRET_KEY`: Clerk Secret Key (if enabled)

---

## 2. Background Scraper Worker (Render / Docker)

The real-time result scraping engine runs continuously in a containerized environment to process VTU queue jobs.

### Option A: Render Web Service (Automated via Docker)
1. Link your GitHub repository to **Render**.
2. Select **Web Service** with **Docker** environment.
3. Set the Root Directory to `backend`.
4. Render automatically detects `backend/Dockerfile` and `backend/render_server.py`.
5. Set the required environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `HEADLESS=true`
   - `PYTHONUNBUFFERED=1`

### Option B: Ubuntu VPS (PM2)
Refer to [vps-setup.sh](file:///docs/vps-setup.sh) for full automated server provisioning on Ubuntu 22.04 LTS:
```bash
chmod +x docs/vps-setup.sh
./docs/vps-setup.sh
```

---

## 3. Database Setup & Migrations (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Execute the base schema from `database/schema.sql` in the Supabase SQL Editor.
3. Apply migration files sequentially from `database/migrations/` or run the migration utility:
   ```bash
   python scripts/apply_migration.py database/migrations/<migration_file>.sql
   ```

---

## 4. Local Development

1. **Install Node Dependencies**:
   ```bash
   npm install
   ```

2. **Activate Python Virtual Environment**:
   ```powershell
   .\a.ps1
   ```

3. **Start Next.js Dev Server**:
   ```bash
   npm run dev
   ```
