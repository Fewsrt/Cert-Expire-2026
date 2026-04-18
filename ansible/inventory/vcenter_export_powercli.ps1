#Requires -Version 5.1
<#
.SYNOPSIS
  Export a CSV from vCenter using VMware PowerCLI, matching the columns produced by vcenter_export_govc.sh
  for use with vcenter_csv_inventory.py.

.DESCRIPTION
  Requires VMware PowerCLI (e.g. Install-Module VMware.PowerCLI). Connects to vCenter, enumerates VMs,
  and writes UTF-8 CSV with: check, vm_name, ansible_host, os_family, guest_os, secure_boot, firmware,
  cluster, esxi_host, power_state, ansible_user

.PARAMETER VIServer
  vCenter hostname or IP (same as Connect-VIServer -Server).

.PARAMETER OutCsv
  Output file path (default: secureboot_inventory_full.csv in the current directory).

.PARAMETER IgnoreInvalidCertificate
  Maps to Set-PowerCLIConfiguration -InvalidCertificateAction Ignore (lab/self-signed).

.EXAMPLE
  .\vcenter_export_powercli.ps1 -VIServer vcenter.example.com -OutCsv C:\exports\secureboot_inventory_full.csv

.EXAMPLE
  $cred = Get-Credential
  .\vcenter_export_powercli.ps1 -VIServer 192.168.100.141 -Credential $cred -IgnoreInvalidCertificate
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $VIServer,

  [string] $OutCsv = "secureboot_inventory_full.csv",

  [System.Management.Automation.PSCredential] $Credential,

  [switch] $IgnoreInvalidCertificate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Module -ListAvailable -Name VMware.PowerCLI)) {
  Write-Error "VMware PowerCLI not found. Install: Install-Module VMware.PowerCLI -Scope CurrentUser (see Broadcom PowerCLI docs)."
  exit 1
}

Import-Module VMware.PowerCLI -ErrorAction Stop

if ($IgnoreInvalidCertificate) {
  Set-PowerCLIConfiguration -Scope User -InvalidCertificateAction Ignore -Confirm:$false | Out-Null
}

$connectParams = @{ Server = $VIServer }
if ($Credential) { $connectParams.Credential = $Credential }
Connect-VIServer @connectParams

function Get-InferredOsFamily {
  param(
    [string] $GuestOs,
    [string] $GuestId,
    [string] $VmName
  )
  $g = ($GuestOs + "").ToLowerInvariant()
  $id = ($GuestId + "").ToLowerInvariant()
  $n = ($VmName + "").ToLowerInvariant()

  if ($g -like "*windows*") { return "windows" }
  if ($id.StartsWith("windows") -or $id -like "winnet*" -or $id -like "winlonghorn*") { return "windows" }
  if ($id -match "^win\d") { return "windows" }
  if ($n -like "*windows*" -or $n -like "*win-serve*" -or $n -like "*win201*" -or $n -like "*win202*" -or $n -like "*ws20*") { return "windows" }
  if ($n -like "*server201*" -or $n -like "*server202*" -or $n -like "*server200*" -or $n -like "*server20[0-9]*") { return "windows" }
  return "linux"
}

try {
  $report = Get-VM | ForEach-Object {
    $vm = $_
    $guest = $vm.ExtensionData.Guest
    $cfg = $vm.ExtensionData.Config

    $ips = @()
    if ($guest -and $guest.Net) {
      foreach ($net in $guest.Net) {
        if ($net.IpConfig -and $net.IpConfig.IpAddress) {
          $ips += $net.IpConfig.IpAddress | ForEach-Object { $_.IpAddress }
        }
      }
    }
    $ips = $ips | Where-Object { $_ -and ($_ -notmatch ":") } | Sort-Object -Unique
    $firstIp = @($ips)[0]

    $guestFull = if ($guest) { $guest.GuestFullName } else { "" }
    $guestId = if ($null -ne $cfg.GuestId) { [string]$cfg.GuestId } else { "" }
    $guestHost = if ($guest) { $guest.HostName } else { "" }

    if ([string]::IsNullOrWhiteSpace($guestFull) -and -not [string]::IsNullOrWhiteSpace($guestId)) {
      $guestOsOut = $guestId
    }
    elseif (-not [string]::IsNullOrWhiteSpace($guestFull)) {
      $guestOsOut = $guestFull
    }
    else {
      $guestOsOut = "unknown"
    }

    if ($firstIp) { $ansibleHost = $firstIp }
    elseif (-not [string]::IsNullOrWhiteSpace($guestHost)) { $ansibleHost = $guestHost }
    else { $ansibleHost = $vm.Name }

    $osFamily = Get-InferredOsFamily -GuestOs $guestOsOut -GuestId $guestId -VmName $vm.Name

    $sb = $false
    if ($cfg.BootOptions -and $null -ne $cfg.BootOptions.EfiSecureBootEnabled) {
      $sb = [bool]$cfg.BootOptions.EfiSecureBootEnabled
    }
    $secureBootStr = if ($sb) { "ON" } else { "OFF" }

    $fw = if ($cfg.Firmware) { $cfg.Firmware } else { "unknown" }
    $esxiName = if ($vm.VMHost) { $vm.VMHost.Name } else { "" }
    $esxiVersion = ""
    if ($vm.VMHost) {
      $versionText = if ($vm.VMHost.Version) { [string]$vm.VMHost.Version } else { "" }
      $buildText = if ($vm.VMHost.Build) { [string]$vm.VMHost.Build } else { "" }
      if (-not [string]::IsNullOrWhiteSpace($versionText) -and -not [string]::IsNullOrWhiteSpace($buildText)) {
        $esxiVersion = "ESXi $versionText build $buildText"
      }
      elseif (-not [string]::IsNullOrWhiteSpace($versionText)) {
        $esxiVersion = "ESXi $versionText"
      }
    }
    $power = if ($vm.PowerState) { $vm.PowerState.ToString() } else { "" }

    [pscustomobject] [ordered] @{
      check         = "true"
      vm_name       = $vm.Name
      ansible_host  = $ansibleHost
      os_family     = $osFamily
      guest_os      = $guestOsOut
      secure_boot   = $secureBootStr
      firmware      = $fw
      cluster       = ""
      esxi_host     = $esxiName
      esxi_version  = $esxiVersion
      power_state   = $power
      ansible_user  = ""
    }
  }

  $report | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding utf8
  $rowCount = @($report).Count
  Write-Host "Wrote $OutCsv ($rowCount rows). Next: copy to Ansible controller and set VCENTER_CSV."
}
finally {
  if ($global:DefaultVIServer) {
    Disconnect-VIServer -Server * -Force -Confirm:$false -ErrorAction SilentlyContinue
  }
}
