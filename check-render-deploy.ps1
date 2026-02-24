# Check Render deployment status
# Usage: .\check-render-deploy.ps1

param(
    [string]$ServiceId = $null,
    [int]$Count = 5
)

# Get API key from environment
$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
    Write-Host "ERROR: RENDER_API_KEY environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:RENDER_API_KEY = 'your-api-key'" -ForegroundColor Yellow
    Write-Host "Get your API key from: https://dashboard.render.com/u/settings/api-keys" -ForegroundColor Yellow
    exit 1
}

# If no service ID provided, try to get it from environment
if (-not $ServiceId) {
    $ServiceId = $env:RENDER_SERVICE_ID
    if (-not $ServiceId) {
        Write-Host "ERROR: Service ID not provided and RENDER_SERVICE_ID not set" -ForegroundColor Red
        Write-Host "Usage: .\check-render-deploy.ps1 -ServiceId 'srv-xxxxx'" -ForegroundColor Yellow
        Write-Host "Or set: `$env:RENDER_SERVICE_ID = 'srv-xxxxx'" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To find your service ID:" -ForegroundColor Cyan
        Write-Host "1. Go to https://dashboard.render.com" -ForegroundColor White
        Write-Host "2. Click on your service" -ForegroundColor White
        Write-Host "3. The service ID is in the URL: dashboard.render.com/web/srv-XXXXX" -ForegroundColor White
        exit 1
    }
}

Write-Host "Checking deployments for service: $ServiceId" -ForegroundColor Cyan
Write-Host ""

# Render API endpoint
$apiUrl = "https://api.render.com/v1/services/$ServiceId/deploys"

try {
    # Make API request
    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Accept" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$apiUrl`?limit=$Count" -Headers $headers -Method Get
    
    if ($response.PSObject.Properties['deploys']) {
        $deploys = $response.deploys
    } elseif ($response -is [Array]) {
        $deploys = $response
    } else {
        $deploys = @($response)
    }
    
    if ($deploys.Count -eq 0) {
        Write-Host "No deployments found" -ForegroundColor Yellow
        exit 0
    }
    
    # Display deployment status
    Write-Host "Recent Deployments:" -ForegroundColor Green
    Write-Host ("=" * 80) -ForegroundColor Gray
    
    foreach ($deploy in $deploys) {
        $id = $deploy.id
        $status = $deploy.status
        $createdAt = $deploy.createdAt
        $finishedAt = $deploy.finishedAt
        $commitId = if ($deploy.commit) { $deploy.commit.id.Substring(0, [Math]::Min(7, $deploy.commit.id.Length)) } else { "N/A" }
        $commitMsg = if ($deploy.commit) { $deploy.commit.message } else { "N/A" }
        
        # Color based on status
        $statusColor = switch ($status) {
            "live" { "Green" }
            "build_in_progress" { "Yellow" }
            "update_in_progress" { "Yellow" }
            "pre_deploy_in_progress" { "Yellow" }
            "build_failed" { "Red" }
            "update_failed" { "Red" }
            "canceled" { "Magenta" }
            "deactivated" { "Gray" }
            default { "White" }
        }
        
        Write-Host "`nDeploy ID: $id" -ForegroundColor Cyan
        Write-Host "Status:    " -NoNewline
        Write-Host $status -ForegroundColor $statusColor
        Write-Host "Commit:    $commitId - $commitMsg" -ForegroundColor White
        Write-Host "Created:   $createdAt" -ForegroundColor Gray
        if ($finishedAt) {
            Write-Host "Finished:  $finishedAt" -ForegroundColor Gray
        } else {
            Write-Host "Finished:  (in progress)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Gray
    
    # Check for stuck/in-progress deployments
    $inProgress = $deploys | Where-Object { 
        $_.status -like "*in_progress*" -or $_.status -eq "created" 
    }
    
    if ($inProgress.Count -gt 0) {
        Write-Host "`nWARNING: Found $($inProgress.Count) deployment(s) in progress" -ForegroundColor Yellow
        
        foreach ($deploy in $inProgress) {
            $createdDate = [DateTime]::Parse($deploy.createdAt)
            $minutesAgo = [Math]::Round(((Get-Date) - $createdDate).TotalMinutes, 1)
            
            Write-Host "  - Deploy $($deploy.id): $($deploy.status) (started $minutesAgo minutes ago)" -ForegroundColor Yellow
            
            if ($minutesAgo -gt 10) {
                Write-Host "    ^ This deployment may be stuck! Consider canceling it." -ForegroundColor Red
            }
        }
        
        Write-Host "`nTo cancel a stuck deployment:" -ForegroundColor Cyan
        Write-Host "1. Go to: https://dashboard.render.com/web/$ServiceId" -ForegroundColor White
        Write-Host "2. Click on the Events tab" -ForegroundColor White
        Write-Host "3. Find the in-progress deployment and click Cancel" -ForegroundColor White
    } else {
        $latestDeploy = $deploys[0]
        if ($latestDeploy.status -eq "live") {
            Write-Host "`n[OK] Latest deployment is LIVE" -ForegroundColor Green
        } else {
            Write-Host "`n[!] Latest deployment status: $($latestDeploy.status)" -ForegroundColor Yellow
        }
    }
    
} catch {
    Write-Host "ERROR: Failed to fetch deployment status" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Message -like "*401*" -or $_.Exception.Message -like "*Unauthorized*") {
        Write-Host "`nYour API key may be invalid. Check:" -ForegroundColor Yellow
        Write-Host "https://dashboard.render.com/u/settings/api-keys" -ForegroundColor Yellow
    }
    
    if ($_.Exception.Message -like "*404*" -or $_.Exception.Message -like "*Not Found*") {
        Write-Host "`nService ID may be incorrect." -ForegroundColor Yellow
        Write-Host "Find it at: https://dashboard.render.com" -ForegroundColor Yellow
    }
    
    exit 1
}
