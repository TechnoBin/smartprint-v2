@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo SmartPrint V2 - AUTOMATIC MODE
echo Waiting jobs can print without confirmation.
echo Keep the printer supervised.
echo ============================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 print_agent.py --mode automatic
) else (
    python print_agent.py --mode automatic
)

if errorlevel 1 (
    echo.
    echo The print agent stopped with an error.
    echo Check Python, your local config, and the setup guide.
    pause
)
endlocal
