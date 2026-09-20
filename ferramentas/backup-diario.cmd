@echo off
cd /d "%~dp0.."
call npm run --silent backup >> "%USERPROFILE%\OneDrive\backups\rota-entregas\backup.log" 2>&1
