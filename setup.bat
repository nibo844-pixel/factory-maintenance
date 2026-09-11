@echo off
title Factory Maintenance - Setup
color 0A
echo.
echo   ╔══════════════════════════════════════╗
echo   ║  🏭 FACTORY MAINTENANCE - SETUP    ║
echo   ╚══════════════════════════════════════╝
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   ❌ Node.js δεν βρέθηκε!
    echo.
    echo   Κατέβασε το Node.js από: https://nodejs.org
    echo   Εγκατάστησε με "Next → Next → Install"
    echo   Μετά τρέξ ξανά αυτό το αρχείο.
    echo.
    start https://nodejs.org
    pause
    exit /b
)

echo   ✅ Node.js εντοπίστηκε
echo.

REM Install dependencies (skip if node_modules exists and is big)
if not exist node_modules (
    echo   📦 Εγκατάσταση εξαρτήσεων...
    call npm install --production
    echo   ✅ Εγκατάσταση ολοκληρώθηκε!
) else (
    echo   ✅ Εξαρτήσεις ήδη εγκατεστημένες
)
echo.

REM Create desktop shortcut (.bat)
set DESKTOP=%USERPROFILE%\Desktop
(
    echo @echo off
    echo cd /d "%~dp0"
    echo title Factory Maintenance Server
    echo color 0B
    echo echo.
    echo echo   🏭 Factory Maintenance Server
    echo echo   ─────────────────────────────
    echo echo   Μην κλείσεις αυτό το παράθυρο!
    echo echo   Άνοιξε browser: http://localhost:3000
    echo echo.
    echo node server.js
    echo pause
) > "%DESKTOP%\Factory Maintenance.bat"
echo   ✅ Συντόμευση στην επιφάνεια εργασίας!

REM Auto-start on Windows login (VBS - runs hidden)
set SCRIPT_DIR=%~dp0
echo Set WshShell = CreateObject("WScript.Shell") > "%SCRIPT_DIR%auto-start.vbs"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%SCRIPT_DIR%auto-start.vbs"
echo WshShell.Run "cmd /c node server.js", 0, False >> "%SCRIPT_DIR%auto-start.vbs"

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy "%SCRIPT_DIR%auto-start.vbs" "%STARTUP%\factory-maintenance.vbs" >nul 2>nul
echo   ✅ Αυτόματη εκκίνηση στην εκκίνηση του PC!
echo.

echo   ══════════════════════════════════════
echo   ✅ ΕΓΚΑΤΑΣΤΑΣΗ ΟΛΟΚΛΗΡΩΘΗΚΕ!
echo.
echo   Για να ξεκινήσει:
echo   1. Διπλό κλικ στο "Factory Maintenance" στην επιφάνεια
echo   2. Ή διπλό κλικ στο "START.bat" στον φάκελο
echo.
echo   Άνοιξε browser: http://localhost:3000
echo   Login: admin / admin123
echo.
echo   ΚΙΝΗΤΑ (στο ίδιο WiFi):
echo   1. Τρέξ cmd ^> ipconfig
echo   2. Βρες το IPv4 (π.χ. 192.168.1.50)
echo   3. Στο κινητό: http://192.168.1.50:3000
echo   ══════════════════════════════════════
echo.
pause
