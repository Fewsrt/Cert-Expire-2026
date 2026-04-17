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

### Broadcom KBs referenced in this runbook
- KB 421593 — Missing Microsoft Corporation KEK CA 2023 Certificate on Windows VMs in ESXi
  - https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- KB 423919 — Manual Update of the Secure Boot Platform Key in Virtual Machines
  - https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html

Suggested KB searches:
- `ESXi 7 UEFI variable write NVRAM secure boot`
- `ESXi 8 UEFI variable write NVRAM secure boot`
- `vm nvram file secure boot variables`

## Linux Secure Boot
- mokutil man page (Ubuntu example):
  - https://manpages.ubuntu.com/manpages/jammy/man1/mokutil.1.html
- shim project (SBAT background):
  - https://github.com/rhboot/shim
- Microsoft 2026 Secure Boot certificate update guidance:
  - https://support.microsoft.com/en-us/topic/secure-boot-certificate-updates-guidance-for-it-professionals-and-organizations-e2b43f9f-b424-42df-bc6a-8476db65ab2f
- Microsoft Secure Boot expiration + CA update note:
  - https://support.microsoft.com/en-us/topic/windows-secure-boot-certificate-expiration-and-ca-updates-7ff40d33-95dc-4c3c-8725-a9b95457578e
- Red Hat 2026 guidance (RHEL environments):
  - https://developers.redhat.com/articles/2026/02/04/secure-boot-certificate-changes-2026-guidance-rhel-environments
- Red Hat article on revocations/shim versions:
  - https://access.redhat.com/articles/5991201
- Oracle Linux Secure Boot notice:
  - https://docs.oracle.com/en/operating-systems/oracle-linux/notice-sboot/
- Ubuntu package index (`shim-signed`):
  - https://packages.ubuntu.com/shim-signed
