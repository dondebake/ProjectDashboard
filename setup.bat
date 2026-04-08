@echo off
setlocal

cd /d "%~dp0"

echo ===================================
echo  ProjectDashboard Setup
echo ===================================
echo.

set PYTHON_DIR=%~dp0python
set PYTHON_EXE=%PYTHON_DIR%\python.exe
set PYTHON_VERSION=3.14.0
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip
set PYTHON_ZIP=%~dp0python-embed.zip

if exist "%PYTHON_EXE%" (
    echo [OK] Embedded Python already present, skipping download.
    goto :install_packages
)

echo Downloading Python %PYTHON_VERSION% embeddable package...
powershell -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%' -UseBasicParsing"
if errorlevel 1 (
    echo.
    echo ERROR: Could not download Python. Check your internet connection.
    pause
    exit /b 1
)

echo Extracting Python...
if not exist "%PYTHON_DIR%" mkdir "%PYTHON_DIR%"
powershell -Command "Expand-Archive -Path '%PYTHON_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force"
del "%PYTHON_ZIP%"

echo Enabling site-packages in embedded Python...
for %%f in ("%PYTHON_DIR%\python3*._pth") do (
    powershell -Command "(Get-Content '%%f') -replace '#import site', 'import site' | Set-Content '%%f'"
)

echo Downloading pip bootstrap...
powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%PYTHON_DIR%\get-pip.py' -UseBasicParsing"
"%PYTHON_EXE%" "%PYTHON_DIR%\get-pip.py" --no-warn-script-location --quiet
del "%PYTHON_DIR%\get-pip.py"

:install_packages
echo.
echo Installing packages from requirements.txt...
"%PYTHON_EXE%" -m pip install --no-warn-script-location --quiet -r "%~dp0requirements.txt"

echo.
echo ===================================
echo  Setup complete!
echo  Run the app with: run.bat
echo ===================================
pause
