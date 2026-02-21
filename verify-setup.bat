@echo off
REM Pre-Test Setup Verification Script
REM Checks that everything is ready to run the test suite

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║    CallReady Test Suite - Setup Verification                  ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

setlocal enabledelayedexpansion

set allGood=1

REM Check PowerShell
echo [*] Checking PowerShell...
powershell -Command "Write-Host 'PowerShell OK' -ForegroundColor Green" 2>nul
if %errorlevel% neq 0 (
    echo [!] PowerShell not found
    set allGood=0
) else (
    echo [+] PowerShell available
)

REM Check Node.js
echo.
echo [*] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not installed
    set allGood=0
) else (
    for /f "tokens=*" %%i in ('node --version') do echo [+] Node.js %%i found
)

REM Check npm
echo.
echo [*] Checking npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] npm not installed
    set allGood=0
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo [+] npm %%i found
)

REM Check package.json
echo.
echo [*] Checking package.json...
if exist package.json (
    echo [+] package.json found
) else (
    echo [!] package.json not found
    set allGood=0
)

REM Check server.js
echo.
echo [*] Checking server.js...
if exist server.js (
    echo [+] server.js found
    
    REM Check for /health endpoint
    findstr /m "app.get.*health" server.js >nul 2>&1
    if %errorlevel% equ 0 (
        echo [+] /health endpoint found
    ) else (
        echo [!] /health endpoint not found in server.js
        set allGood=0
    )
) else (
    echo [!] server.js not found
    set allGood=0
)

REM Check test script
echo.
echo [*] Checking test script...
if exist test-caller-paths.ps1 (
    echo [+] test-caller-paths.ps1 found
) else (
    echo [!] test-caller-paths.ps1 not found
    set allGood=0
)

REM Check documentation
echo.
echo [*] Checking documentation...
if exist TEST-SUITE-README.md (
    echo [+] TEST-SUITE-README.md found
) else (
    echo [!] TEST-SUITE-README.md not found
)

if exist TEST-GUIDE.md (
    echo [+] TEST-GUIDE.md found
) else (
    echo [!] TEST-GUIDE.md not found
)

if exist TEST-QUICK-REF.md (
    echo [+] TEST-QUICK-REF.md found
) else (
    echo [!] TEST-QUICK-REF.md not found
)

REM Check node_modules
echo.
echo [*] Checking dependencies...
if exist node_modules\nul (
    echo [+] node_modules directory exists
) else (
    echo [!] node_modules not found
    echo     Run: npm install
    set allGood=0
)

REM Check .env configuration
echo.
echo [*] Checking environment setup...
if exist .env (
    echo [+] .env file found
) else (
    echo [?] .env file not found (may not be needed for basic testing)
)

REM Final check
echo.
echo ════════════════════════════════════════════════════════════════
if %allGood% equ 1 (
    echo [✓] Setup verification complete - Ready to test!
    echo.
    echo Next steps:
    echo   1. Start the server in Terminal 1:
    echo      npm start
    echo.
    echo   2. In Terminal 2, run tests:
    echo      .\test-caller-paths.ps1 -TestPath new-caller
    echo.
    echo   Or use the batch launcher:
    echo      .\test.bat new-caller
) else (
    echo [✗] Some issues found - Please resolve above before testing
    echo.
    echo Troubleshooting:
    echo   - Node.js/npm: https://nodejs.org/
    echo   - Dependencies: npm install
    echo   - Server config: Check .env file setup
)
echo ════════════════════════════════════════════════════════════════
echo.

pause
