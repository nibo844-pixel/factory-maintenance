@echo off
echo.
echo   🏭 Εγκατάσταση Factory Maintenance
echo   ─────────────────────────────────────
echo.

REM Ελεγχος αν υπάρχει το Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   ❌ Δεν βρέθηκε το Node.js!
    echo   Κατέβαστε το από: https://nodejs.org
    echo   Εγκαταστήστε και τρέξτε ξανά αυτό το αρχείο.
    pause
    exit /b
)
echo   ✅ Node.js βρέθηκε
echo.

REM Εγκατάσταση εξαρτήσεων
echo   📦 Εγκατάσταση εξαρτήσεων...
call npm install --production
echo.

REM Δημιουργία auto-start
echo   ⚙️ Εγκατάσταση αυτόματης εκκίνησης...

REM Δημιουργία .vbs για auto-start χωρίς παράθυρο
set SCRIPT_DIR=%~dp0
set VBS_PATH=%SCRIPT_DIR%start-silent.vbs

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%VBS_PATH%"
echo WshShell.Run "cmd /c node server.js", 0, False >> "%VBS_PATH%"

REM Auto-start στο Startup folder
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy "%VBS_PATH%" "%STARTUP%\factory-maintenance.vbs" >nul 2>nul

echo.
echo   ✅ Εγκατάσταση ολοκληρώθηκε!
echo.
echo   📌 Τώρα μπορείς:
echo   • Να διπλοκλικάρεις "START.bat" για να ξεκινήσει
echo   • Η εφαρμογή θα ξεκινάει αυτόματα κάθε φορά που ανοίγεις το PC!
echo   • Άνοιξε browser → http://localhost:3000
echo.
pause
