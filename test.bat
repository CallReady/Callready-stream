@echo off
REM Quick launcher for PowerShell test script
REM Usage: test.bat [new-caller|returning-caller|coaching|error-path]

setlocal enabledelayedexpansion

set TestPath=%1
if "%TestPath%"=="" set TestPath=new-caller

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║     CallReady Twilio Webhook Test Suite                       ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Starting test: %TestPath%
echo.

powershell -ExecutionPolicy Bypass -File "test-caller-paths.ps1" -TestPath "%TestPath%"

pause
