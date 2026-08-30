@echo off
rem One-time bootstrap for the omni arm: install dsh-omni-router into the
rem isolated DSH_HOME used by run-omni.cmd. The package path is written by
rem bootstrap.mjs (portable; no hardcoded dev-machine paths).
set "SMOKE_ROOT=%~dp0"
set "DSH_HOME=%SMOKE_ROOT%homes\omni"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"

set "OMNI_PKG="
if exist "%SMOKE_ROOT%omni-package-path.txt" set /p OMNI_PKG=<"%SMOKE_ROOT%omni-package-path.txt"
if "%OMNI_PKG%"=="" (
  echo Run bootstrap.mjs first (it writes omni-package-path.txt).
  exit /b 2
)

echo Installing "%OMNI_PKG%" into %DSH_HOME% ...
where dsh >nul 2>nul
if %errorlevel%==0 (
  dsh plugin --profile headless add "%OMNI_PKG%"
) else (
  npx --yes @deepseek-ai/dsh plugin --profile headless add "%OMNI_PKG%"
)
echo.
echo Done. The omni.patch.yml overlay (plus the installed bundle) is what the
echo omni arm mounts; verify with: node smoke\preflight.mjs --arm omni