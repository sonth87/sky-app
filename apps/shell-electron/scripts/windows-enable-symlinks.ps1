<#
.SYNOPSIS
  Bat Windows Developer Mode de cho phep tao symbolic link khong can quyen Administrator.

.DESCRIPTION
  Chi can chay 1 lan cho moi may Windows dung de build "pnpm dist:win".
  electron-builder tai goi winCodeSign chua symlink (dung cho macOS code signing tools);
  giai nen symlink do tren Windows can quyen SeCreateSymbolicLinkPrivilege, quyen nay
  chi duoc cap mac dinh cho Administrator hoac khi bat Developer Mode.

.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/windows-enable-symlinks.ps1
#>

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
$valueName = 'AllowDevelopmentWithoutDevLicense'

$current = (Get-ItemProperty -Path $regPath -Name $valueName -ErrorAction SilentlyContinue).$valueName
if ($current -eq 1) {
    Write-Host "Developer Mode da duoc bat san. Khong can lam gi them." -ForegroundColor Green
    exit 0
}

if (-not (Test-Admin)) {
    Write-Host "Can quyen Administrator de bat Developer Mode, dang yeu cau UAC..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    )
    exit 0
}

New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name $valueName -Value 1 -Type DWord

Write-Host "Da bat Developer Mode. Co the can dang xuat/khoi dong lai may de ap dung." -ForegroundColor Green
Write-Host "Sau do chay lai: pnpm dist:win" -ForegroundColor Green
