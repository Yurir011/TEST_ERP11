@echo off
rem Quick launcher for checking work on this PC.
rem   - Backend runs with --reload: saved Python changes restart the server automatically.
rem   - Frontend runs with Vite HMR: saved screen changes show up in the browser right away.
rem   - Servers started earlier by start.bat / dev.bat are stopped first so the ports are free.
setlocal
set ROOT=%~dp0
set "PATH=%PATH%;C:\Program Files\nodejs\"

echo ============================================
echo   ERP dev mode (auto reload)
echo ============================================

echo [0/3] Stopping old servers (if any)...
taskkill /FI "WINDOWTITLE eq ERP - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ERP - Frontend*" /T /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/3] Updating database schema (alembic upgrade head)...
pushd "%ROOT%backend"
venv\Scripts\python.exe -m alembic upgrade head
if errorlevel 1 (
    echo.
    echo [ERROR] Database schema update failed. The servers were not started.
    popd
    pause
    exit /b 1
)
popd

echo [2/3] Starting backend (port 8000, --reload) and frontend (port 5173)...
start "ERP - Backend" cmd /k "cd /d "%ROOT%backend" && venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
timeout /t 3 /nobreak >nul
start "ERP - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo [3/3] Opening browser...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Ready: http://localhost:5173  (stop with stop.bat or by closing the two server windows)
timeout /t 3 /nobreak >nul
