@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo SmartPrint V2 - CONFIRMATION MODE
echo Each job asks before it is sent to the printer.
echo ============================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 print_agent.py --mode confirmation
) else (
    python print_agent.py --mode confirmation
)

if errorlevel 1 (
    echo.
    echo The print agent stopped with an error.
    echo Check Python, your local config, and the setup guide.
    pause
)
endlocal
