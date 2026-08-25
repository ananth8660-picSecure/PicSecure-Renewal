@echo off
setlocal
title PicSecure Renew Production Build

if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)

call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo PicSecure Renew production build completed successfully.
pause
endlocal
