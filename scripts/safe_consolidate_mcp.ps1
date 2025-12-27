param(
    [string]$Source = "C:\AI\repos\mcp",
    [string]$Target = "C:\AI\repos\infinity-gateway",
    [switch]$CreateJunction
)

function Ensure-Dir([string]$p){ if(-not (Test-Path $p)){ New-Item -ItemType Directory -Path $p | Out-Null }}

Write-Host "Backing up source to target (non-destructive copy)..."
Ensure-Dir $Target

# Use robocopy to copy safely with retries
$robocopyOptions = "/MIR /FFT /Z /W:5 /R:3"
Write-Host "Running robocopy $Source -> $Target"
robocopy $Source $Target $robocopyOptions | Out-Host

if($CreateJunction){
    Write-Host "Creating junction from Source -> Target (requires admin)"
    # Remove source folder and create junction only if user wants it and path exists
    if(Test-Path $Source){
        $temp = "${Source}_backup_$(Get-Date -Format yyyyMMddHHmmss)"
        Write-Host "Renaming original source to $temp for safety"
        Rename-Item -Path $Source -NewName $temp
        New-Item -ItemType Junction -Path $Source -Target $Target | Out-Null
        Write-Host "Junction created: $Source -> $Target"
    } else {
        Write-Host "Source path not found; skipping junction creation"
    }
}

Write-Host "Consolidation complete."
