# Secure Boot Certificates (2011 → 2023) — Executive Summary (VMware / ESXi)

## TL;DR
- Microsoft Secure Boot certificates issued in **2011** begin expiring around **June 2026**.
- Goal: ensure UEFI + Secure Boot workloads (especially **Windows VMs**) have the **Microsoft 2023 Secure Boot certificates** in place (e.g., *Microsoft Corporation KEK CA 2023* / *Windows UEFI CA 2023* depending on the database).
- In VMware environments, the most common blocker is **UEFI variable / NVRAM persistence** (updates appear to run but do not persist after reboot).

## Scope
- **Primary:** Windows VMs on VMware vSphere / ESXi 7.x and 8.x
- **Also relevant:** Linux VMs using UEFI + Secure Boot (impacted mainly by dbx/shim/SBAT revocations)

## Where changes happen (host vs guest)
- **Guest (VM) Secure Boot variables (db/KEK/dbx):** the Windows Secure Boot update process writes here.
- **Host BIOS/UEFI keys (physical PK/KEK/db/dbx):** usually not required to change *because of* the Windows/VM rollout, but keeping host firmware current helps when troubleshooting persistence issues.

## Minimal Windows VM rollout (operator checklist)
1) Inventory
   - VM firmware = EFI
   - Secure Boot enabled
   - ESXi version/build
   - VM compatibility / hardware version
2) Inside Windows (guest)
   - Set `MicrosoftUpdateManagedOptIn=1`
   - Run Scheduled Task `\Microsoft\Windows\PI\Secure-Boot-Update`
3) Reboot
4) Verify
   - `Confirm-SecureBootUEFI`
   - Verify 2023 CA presence (e.g., check Secure Boot `db` contents)
   - Check `UEFICA2023Status`

## ESXi / NVRAM risks (important)
### Why NVRAM matters
VM UEFI variables are persisted into the VM’s `*.nvram` file. If writes do not persist, you’ll see the classic pattern: “task ran → reboot → still missing 2023 certs / status unchanged”.

### ESXi 8 can still be affected
Broadcom documents ESXi 8-relevant patterns:
- **KB 421593:** VMs created on ESXi versions earlier than **8.0.2** may retain a legacy `*.nvram` that does not include **Microsoft Corporation KEK CA 2023** until NVRAM is regenerated.
- **KB 423919:** VMs with an invalid **Platform Key (PK)** signature can fail automated Secure Boot database updates (DB/DBX/KEK) on ESXi 7.x/8.x/9.x.

## Linux VMs (UEFI + Secure Boot)
- Most risk comes from **dbx revocations** and old **shim/GRUB/SBAT**.
- Typical symptom: VM fails to boot with Secure Boot enabled.
- Quick checks:
  - `mokutil --sb-state`
  - `mokutil --list-enrolled`

## Recommended decision path (short)
- If verification passes → **COMPLIANT**.
- If verification fails:
  1) Patch ESXi to latest build in your major version
  2) Validate datastore health / free space / snapshot chain
  3) Update server BIOS/UEFI firmware + BMC
  4) Apply KB-specific remediation (421593: regenerate NVRAM / 423919: PK update)
  5) If still failing: migrate to ESXi 8 + upgrade VM compatibility

## References (pinned)
- Broadcom KB 421593 — Missing Microsoft Corporation KEK CA 2023:
  https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- Broadcom KB 423919 — Manual update of Secure Boot Platform Key:
  https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html

- Microsoft Secure Boot overview:
  https://learn.microsoft.com/windows-hardware/design/device-experiences/oem-secure-boot
- PowerShell SecureBoot module:
  - Confirm-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/confirm-securebootuefi
  - Get-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/get-securebootuefi

- mokutil manpage (Ubuntu example):
  https://manpages.ubuntu.com/manpages/jammy/man1/mokutil.1.html
- shim project (SBAT background):
  https://github.com/rhboot/shim
