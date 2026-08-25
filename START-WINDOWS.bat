@echo off
setlocal
title PicSecure Renew

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 or later and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing PicSecure Renew dependencies...
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting PicSecure Renew...
call npm run dev
endlocal
