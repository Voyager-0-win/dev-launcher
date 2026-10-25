@echo off
setlocal
title DevLauncher
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [DevLauncher] Node.js 18+ is not installed or not in PATH.
  echo Install Node.js and try again.
  echo.
  pause
  exit /b 1
)
node "%~dp0src\index.js"
echo.
echo [DevLauncher] Program exited. Press any key to close this window.
pause >nul
