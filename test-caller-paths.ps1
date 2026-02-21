<#
.SYNOPSIS
    PowerShell test script to simulate Twilio webhook chain for CallReady
    Tests each caller phase in sequence with the same CallSid
    
.DESCRIPTION
    This script replays the complete webhook chain for different caller paths:
    - NEW CALLER: voice → opener → choose_scenario → scenario_menu → confirm → roleplay
    - RETURNING CALLER: Same but may intercept at previous_scenario
    - COACHING: roleplay → coaching_feedback → wrap_up → ending
    
    Each response is printed with formatted TwiML for visual inspection.
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("new-caller", "returning-caller", "coaching", "error-path")]
    [string]$TestPath = "new-caller",
    
    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "http://localhost:3000",
    
    [Parameter(Mandatory=$false)]
    [string]$PhoneNumber = "+12025551234"
)

# Color helper
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "Green"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Format XML for readability
function Format-Xml {
    param([string]$Xml)
    
    if ([string]::IsNullOrWhiteSpace($Xml)) {
        return "(No response)"
    }
    
    try {
        $reader = New-Object System.Xml.XmlReaderSettings
        $reader.ConformanceLevel = [System.Xml.ConformanceLevel]::Document
        $doc = New-Object System.Xml.XmlDocument
        $doc.LoadXml($Xml)
        
        $sw = New-Object System.IO.StringWriter
        $writer = New-Object System.Xml.XmlTextWriter($sw, [System.Text.Encoding]::UTF8)
        $writer.Formatting = [System.Xml.Formatting]::Indented
        $writer.IndentString = "  "
        $doc.WriteContentTo($writer)
        $writer.Close()
        
        return $sw.ToString()
    } catch {
        return $Xml
    }
}

# Make request and parse response
function Invoke-TwilioEndpoint {
    param(
        [string]$Endpoint,
        [hashtable]$Body,
        [string]$Method = "POST",
        [int]$PhaseNumber = 0,
        [string]$PhaseName = ""
    )
    
    $uri = "$ServerUrl$Endpoint"
    
    Write-ColorOutput "`n========================================" "Cyan"
    Write-ColorOutput "PHASE $PhaseNumber: $PhaseName" "Cyan"
    Write-ColorOutput "========================================" "Cyan"
    Write-ColorOutput "Endpoint: $Endpoint" "Yellow"
    Write-ColorOutput "URL: $uri" "Yellow"
    
    if ($Body) {
        Write-ColorOutput "Request Body:" "Yellow"
        $Body | ConvertTo-Json | Write-Host
    }
    
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            ContentType = "application/json"
            TimeoutSec = 10
        }
        
        if ($Body) {
            $params.Body = $Body | ConvertTo-Json
        }
        
        $response = Invoke-WebRequest @params
        $twiml = $response.Content
        
        Write-ColorOutput "`n✓ Response Status: $($response.StatusCode)" "Green"
        Write-ColorOutput "`nTwiML Response:" "Green"
        Write-Host "---" 
        Write-Host (Format-Xml $twiml)
        Write-Host "---"
        
        return $twiml
    } catch {
        Write-ColorOutput "`n✗ Error: $($_.Exception.Message)" "Red"
        if ($_.Exception.Response) {
            Write-ColorOutput "Status Code: $($_.Exception.Response.StatusCode)" "Red"
        }
        return $null
    }
}

