@echo off
rem raw arm wrapper: independent DSH_HOME, headless profile, NO Omni.
rem Usage:
rem   run-raw.cmd "<task>"                        (SMOKE_ROOT = %~dp0)
rem   run-raw.cmd --smoke-root="<root>" "<task>"  (bootstrap fallback when the
rem                                                wrapper was copied to a
rem                                                no-space temp dir)
set "SMOKE_ROOT_ARG=%~1"
set "TASK=%~1"
set "SMOKE_ROOT_REAL=%~dp0"
if "%SMOKE_ROOT_ARG:~0,13%"=="--smoke-root=" (
  set "SMOKE_ROOT_REAL=%SMOKE_ROOT_ARG:~13%"
  set "TASK=%~2"
)
set "DSH_HOME=%SMOKE_ROOT_REAL%homes\raw"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"

where dsh >nul 2>nul
if %errorlevel%==0 (
  dsh --profile headless "%TASK%"
) else (
  npx --yes @deepseek-ai/dsh --profile headless "%TASK%"
)