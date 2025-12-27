Param()
# PowerShell wrapper for integration_test.sh
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
cd $root
Write-Output "Starting docker compose..."
docker compose -f docker-compose.postgres.yml up -d --build
Start-Sleep -Seconds 8
Write-Output "Registering test agent"
Invoke-RestMethod -Uri http://localhost:8005/agents/register -Method Post -Headers @{ 'x-api-key' = 'changeme' } -Body @{ name = 'ps_test_agent'; endpoint = 'http://httpbin.org/status/200' }
Write-Output "Enqueueing task"
Invoke-RestMethod -Uri http://localhost:8005/enqueue -Method Post -Headers @{ 'x-api-key' = 'changeme' } -Body (@{ agent = 'ps_test_agent'; command = '{}' } | ConvertTo-Json)
Write-Output "Integration test complete. Check logs: docker compose -f docker-compose.postgres.yml logs -f background_agent"
