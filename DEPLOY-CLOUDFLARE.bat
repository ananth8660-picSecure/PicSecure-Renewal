@echo off
setlocal
cd /d "%~dp0"
echo Building and deploying PicSecure Renew to Cloudflare Workers...
call npm run cloudflare:deploy
if errorlevel 1 (
  echo.
  echo Deployment did not finish. Check DEPLOY-CLOUDFLARE.md.
  pause
  exit /b 1
)
echo.
echo Deployment complete. Copy the HTTPS URL into VITE_PICSECURE_API_BASE.
pause
