@echo off
title JARVIS Background Installer
color 0B

echo ===================================================
echo [JARVIS] Installing Silent Startup Daemon
echo ===================================================
echo.

set "SCRIPT_PATH=%~dp0run-silent.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\JARVIS_RepoTracker.lnk"

echo Creating background shortcut in your Windows Startup folder...
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut('%SHORTCUT_PATH%'); $shortcut.TargetPath = 'wscript.exe'; $shortcut.Arguments = '\"%SCRIPT_PATH%\"'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.WindowStyle = 1; $shortcut.Save()"

echo.
echo [SUCCESS] JARVIS has been successfully added to Windows Startup!
echo It will now boot up silently in the background every time you log into your PC.
echo.
echo You can access the UI anytime by going to http://localhost:3000
echo.
echo To uninstall: Press Win+R, type "shell:startup", and delete the "JARVIS_RepoTracker" shortcut.
echo.
pause
