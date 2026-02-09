# Inventory (PowerCLI)

## Goal
Inventory VMs by:
- Firmware mode (EFI)
- Secure Boot enabled
- ESXi host version
- (Optional) VM compatibility / HW version

## PowerCLI example

```powershell
Get-VM | Select Name,
@{N="SecureBoot";E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}},
@{N="Firmware";E={$_.ExtensionData.Config.Firmware}},
@{N="HWVersion";E={$_.Version}},
@{N="ESXi";E={$_.VMHost.Version}} |
Export-Csv secureboot_inventory.csv -NoTypeInformation
```

Output: `secureboot_inventory.csv`
