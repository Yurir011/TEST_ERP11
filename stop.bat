@echo off
echo Stopping ERP System servers...

taskkill /FI "WINDOWTITLE eq ERP - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ERP - Frontend*" /T /F >nul 2>&1

echo Done.
pause
