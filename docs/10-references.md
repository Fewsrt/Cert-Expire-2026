# References (best-effort stable entry points)

> I can’t use automated web search in this environment right now, so these are best-effort stable entry points (vendor official docs/portals) that are unlikely to disappear.

## Microsoft (Windows Secure Boot)
- Secure Boot overview:
  - https://learn.microsoft.com/windows-hardware/design/device-experiences/oem-secure-boot
- PowerShell module docs:
  - Confirm-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/confirm-securebootuefi
  - Get-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/get-securebootuefi

## VMware / Broadcom (ESXi)
- vSphere docs landing:
  - https://docs.vmware.com/en/VMware-vSphere/index.html
- Broadcom KB portal:
  - https://knowledge.broadcom.com/

Suggested KB searches:
- `ESXi 7 UEFI variable write NVRAM secure boot`
- `ESXi 8 UEFI variable write NVRAM secure boot`
- `vm nvram file secure boot variables`

## Linux Secure Boot
- mokutil man page (Ubuntu example):
  - https://manpages.ubuntu.com/manpages/jammy/man1/mokutil.1.html
- shim project (SBAT background):
  - https://github.com/rhboot/shim
