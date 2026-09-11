@echo off
echo   Δημιουργία συντόμευσης στην επιφάνεια εργασίας...

set SCRIPT_DIR=%~dp0
set DESKTOP=%USERPROFILE%\Desktop

echo Set WshShell = CreateObject("WScript.Shell") > "%DESKTOP%\Factory Maintenance.vbs"
echo Set shortcut = WshShell.CreateShortcut("%DESKTOP%\Factory Maintenance.vbs") >> "%DESKTOP%\Factory Maintenance.vbs"
echo shortcut.TargetPath = "%SCRIPT_DIR%START.bat" >> "%DESKTOP%\Factory Maintenance.vbs"
echo shortcut.WorkingDirectory = "%SCRIPT_DIR%" >> "%DESKTOP%\Factory Maintenance.vbs"
echo shortcut.IconLocation = "shell32.dll,21" >> "%DESKTOP%\Factory Maintenance.vbs"

echo.
echo   ✅ Εμφανίστηκε συντόμευση στην επιφάνεια εργασίας!
echo   Διπλό κλικ = ανοίγει την εφαρμογή
echo.
pause
