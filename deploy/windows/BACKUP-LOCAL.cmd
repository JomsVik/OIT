@echo off
setlocal
cd /d "%~dp0"
set "DATABASE_PATH=data/local.sqlite3"
if not exist "backups" mkdir "backups"
for /f %%T in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "oit_stamp=%%T"
set "oit_backup=backups/local-%oit_stamp%-%RANDOM%.sqlite3"
oit-portal.exe backup "%oit_backup%"
if errorlevel 1 (
  echo Backup failed. Read the error above.
) else (
  echo Saved: %oit_backup%
)
pause
