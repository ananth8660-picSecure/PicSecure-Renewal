@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run android:sync
if errorlevel 1 exit /b 1
cd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "..\PicSecure-Renew.apk" >nul
echo.
echo APK ready: PicSecure-Renew.apk
pause
