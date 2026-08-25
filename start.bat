@echo off
cd /d "%~dp0"
title NWGB desk
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet.
  echo A download page will open. Install the LTS version, then double-click this file again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)
echo Installing...
call npm install
if errorlevel 1 (
  echo Install failed.
  pause
  exit /b 1
)
echo.
echo Open this in your browser:  http://localhost:3000
echo Leave this window open while you use the desk.
echo.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
npm start
pause
