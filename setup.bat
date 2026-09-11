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
    echo   Κατέβασε το από: https://nodejs.org
    echo   Εγκατάστησε και πάτα "Finish"
    echo   Μετά τρέξ ξανά αυτό το αρχείο.
    echo.
    start https://nodejs.org
    pause
    exit /b
)

echo   ✅ Node.js εντοπίστηκε
echo.

REM Install dependencies
echo   📦 Εγκατάσταση εξαρτήσεων...
call npm install --production 2>nul
echo   ✅ Εγκατάσταση ολοκληρώθηκε!
echo.

REM Create auto-start shortcut
echo   ⚙️ Δημιουργία αυτόματης εκκίνησης...
set SCRIPT_DIR=%~dp0

REM Create VBS for silent auto-start
echo Set WshShell = CreateObject("WScript.Shell") > "%SCRIPT_DIR%auto-start.vbs"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%SCRIPT_DIR%auto-start.vbs"
echo WshShell.Run "cmd /c node server.js", 0, False >> "%SCRIPT_DIR%auto-start.vbs"

REM Copy to Windows Startup
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy "%SCRIPT_DIR%auto-start.vbs" "%STARTUP%\factory-maintenance.vbs" >nul 2>nul
echo   ✅ Auto-start εγκαταστάθηκε!
echo.

REM Create desktop shortcut
set DESKTOP=%USERPROFILE%\Desktop
echo Set WshShell = CreateObject("WScript.Shell") > "%DESKTOP%\Factory Maintenance.bat"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%DESKTOP%\Factory Maintenance.bat"
echo WshShell.Run "cmd /c node server.js", 1, False >> "%DESKTOP%\Factory Maintenance.bat"
echo   ✅ Συντόμευση στην επιφάνεια εργασίας!
echo.

echo   ══════════════════════════════════════
echo   ✅ ΕΓΚΑΤΑΣΤΑΣΗ ΟΛΟΚΛΗΡΩΘΗΚΕ!
echo.
echo   Για να ξεκινήσει:
echo   • Διπλό κλικ στο "Factory Maintenance" στην επιφάνεια
echo   • Ή διπλό κλικ στο "START.bat"
echo.
echo   Άνοιξε browser: http://localhost:3000
echo   Login: admin / admin123
echo.
echo   ΚΙΝΗΤΑ: http://[IP_ΥΠΟΛΟΓΙΣΤΗ]:3000
echo   (Βρες IP: cmd ^> ipconfig ^> IPv4 Address)
echo   ══════════════════════════════════════
echo.
pause
