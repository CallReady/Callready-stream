# Example: Manual Single-Endpoint Testing

This shows how to manually test individual endpoints using PowerShell if you want to customize the request payloads.

## Example 1: Test /gather-choose-scenario

```powershell
$body = @{
    CallSid = "CA_MANUAL_TEST_001"
    From = "+12025551234"
    SpeechResult = ""
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/gather-choose-scenario" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | Select-Object -ExpandProperty Content
```

## Example 2: Test /process-choose-scenario (User says "yes")

```powershell
$body = @{
    CallSid = "CA_MANUAL_TEST_001"
    SpeechResult = "yes"
    Confidence = "0.95"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/process-choose-scenario" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | Select-Object -ExpandProperty Content
```

## Example 3: Test /gather-scenario-menu with Retry

```powershell
$body = @{
    CallSid = "CA_MANUAL_TEST_001"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/gather-scenario-menu?retry=1" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | Select-Object -ExpandProperty Content
```

## Example 4: Test /process-scenario-menu (User picks Doctor - option 1)

```powershell
$body = @{
    CallSid = "CA_MANUAL_TEST_001"
    SpeechResult = "doctor appointment"
    Digits = "1"
    Confidence = "0.92"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/process-scenario-menu" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | Select-Object -ExpandProperty Content
```

## Example 5: Test /process-coaching-feedback (User wants feedback)

```powershell
$body = @{
    CallSid = "CA_MANUAL_TEST_001"
    SpeechResult = "yes"
    Digits = "1"
    Confidence = "0.96"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/process-coaching-feedback" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | Select-Object -ExpandProperty Content
```

## Pretty-Print the TwiML Response

To make the XML easier to read:

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3000/gather-choose-scenario" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"CallSid":"CA_TEST"}'

$twiml = $response.Content
$doc = New-Object System.Xml.XmlDocument
$doc.LoadXml($twiml)

$sw = New-Object System.IO.StringWriter
$writer = New-Object System.Xml.XmlTextWriter($sw, [System.Text.Encoding]::UTF8)
$writer.Formatting = [System.Xml.Formatting]::Indented
$doc.WriteContentTo($writer)
$writer.Close()

Write-Host $sw.ToString()
```

## Save Response to File

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3000/gather-choose-scenario" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"CallSid":"CA_TEST"}'

$response.Content | Out-File -FilePath "response.xml" -Encoding UTF8
Write-Host "Response saved to response.xml"
```

## Test All Confidence Levels

```powershell
$confidenceLevels = @(0.3, 0.5, 0.7, 0.9, 0.95)

foreach ($confidence in $confidenceLevels) {
    $body = @{
        CallSid = "CA_CONFIDENCE_TEST"
        SpeechResult = "yes"
        Confidence = $confidence
    } | ConvertTo-Json
    
    Write-Host "Testing with confidence: $confidence"
    
    $response = Invoke-WebRequest -Uri "http://localhost:3000/process-coaching-feedback" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "Response:"
    Write-Host $response.Content
    Write-Host "---`n"
}
```

## Common Request Patterns

### GET New Caller Info (No Database Query)
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" | Select-Object -ExpandProperty Content
```
Response: `{"status":"ok","timestamp":"2024-02-21T..."}`

### POST with Empty SpeechResult (Triggers Retry)
```powershell
$body = @{
    CallSid = "CA_EMPTY_TEST"
    SpeechResult = ""
    Confidence = "0"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/process-choose-scenario" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### POST with DTMF (Keypad Input)
```powershell
$body = @{
    CallSid = "CA_DTMF_TEST"
    Digits = "1"
    SpeechResult = ""
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/process-scenario-menu" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### POST with URI Parameter
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/gather-choose-scenario?retry=1" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"CallSid":"CA_RETRY_TEST"}'
```

## Chaining Multiple Requests

```powershell
# Helper function
function Test-Twilio ($endpoint, $callSid, $speechResult = "", $digits = "") {
    $body = @{
        CallSid = $callSid
        SpeechResult = $speechResult
        Digits = $digits
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "http://localhost:3000$endpoint" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
    
    return $response.Content
}

# Use it
$sid = "CA_CHAIN_TEST"
Test-Twilio "/gather-choose-scenario" $sid
Test-Twilio "/process-choose-scenario" $sid "no"
Test-Twilio "/gather-scenario-choice-confirm" $sid
Test-Twilio "/process-scenario-choice-confirm" $sid "yes"
Test-Twilio "/gather-confirm-doctor" $sid
```

## Inspect Request/Response Headers

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3000/health" -Verbose

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Content Type: $($response.Headers['Content-Type'])"
Write-Host "Response Time: $($response | Select-Object -ExpandProperty RawContentLength)"
```

---

For pre-built automated test paths, use the main `test-caller-paths.ps1` script instead.
