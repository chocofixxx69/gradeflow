# Start both servers
$projectDir = $PSScriptRoot

# Activate venv and start backend
Write-Host "Starting Backend Server on port 8000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList {
    param($dir)
    Set-Location $dir
    & .\.venv\Scripts\Activate.ps1
    Write-Host "Backend: Running FastAPI server..." -ForegroundColor Green
    python -m uvicorn backend.api.main:app --reload --port 8000
} -ArgumentList $projectDir -NoNewWindow

Start-Sleep -Seconds 2

# Start frontend
Write-Host "Starting Frontend Server on port 3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList {
    param($dir)
    Set-Location $dir
    Write-Host "Frontend: Running Next.js dev server..." -ForegroundColor Green
    npm run dev
} -ArgumentList $projectDir -NoNewWindow

Write-Host "`n✓ Both servers starting..." -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend Docs: http://localhost:8000/docs" -ForegroundColor Yellow
