"""
GradeFlow — Academic Intelligence API (FastAPI + Swagger)
Intern 2: Academic Intelligence & Data Integrity Engineer

Exposes the academic-intelligence layer as a documented REST API. FastAPI
auto-generates interactive Swagger docs — no extra config needed.

Run it (from the backend/ folder):

    python -m uvicorn api.main:app --reload

Then open in a browser:
    http://localhost:8000/docs      ← Swagger UI (interactive)
    http://localhost:8000/redoc     ← ReDoc (clean reference)
    http://localhost:8000/openapi.json   ← raw OpenAPI spec

Endpoints are grouped by tag:
    • Calculations — SGPA / CGPA / grade points        (no database needed)
    • Toppers      — class / subject / semester / dept / college  (needs DB)
    • Monitoring   — scrape-queue health                (needs DB)
    • Scraping     — queue a USN for scraping           (needs DB)

DB-backed endpoints return HTTP 503 with a clear message when no real Supabase
project is connected (e.g. in DB-free demo mode).
"""

import os
import sys
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Path, Query
from pydantic import BaseModel, Field

# Make the backend packages importable when run from backend/
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ──────────────────────────────────────────────────────────────────────────
#  VTU grade-point logic (marks-based, 2022/2025 NEP) — no DB required
# ──────────────────────────────────────────────────────────────────────────
EXCLUDED_GRADES = {"PP", "NP", "W", "DX", "AU"}
FAIL_GRADES = {"F", "A", "AB", "ABSENT", "X", "NE"}


def grade_point(total: float, grade: Optional[str] = None) -> int:
    """VTU grade points from total marks. Fail/absent grades always score 0."""
    g = (grade or "").strip().upper()
    if g in FAIL_GRADES:
        return 0
    if total >= 90: return 10
    if total >= 80: return 9
    if total >= 70: return 8
    if total >= 60: return 7
    if total >= 55: return 6
    if total >= 50: return 5
    if total >= 40: return 4
    return 0


# ──────────────────────────────────────────────────────────────────────────
#  Request / response models  (these become the Swagger schemas)
# ──────────────────────────────────────────────────────────────────────────
class SubjectIn(BaseModel):
    code: Optional[str] = Field(None, examples=["BCS301"])
    credits: float = Field(..., gt=0, examples=[4])
    total: float = Field(..., ge=0, le=100, description="Total marks (CIE + SEE)", examples=[85])
    grade: Optional[str] = Field(None, description="Optional explicit grade (P/F/A/PP/...)", examples=["P"])


class SGPARequest(BaseModel):
    subjects: List[SubjectIn]

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "subjects": [
                    {"code": "BCS301", "credits": 4, "total": 85, "grade": "P"},
                    {"code": "BCS302", "credits": 4, "total": 72, "grade": "P"},
                    {"code": "BCS303", "credits": 3, "total": 34, "grade": "F"},
                ]
            }]
        }
    }


class SemesterIn(BaseModel):
    semester: int = Field(..., ge=1, le=8, examples=[3])
    sgpa: float = Field(..., ge=0, le=10, examples=[8.5])
    credits: float = Field(..., gt=0, examples=[24])


class CGPARequest(BaseModel):
    semesters: List[SemesterIn]

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "semesters": [
                    {"semester": 1, "sgpa": 8.0, "credits": 20},
                    {"semester": 2, "sgpa": 7.5, "credits": 22},
                    {"semester": 3, "sgpa": 8.8, "credits": 24},
                ]
            }]
        }
    }


# ──────────────────────────────────────────────────────────────────────────
#  App + metadata (shows at the top of the Swagger page)
# ──────────────────────────────────────────────────────────────────────────
tags_metadata = [
    {"name": "Calculations", "description": "SGPA / CGPA / grade points. **No database required.**"},
    {"name": "Toppers", "description": "Rank students at class / subject / semester / department / college level. *Requires a connected Supabase DB.*"},
    {"name": "Monitoring", "description": "Scrape-queue health & throughput. *Requires a connected Supabase DB.*"},
    {"name": "Scraping", "description": "Queue a USN for the scraper worker. *Requires a connected Supabase DB.*"},
]

app = FastAPI(
    title="GradeFlow Academic Intelligence API",
    description=(
        "REST API for the VTU academic-intelligence layer: SGPA/CGPA calculation, "
        "topper analytics, and scrape-queue monitoring.\n\n"
        "Calculation endpoints work standalone. Data endpoints need a Supabase "
        "connection (set `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` in `backend/scraper/.env`)."
    ),
    version="1.0.0",
    openapi_tags=tags_metadata,
)


def _get_supabase():
    """Return the Supabase client, or raise 503 if it can't actually reach a DB."""
    try:
        from scraper.config import supabase
        return supabase
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database client unavailable: {e}")


def _db_call(fn, *args, **kwargs):
    """Run a DB-backed analytics function, converting connection failures to 503."""
    sb = _get_supabase()
    try:
        return fn(sb, *args, **kwargs)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database not connected or query failed ({type(e).__name__}). "
                   f"Set real Supabase credentials to use this endpoint.",
        )


# ──────────────────────────────────────────────────────────────────────────
#  Root
# ──────────────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def root():
    return {"service": "GradeFlow Academic Intelligence API", "docs": "/docs", "redoc": "/redoc"}


