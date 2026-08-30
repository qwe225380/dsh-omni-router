@echo off
rem raw arm wrapper: independent DSH_HOME, headless profile, NO Omni.
set "SMOKE_ROOT=%~dp0"
set "DSH_HOME=%SMOKE_ROOT%homes\raw"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"

where dsh >nul 2>nul
if %errorlevel%==0 (
  dsh --profile headless "%~1"
) else (
  npx --yes @deepseek-ai/dsh --profile headless "%~1"
)