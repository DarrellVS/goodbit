@echo off
setlocal enabledelayedexpansion

rem Stops the Filmpje server started by start-local-client.bat.
rem Kills whatever is listening on the configured port, plus any leftover
rem node process running dist\server\src\index.js.

set "SERVER_DIR=C:\projects\filmpje\server"
set "PORT=4000"

rem Prefer the PORT from .env when present.
if exist "%SERVER_DIR%\.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%SERVER_DIR%\.env") do (
        if /i "%%A"=="PORT" set "PORT=%%B"
    )
)

set "KILLED=0"

rem 1. Kill the process listening on the port (and its children).
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    if not "%%P"=="0" (
        echo Stopping PID %%P listening on port %PORT% ...
        taskkill /PID %%P /T /F >nul 2>&1
        if !errorlevel! equ 0 set "KILLED=1"
    )
)

rem 2. Kill any leftover node process running the server entry point.
for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'dist.server.src.index' } | ForEach-Object { $_.ProcessId }"`) do (
    taskkill /PID %%P /T /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo Stopped leftover node PID %%P.
        set "KILLED=1"
    )
)

if "%KILLED%"=="1" (
    echo Filmpje server stopped.
) else (
    echo No running Filmpje server found on port %PORT%.
)

endlocal