# ──────────────────────────────────────────────────────────────────────────
#  Calculations  (no DB)
# ──────────────────────────────────────────────────────────────────────────
@app.get("/calc/grade-point", tags=["Calculations"], summary="Grade point for given marks")
def api_grade_point(
    total: float = Query(..., ge=0, le=100, description="Total marks", examples=[85]),
    grade: Optional[str] = Query(None, description="Optional explicit grade", examples=["P"]),
):
    """Return the VTU grade point (0–10) for a subject's total marks."""
    return {"total": total, "grade": grade, "grade_point": grade_point(total, grade)}


@app.post("/calc/sgpa", tags=["Calculations"], summary="Compute SGPA for one semester")
def api_sgpa(req: SGPARequest):
    """
    SGPA = Σ(grade_point × credits) / Σ(credits).
    Excluded grades (PP, NP, W, DX, AU) are dropped from the calculation.
    """
    tc = tcp = 0.0
    earned = 0.0
    backlogs = []
    for s in req.subjects:
        g = (s.grade or "").strip().upper()
        if g in EXCLUDED_GRADES:
            continue
        gp = grade_point(s.total, s.grade)
        tc += s.credits
        tcp += gp * s.credits
        if gp == 0:
            backlogs.append(s.code or "?")
        else:
            earned += s.credits
    sgpa = round(tcp / tc, 2) if tc > 0 else 0.0
    return {
        "sgpa": sgpa,
        "total_credits": tc,
        "earned_credits": earned,
        "backlogs": backlogs,
        "backlog_count": len(backlogs),
    }


@app.post("/calc/cgpa", tags=["Calculations"], summary="Compute CGPA across semesters")
def api_cgpa(req: CGPARequest):
    """CGPA = Σ(SGPA × semester_credits) / Σ(credits). Classification per VTU."""
    tc = weighted = 0.0
    for s in req.semesters:
        tc += s.credits
        weighted += s.sgpa * s.credits
    cgpa = round(weighted / tc, 2) if tc > 0 else 0.0
    classification = "FCD" if cgpa >= 7.75 else "FC" if cgpa >= 6.75 else "SC"
    percentage = round((cgpa - 0.75) * 10, 2)
    return {"cgpa": cgpa, "percentage": percentage, "classification": classification, "total_credits": tc}


# ──────────────────────────────────────────────────────────────────────────
#  Toppers  (DB)
# ──────────────────────────────────────────────────────────────────────────
@app.get("/toppers/class/{class_id}", tags=["Toppers"], summary="Class topper (highest CGPA)")
def topper_class(class_id: str = Path(..., description="Class UUID"), limit: int = Query(5, ge=1, le=50)):
    from analytics.toppers import get_class_topper
    return {"toppers": _db_call(get_class_topper, class_id, limit=limit)}


@app.get("/toppers/subject/{subject_code}", tags=["Toppers"], summary="Subject topper (highest marks)")
def topper_subject(
    subject_code: str = Path(..., examples=["BCS301"]),
    branch: Optional[str] = Query(None, examples=["CSE"]),
    limit: int = Query(5, ge=1, le=50),
):
    from analytics.toppers import get_subject_topper
    return {"toppers": _db_call(get_subject_topper, subject_code, branch=branch, limit=limit)}


@app.get("/toppers/semester/{semester}", tags=["Toppers"], summary="Semester topper (highest SGPA)")
def topper_semester(
    semester: int = Path(..., ge=1, le=8),
    branch: str = Query(..., examples=["CSE"]),
    limit: int = Query(5, ge=1, le=50),
):
    from analytics.toppers import get_semester_topper
    return {"toppers": _db_call(get_semester_topper, semester, branch, limit=limit)}


@app.get("/toppers/department/{branch}", tags=["Toppers"], summary="Department topper (highest CGPA)")
def topper_department(branch: str = Path(..., examples=["CSE"]), limit: int = Query(5, ge=1, le=50)):
    from analytics.toppers import get_department_topper
    return {"toppers": _db_call(get_department_topper, branch, limit=limit)}


@app.get("/toppers/college", tags=["Toppers"], summary="College topper (highest CGPA overall)")
def topper_college(limit: int = Query(10, ge=1, le=100)):
    from analytics.toppers import get_college_topper
    return {"toppers": _db_call(get_college_topper, limit=limit)}


# ──────────────────────────────────────────────────────────────────────────
#  Monitoring  (DB)
# ──────────────────────────────────────────────────────────────────────────
@app.get("/monitoring/queue", tags=["Monitoring"], summary="Scrape-queue metrics")
def monitoring_queue():
    """Counts of queued / running / finished / error / no_result jobs."""
    from monitoring.queue_monitor import get_queue_metrics
    return _db_call(get_queue_metrics)


@app.get("/monitoring/health", tags=["Monitoring"], summary="Full health report")
def monitoring_health():
    """Queue + throughput + stale jobs + error patterns + data coverage."""
    from monitoring.queue_monitor import generate_health_report
    return _db_call(generate_health_report, output_json=True)


# ──────────────────────────────────────────────────────────────────────────
#  Scraping  (DB)
# ──────────────────────────────────────────────────────────────────────────
@app.post("/scrape/{usn}", tags=["Scraping"], summary="Queue a USN for scraping")
def queue_scrape(usn: str = Path(..., examples=["2AB24CS001"])):
    """Insert a `queued` job into `scraper_jobs`; the worker picks it up."""
    sb = _get_supabase()
    try:
        res = sb.table("scraper_jobs").insert({"usn": usn.strip().upper(), "status": "queued"}).execute()
        return {"status": "queued", "usn": usn.strip().upper(), "job": res.data}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not queue job (DB not connected?): {e}")
