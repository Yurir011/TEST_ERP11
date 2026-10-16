@echo off
setlocal
rem BENCH ERP 정기 백업 (DB + 첨부 파일). 작업 스케줄러에 하루 한 번 등록해서 쓴다. 사용법은 README "백업과 복원".
rem 결과는 backend\storage\backups\daily 에 쌓이고, 30일 지난 백업은 자동으로 정리된다.
set ROOT=%~dp0
cd /d "%ROOT%backend"
"%ROOT%backend\venv\Scripts\python.exe" -m app.scripts.backup_db --with-files %*
set RC=%ERRORLEVEL%
if not "%RC%"=="0" echo [Backup] 실패 - 위 메시지를 확인하세요.
exit /b %RC%
