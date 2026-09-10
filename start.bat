@echo off
setlocal
set ROOT=%~dp0
set "PATH=%PATH%;C:\Program Files\nodejs\"

echo ============================================
echo   Starting ERP System...
echo ============================================

echo [1/3] Starting backend (FastAPI) on port 8000...
start "ERP - Backend" cmd /k "cd /d "%ROOT%backend" && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo [2/3] Starting frontend (React/Vite) on port 5173...
start "ERP - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo [3/3] Opening browser...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Done. Closing these windows will stop the servers.
echo   Frontend (this PC):    http://localhost:5173
echo   Frontend (same network): http://192.168.0.10:5173
echo   Backend health check:  http://localhost:8000/api/health
pause
