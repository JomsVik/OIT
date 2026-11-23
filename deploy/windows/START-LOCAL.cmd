@echo off
setlocal
cd /d "%~dp0"
set "BIND_ADDR=127.0.0.1:3000"
set "DATABASE_PATH=data/local.sqlite3"
set "COOKIE_SECURE=false"
if not exist ".env" (
  copy /y "local.env.example" ".env" >nul
  echo First start: set BOOTSTRAP_PASSWORD in .env and save the file.
  echo Password must contain 12 to 72 ASCII characters.
  start "" /wait notepad.exe ".env"
)
echo.
echo Open http://%BIND_ADDR% in your browser after the server starts.
echo Keep this window open. Press Ctrl+C to stop the portal.
echo.
oit-portal.exe
echo.
echo Portal stopped. If startup failed, read the error above.
pause
