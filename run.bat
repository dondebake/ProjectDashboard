@echo off
cd /d "%~dp0"

if not exist "python\python.exe" (
    echo Python not set up yet. Running setup first...
    echo.
    call "%~dp0setup.bat"
)

set PYTHONPATH=%~dp0
python\python.exe app.py

REM kleine wachttijd zodat server kan starten
timeout /t 5 >nul

REM Open Chrome met localhost
start chrome http://localhost:5000

pause
