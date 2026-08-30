@echo off
rem One-time bootstrap for the omni arm: install dsh-omni-router into the
rem isolated DSH_HOME used by run-omni.cmd. Run BEFORE the first benchmark.
set "SMOKE_ROOT=%~dp0"
set "DSH_HOME=%SMOKE_ROOT%homes\omni"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"

echo Installing dsh-omni-router into %DSH_HOME% ...
where dsh >nul 2>nul
if %errorlevel%==0 (
  dsh plugin --profile headless add "D:\dsh\dsh workspace\01\omni-router"
) else (
  npx --yes @deepseek-ai/dsh plugin --profile headless add "D:\dsh\dsh workspace\01\omni-router"
)
echo.
echo Done. Restart any DSH process for this DSH_HOME, then select the
echo "Omni Router" preset in the headless session before running smoke.