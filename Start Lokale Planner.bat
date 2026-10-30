@echo off
if not exist "%~dp0dist\Project Planner.html" (
  echo Bouw de planner eerst: npm install en daarna npm run build
  pause
  exit /b 1
)
start "" "%~dp0dist\Project Planner.html"
