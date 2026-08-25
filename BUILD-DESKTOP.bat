@echo off
setlocal
cd /d "%~dp0"
where cargo >nul 2>&1
if errorlevel 1 (
  echo Rust is required for the compact Tauri installer.
  echo Install Rustup, reopen this terminal, and run this file again:
  echo https://rustup.rs
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm run desktop:build
if errorlevel 1 exit /b 1
echo.
echo Compact installer ready in src-tauri\target\release\bundle\nsis
pause
