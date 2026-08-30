@echo off
rem omni arm wrapper: separate independent DSH_HOME, headless profile, WITH Omni.
rem Run bootstrap-omni.cmd once BEFORE the first benchmark run.
set "SMOKE_ROOT=%~dp0"
set "DSH_HOME=%SMOKE_ROOT%homes\omni"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"

where dsh >nul 2>nul
if %errorlevel%==0 (
  dsh --profile headless "%~1"
) else (
  npx --yes @deepseek-ai/dsh --profile headless "%~1"
)