# ==============================================================================
# TEST: NEW CALLER PATH
# ==============================================================================
function Test-NewCaller {
    Write-ColorOutput "`n`n" "White"
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Magenta"
    Write-ColorOutput "║           NEW CALLER PATH TEST                                ║" "Magenta"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Magenta"
    
    $callSid = "CA_$(Get-Random -Minimum 100000 -Maximum 999999)_NEW"
    Write-ColorOutput "Using CallSid: $callSid" "Cyan"
    
    # Phase 1: Initial voice endpoint (simulating Twilio POST to /voice)
    Invoke-TwilioEndpoint `
        -Endpoint "/voice" `
        -Method "GET" `
        -PhaseNumber 1 `
        -PhaseName "Initial Voice Webhook"
    
    # Phase 2: Opener
    $openerBody = @{
        CallSid = $callSid
        From = $PhoneNumber
        To = "+15551234567"
        CallStatus = "ringing"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/voice" `
        -Body $openerBody `
        -PhaseNumber 2 `
        -PhaseName "Opener (First-time caller greeting)"
    
    # Phase 3: Choose Scenario
    $chooseScenarioBody = @{
        CallSid = $callSid
        From = $PhoneNumber
        Digits = ""
        SpeechResult = ""
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-choose-scenario" `
        -Body $chooseScenarioBody `
        -PhaseNumber 3 `
        -PhaseName "Choose Scenario (Initial question)"
    
    # Phase 4: Process Choose Scenario (User says "I have one")
    $processChooseBody = @{
        CallSid = $callSid
        SpeechResult = "I have one in mind"
        Confidence = "0.95"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-choose-scenario" `
        -Body $processChooseBody `
        -PhaseNumber 4 `
        -PhaseName "Process Choose Scenario (User has a scenario)"
    
    # Phase 5: Scenario Menu
    $menuBody = @{
        CallSid = $callSid
        SpeechResult = ""
        Digits = ""
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-scenario-menu" `
        -Body $menuBody `
        -PhaseNumber 5 `
        -PhaseName "Scenario Menu (3 options)"
    
    # Phase 6: Process Scenario Menu (User picks option 1: Doctor)
    $processMenuBody = @{
        CallSid = $callSid
        SpeechResult = "scheduling a doctor appointment"
        Digits = "1"
        Confidence = "0.92"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-scenario-menu" `
        -Body $processMenuBody `
        -PhaseNumber 6 `
        -PhaseName "Process Scenario Menu (Doctor appointment selected)"
    
    # Phase 7: Confirm Doctor
    $confirmBody = @{
        CallSid = $callSid
        SpeechResult = ""
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-confirm-doctor" `
        -Body $confirmBody `
        -PhaseNumber 7 `
        -PhaseName "Confirm Doctor (Does this sound good?)"
    
    # Phase 8: Process Confirm (User says yes)
    $processConfirmBody = @{
        CallSid = $callSid
        SpeechResult = "yes"
        Confidence = "0.98"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-confirm-doctor" `
        -Body $processConfirmBody `
        -PhaseNumber 8 `
        -PhaseName "Process Confirm Doctor (User accepted)"
    
    Write-ColorOutput "`n✓ New Caller Path Complete" "Green"
}

# ==============================================================================
# TEST: RETURNING CALLER PATH (with previous scenario option)
# ==============================================================================
function Test-ReturningCaller {
    Write-ColorOutput "`n`n" "White"
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Magenta"
    Write-ColorOutput "║        RETURNING CALLER PATH TEST (with previous scenario)     ║" "Magenta"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Magenta"
    
    $callSid = "CA_$(Get-Random -Minimum 100000 -Maximum 999999)_RET"
    Write-ColorOutput "Using CallSid: $callSid" "Cyan"
    
    # Phase 1: Opener
    $openerBody = @{
        CallSid = $callSid
        From = $PhoneNumber
        To = "+15551234567"
        CallStatus = "ringing"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/voice" `
        -Body $openerBody `
        -PhaseNumber 1 `
        -PhaseName "Opener (Returning caller greeting)"
    
    # Phase 2: Choose Scenario (gets redirected to previous scenario)
    $chooseScenarioBody = @{
        CallSid = $callSid
        From = $PhoneNumber
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-choose-scenario" `
        -Body $chooseScenarioBody `
        -PhaseNumber 2 `
        -PhaseName "Choose Scenario (redirects to previous scenario check)"
    
    # Phase 3: Previous Scenario (do you want to re-practice?)
    $previousScenarioBody = @{
        CallSid = $callSid
        SpeechResult = ""
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-previous-scenario" `
        -Body $previousScenarioBody `
        -PhaseNumber 3 `
        -PhaseName "Previous Scenario (Would you like to practice that again?)"
    
    # Phase 4: Process Previous Scenario (User says NO - wants something different)
    $processPrevBody = @{
        CallSid = $callSid
        SpeechResult = "no, something different"
        Confidence = "0.91"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-previous-scenario" `
        -Body $processPrevBody `
        -PhaseNumber 4 `
        -PhaseName "Process Previous Scenario (User declined, wants new scenario)"
    
    # Phase 5: Back to Scenario Menu
    $menuBody = @{
        CallSid = $callSid
        SpeechResult = ""
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-scenario-menu" `
        -Body $menuBody `
        -PhaseNumber 5 `
        -PhaseName "Scenario Menu (3 options)"
    
    # Phase 6: User picks Pharmacy
    $processMenuBody = @{
        CallSid = $callSid
        SpeechResult = "pharmacy"
        Digits = "2"
        Confidence = "0.89"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-scenario-menu" `
        -Body $processMenuBody `
        -PhaseNumber 6 `
        -PhaseName "Process Scenario Menu (Pharmacy selected)"
    
    Write-ColorOutput "`n✓ Returning Caller Path Complete" "Green"
}

# ==============================================================================
# TEST: COACHING & WRAP-UP PHASE
# ==============================================================================
function Test-CoachingPath {
    Write-ColorOutput "`n`n" "White"
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Magenta"
    Write-ColorOutput "║        COACHING & WRAP-UP PATH TEST                           ║" "Magenta"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Magenta"
    
    $callSid = "CA_$(Get-Random -Minimum 100000 -Maximum 999999)_COACH"
    Write-ColorOutput "Using CallSid: $callSid" "Cyan"
    
    # Phase 1: Coaching Feedback (after roleplay complete)
    $coachingBody = @{
        CallSid = $callSid
        Transcript = "Agent: Hi, this is Dr. Smith's office. Caller: Hi, I'd like to schedule an appointment."
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-coaching-feedback" `
        -Body $coachingBody `
        -PhaseNumber 1 `
        -PhaseName "Coaching Feedback (Would you like feedback?)"
    
    # Phase 2: User says YES to feedback
    $processFeedbackYesBody = @{
        CallSid = $callSid
        SpeechResult = "yes"
        Digits = "1"
        Confidence = "0.95"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-coaching-feedback" `
        -Body $processFeedbackYesBody `
        -PhaseNumber 2 `
        -PhaseName "Process Coaching Feedback (User wants feedback)"
    
    # Phase 3: Wrap-up (after feedback delivered)
    $wrapupBody = @{
        CallSid = $callSid
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/gather-wrap-up" `
        -Body $wrapupBody `
        -PhaseNumber 3 `
        -PhaseName "Wrap-up (Practice again or end?)"
    
    # Phase 4: User wants to END
    $processWrapupEndBody = @{
        CallSid = $callSid
        SpeechResult = "end the session"
        Digits = "2"
        Confidence = "0.93"
    }
    
    Invoke-TwilioEndpoint `
        -Endpoint "/process-wrap-up" `
        -Body $processWrapupEndBody `
        -PhaseNumber 4 `
        -PhaseName "Process Wrap-up (User ending session)"
    
    Write-ColorOutput "`n✓ Coaching Path Complete" "Green"
}

# ==============================================================================
# TEST: ERROR PATH (No sessions left)
# ==============================================================================
function Test-ErrorPath {
    Write-ColorOutput "`n`n" "White"
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Magenta"
    Write-ColorOutput "║            ERROR PATH TEST (No sessions remaining)             ║" "Magenta"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Magenta"
    
    $callSid = "CA_$(Get-Random -Minimum 100000 -Maximum 999999)_ERR"
    Write-ColorOutput "Using CallSid: $callSid" "Cyan"
    
    # Note: This requires the server to return the error based on DB state
    # For testing, this would hit the no-sessions check during /voice endpoint
    
    Write-ColorOutput "`nNote: No-sessions error requires database configuration." "Yellow"
    Write-ColorOutput "This path is tested when callerRuntime.cycle_sessions_used >= cycle_sessions_cap" "Yellow"
}

# ==============================================================================
# MAIN
# ==============================================================================

Write-ColorOutput "`n" "White"
Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Cyan"
Write-ColorOutput "║     CallReady Twilio Webhook Chain Test Suite                 ║" "Cyan"
Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Cyan"
Write-ColorOutput "Server URL: $ServerUrl" "Cyan"
Write-ColorOutput "Test Phone: $PhoneNumber" "Cyan"

# Verify server is running
Write-ColorOutput "`nChecking server connectivity..." "Yellow"
try {
    $healthCheck = Invoke-WebRequest -Uri "$ServerUrl/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-ColorOutput "✓ Server is reachable" "Green"
} catch {
    Write-ColorOutput "✗ Server not reachable at $ServerUrl" "Red"
    Write-ColorOutput "  Make sure the server is running: npm start" "Yellow"
    exit 1
}

# Run selected test path
switch ($TestPath) {
    "new-caller" { Test-NewCaller }
    "returning-caller" { Test-ReturningCaller }
    "coaching" { Test-CoachingPath }
    "error-path" { Test-ErrorPath }
}

Write-ColorOutput "`n`n" "White"
Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Cyan"
Write-ColorOutput "║                    Test Suite Complete                        ║" "Cyan"
Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Cyan"
Write-ColorOutput "`nTo run a different test path, use:" "Yellow"
Write-ColorOutput "  .\test-caller-paths.ps1 -TestPath new-caller" "Gray"
Write-ColorOutput "  .\test-caller-paths.ps1 -TestPath returning-caller" "Gray"
Write-ColorOutput "  .\test-caller-paths.ps1 -TestPath coaching" "Gray"
Write-ColorOutput "  .\test-caller-paths.ps1 -TestPath error-path" "Gray"
