# Fetch recent logs from Render service
# Requires environment variables: RENDER_API_KEY and RENDER_SERVICE_ID

param(
    [int]$Lines = 100,  # Number of log lines to fetch
    [string]$Filter = "",  # Optional: filter logs by text
    [switch]$Follow  # Follow logs in real-time (not implemented yet)
)

$apiKey = $env:RENDER_API_KEY
$serviceId = $env:RENDER_SERVICE_ID

if (-not $apiKey) {
    Write-Host "ERROR: RENDER_API_KEY environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:RENDER_API_KEY = 'your-api-key'" -ForegroundColor Yellow
    exit 1
}

if (-not $serviceId) {
    Write-Host "ERROR: RENDER_SERVICE_ID environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:RENDER_SERVICE_ID = 'your-service-id'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

Write-Host "`nFetching last $Lines log lines from Render service..." -ForegroundColor Cyan
Write-Host "Service ID: $serviceId`n" -ForegroundColor Gray

try {
    # Render API endpoint for logs
    $url = "https://api.render.com/v1/services/$serviceId/logs?limit=$Lines"
    
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    
    if ($response.logs) {
        $logs = $response.logs
        
        # Apply filter if specified
        if ($Filter) {
            $logs = $logs | Where-Object { $_ -like "*$Filter*" }
            Write-Host "Filtered for: '$Filter'" -ForegroundColor Yellow
            Write-Host ""
        }
        
        # Display logs
        foreach ($log in $logs) {
            # Color-code log levels
            if ($log -match "ERROR|CRITICAL") {
                Write-Host $log -ForegroundColor Red
            }
            elseif ($log -match "WARNING|WARN") {
                Write-Host $log -ForegroundColor Yellow
            }
            elseif ($log -match "SCENARIO_NOT_FOUND|SCENARIO_CONFIG_ERROR|ROLEPLAY_ERROR") {
                Write-Host $log -ForegroundColor Magenta
            }
            elseif ($log -match "CONFIG_DRIVEN_MODE|CONFIG_DRIVEN_CHECK|GREETING_LOG") {
                Write-Host $log -ForegroundColor Green
            }
            else {
                Write-Host $log
            }
        }
        
        Write-Host "`n$($logs.Count) log lines retrieved" -ForegroundColor Cyan
    }
    else {
        Write-Host "No logs found or unexpected response format" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "ERROR: Failed to fetch logs" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}
