# Inventory (PowerCLI)

## Goal
Inventory VMs by:
- VM name
- IP(s)
- OS
- DNS server(s) (best-effort)
- Hostname (guest)
- Secure Boot enabled
- Firmware mode (EFI)
- ESXi host version/build
- VM compatibility / HW version

> Note: **IP / hostname / DNS** rely on **VMware Tools** guest info. If Tools is not running or permissions are restricted, those fields may be empty.

---

## PowerCLI — full inventory export (recommended)

```powershell
# Requires: VMware PowerCLI, access to vCenter

$report = Get-VM | ForEach-Object {
  $vm = $_

  # Guest info (requires VMware Tools)
  $guest = $vm.ExtensionData.Guest

  # IPs (best-effort)
  $ips = @()
  if ($guest -and $guest.Net) {
    foreach ($net in $guest.Net) {
      if ($net.IpConfig -and $net.IpConfig.IpAddress) {
        $ips += $net.IpConfig.IpAddress | ForEach-Object { $_.IpAddress }
      }
    }
  }
  $ips = $ips | Where-Object { $_ -and ($_ -notmatch ':') } | Sort-Object -Unique

  # DNS (best-effort; may be null depending on VMware Tools / guest)
  $dns = @()
  try {
    if ($guest -and $guest.DnsConfig -and $guest.DnsConfig.IpAddress) {
      $dns += $guest.DnsConfig.IpAddress
    }
  } catch {}
  $dns = $dns | Where-Object { $_ } | Sort-Object -Unique

  [pscustomobject]@{
    VMName       = $vm.Name
    IP           = ($ips -join ',')
    OS           = $guest.GuestFullName
    DNS          = ($dns -join ',')
    Hostname     = $guest.HostName
    ToolsStatus  = $guest.ToolsRunningStatus

    Firmware     = $vm.ExtensionData.Config.Firmware
    SecureBoot   = $vm.ExtensionData.Config.BootOptions.EfiSecureBootEnabled
    HWVersion    = $vm.Version

    ESXi         = $vm.VMHost.Version
    ESXiBuild    = $vm.VMHost.Build
    PowerState   = $vm.PowerState
  }
}

$report | Export-Csv secureboot_inventory_full.csv -NoTypeInformation -Encoding UTF8
```

Output: `secureboot_inventory_full.csv`

---

## Minimal inventory (firmware + secure boot + ESXi)

```powershell
Get-VM | Select Name,
@{N="SecureBoot";E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}},
@{N="Firmware";E={$_.ExtensionData.Config.Firmware}},
@{N="HWVersion";E={$_.Version}},
@{N="ESXi";E={$_.VMHost.Version}} |
Export-Csv secureboot_inventory.csv -NoTypeInformation -Encoding UTF8
```

Output: `secureboot_inventory.csv`
