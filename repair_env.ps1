Write-Host "Starting GradeFlow Environment Optimization..." -ForegroundColor Cyan

Remove-Item -Path ".venv" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Building fresh Python 3.13 Virtual Environment..." -ForegroundColor Green
python -m venv .venv

Write-Host "Installing optimized GradeFlow requirements..." -ForegroundColor Green
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host "Initializing Playwright Scraper Engine..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m playwright install chromium

Write-Host "Done!" -ForegroundColor Green
