# Test script for roleplay simulator endpoints
# Run with: ENABLE_ROLEPLAY_SIM=true node server.js
# Then: .\test-sim.ps1

$BaseUrl = "http://localhost:3000"

# Test 1: Start a simulator
Write-Host "=== Test 1: Start Simulator ===" -ForegroundColor Cyan
$startResponse = Invoke-WebRequest -Method POST `
  -Uri "$BaseUrl/dev/roleplay/start" `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{
    callSid = "CA_SIM_TEST_001"
    scenarioTag = "doctor_default"
  })

$start = $startResponse.Content | ConvertFrom-Json
Write-Host ($start | ConvertTo-Json -Depth 3) -ForegroundColor Green

# Test 2: Send first utterance
Write-Host "`n=== Test 2: First Utterance ===" -ForegroundColor Cyan
$utt1Response = Invoke-WebRequest -Method POST `
  -Uri "$BaseUrl/dev/roleplay/utterance" `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{
    callSid = "CA_SIM_TEST_001"
    utterance = "Hi, I'd like to schedule an appointment please"
  })

$utt1 = $utt1Response.Content | ConvertFrom-Json
Write-Host ($utt1 | ConvertTo-Json -Depth 3) -ForegroundColor Green

# Test 3: Send second utterance
Write-Host "`n=== Test 3: Second Utterance ===" -ForegroundColor Cyan
$utt2Response = Invoke-WebRequest -Method POST `
  -Uri "$BaseUrl/dev/roleplay/utterance" `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{
    callSid = "CA_SIM_TEST_001"
    utterance = "My name is John Smith"
  })

$utt2 = $utt2Response.Content | ConvertFrom-Json
Write-Host ($utt2 | ConvertTo-Json -Depth 3) -ForegroundColor Green

# Test 4: Reset simulator
Write-Host "`n=== Test 4: Reset Simulator ===" -ForegroundColor Cyan
$resetResponse = Invoke-WebRequest -Method POST `
  -Uri "$BaseUrl/dev/roleplay/reset" `
  -ContentType "application/json"

$reset = $resetResponse.Content | ConvertFrom-Json
Write-Host ($reset | ConvertTo-Json -Depth 3) -ForegroundColor Green

Write-Host "`n✓ All tests completed!" -ForegroundColor Cyan
