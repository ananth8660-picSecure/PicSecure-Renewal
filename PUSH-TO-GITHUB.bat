@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed. Install Git for Windows, then run this file again.
  echo https://git-scm.com/download/win
  pause
  exit /b 1
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"
if /I not "%CURRENT_REMOTE%"=="https://github.com/ananth8660-picSecure/PicSecure-Renewal.git" (
  echo This folder is not linked to the expected PicSecure Renewal repository.
  echo Expected: https://github.com/ananth8660-picSecure/PicSecure-Renewal.git
  pause
  exit /b 1
)

echo Pushing PicSecure Renew v0.4.1 to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push did not finish. If a browser sign-in opened, complete it and run this file again.
  pause
  exit /b 1
)

echo.
echo Push complete:
echo https://github.com/ananth8660-picSecure/PicSecure-Renewal
pause
