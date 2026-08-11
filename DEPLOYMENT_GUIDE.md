# Deployment Guide for UIU‑Calculator

## 📂 Project Layout after re‑organisation
```
uiu-calculator/
├─ backend/          # Python scraper, requirements, CI
│   ├─ scraper/          # VTU scraping engine & helpers
│   ├─ test_engine.py   # Simple test harness
│   ├─ requirements.txt # Python dependencies (easyocr, playwright, ...)
│   └─ .github/          # GitHub Actions workflows (CI/CD)
│
├─ frontend/         # Web application (React/Next.js, etc.)
│   └─ app/              # Existing `app` folder – serves the UI
│
├─ setup_structure.ps1 # PowerShell script that performed the move
└─ README.md          # Project overview (unchanged)
```

## 🚀 How to deploy
### Backend (Python scraper)
1. **Create a virtual environment** (on the target server or CI):
   ```bash
   python -m venv .venv
   source .venv/bin/activate   # Linux/macOS
   .\.venv\Scripts\activate   # Windows PowerShell
   ```
2. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. **Run the scraper** (example):
   ```bash
   python backend/test_engine.py
   ```
   Adjust the entry‑point or integrate it into a scheduled job / serverless function.

### Frontend (Web UI)
1. **Navigate to the frontend folder**:
   ```bash
   cd frontend/app
   ```
2. **Install Node dependencies** (if a `package.json` exists):
   ```bash
   npm install
   ```
3. **Run locally** (development):
   ```bash
   npm run dev
   ```
4. **Deploy** – you can push the `frontend/app` directory to Netlify, Vercel, or any static‑site host. The typical Netlify command:
   ```bash
   netlify deploy --dir=frontend/app --prod
   ```
   (Make sure the Netlify CLI is installed globally.)

## 📦 Publishing the repository
- Commit the new folder structure:
  ```bash
  git add backend frontend setup_structure.ps1 DEPLOYMENT_GUIDE.md
  git commit -m "Reorganise repo into backend & frontend directories"
  git push
  ```
- The CI workflow in `.github/` can now run the backend tests independently from the frontend build.

---
*This guide was generated automatically. Feel free to edit the wording, but keep the folder layout as shown.*
