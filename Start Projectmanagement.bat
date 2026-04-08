@echo off
setlocal

cd /d "%~dp0"

set "APP_DIR=%~dp0"
set "PYTHON_EXE=%APP_DIR%python\python.exe"
set "APP_FILE=%APP_DIR%app.py"
set "APP_URL=http://localhost:5000"

if not exist "%PYTHON_EXE%" (
    echo Python not set up yet. Running setup first...
    echo.
    call "%APP_DIR%setup.bat"
)

if not exist "%PYTHON_EXE%" (
    echo.
    echo ERROR: Python executable not found:
    echo %PYTHON_EXE%
    pause
    exit /b 1
)

if not exist "%APP_FILE%" (
    echo.
    echo ERROR: app.py not found:
    echo %APP_FILE%
    pause
    exit /b 1
)

echo Starting Flask server...
start "Flask Server" cmd /k ""%PYTHON_EXE%" "%APP_FILE%""

echo Waiting a few seconds for Flask to start...
timeout /t 5 /nobreak >nul

echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window "%APP_URL%"

endlocal
exit /b 0