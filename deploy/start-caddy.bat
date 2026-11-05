@echo off
rem Starts Caddy (HTTPS front door for the ERP) with deploy\Caddyfile.
rem   - Put caddy.exe in this folder first (download: https://caddyserver.com/download , Windows amd64).
rem   - Ports 80 and 443 must be free on this PC and forwarded from the router to this PC.
rem   - Always run Caddy as the same Windows account: the certificates are stored in that account's profile.
rem   - Close this window to stop Caddy. The old address (http://www.epik.bio:3102) keeps working.
setlocal
cd /d "%~dp0"

if not exist "caddy.exe" (
    echo.
    echo [ERROR] caddy.exe was not found in this folder:
    echo         %~dp0
    echo         Download it from https://caddyserver.com/download and put it here.
    pause
    exit /b 1
)

echo [1/2] Checking Caddyfile...
caddy.exe validate --config Caddyfile --adapter caddyfile
if errorlevel 1 (
    echo.
    echo [ERROR] Caddyfile has a problem. See the message above.
    pause
    exit /b 1
)

echo [2/2] Starting Caddy (HTTPS). Close this window to stop.
caddy.exe run --config Caddyfile --adapter caddyfile
pause
