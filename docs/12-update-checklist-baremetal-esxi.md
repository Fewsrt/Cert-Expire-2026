# One-Page Update Checklist — Bare Metal vs ESXi

## Goal
- Roll out Secure Boot certificate updates (2011 -> 2023) safely.
- Keep boot path compliant after reboot (no verification drift).

## Quick decision
1. Is workload `VMware VM`?
2. If `No` -> use **Bare Metal checklist**.
3. If `Yes` -> use **ESXi checklist**.

## A) Bare Metal checklist (Physical)
### 1) Pre-check
- Confirm machine model, current BIOS/UEFI version, OS version.
- Confirm `UEFI + Secure Boot` current state.
- Backup recovery artifacts (BitLocker key / Linux recovery plan).

### 2) Platform update first
- Update OEM BIOS/UEFI firmware to approved baseline.
- Update BMC/iDRAC/iLO if used by your platform policy.
- Reboot and confirm system health.

### 3) OS rollout
- Windows:
  - Set `MicrosoftUpdateManagedOptIn=1`
  - Run scheduled task `\Microsoft\Windows\PI\Secure-Boot-Update`
- Linux:
  - Update shim/GRUB/kernel from supported distro channels.

### 4) Verification
- Windows:
  - `Confirm-SecureBootUEFI` is `True`
  - CA 2023 present in Secure Boot `db`
  - `UEFICA2023Status` is expected
- Linux:
  - `mokutil --sb-state` expected state
  - Reboot success with Secure Boot enabled

### 5) Exit
- Repeat verification after additional reboot(s).
- Mark compliant only when state remains stable.

## B) ESXi checklist (VMware VM)
### 1) Pre-check (host + VM)
- VM firmware = EFI, Secure Boot enabled.
- Guest OS type (Windows/Linux), VM compatibility level.
- ESXi version/build and datastore health/snapshot chain.
- Flag VM legacy risk: created on ESXi `< 8.0.2` (KB 421593 pattern).

### 2) Platform readiness first
- Patch ESXi host to current approved build (same major or target major).
- Ensure datastore writable/healthy and no snapshot chain issues.
- Update server BIOS/UEFI + BMC if persistence issues are suspected/known.

### 3) Guest rollout
- Windows guest:
  - Set `MicrosoftUpdateManagedOptIn=1`
  - Run `\Microsoft\Windows\PI\Secure-Boot-Update`
  - Reboot
- Linux guest:
  - Update shim/GRUB/kernel
  - Reboot

### 4) Verification
- Windows:
  - `Confirm-SecureBootUEFI` = True
  - CA 2023 present in `db`
  - `UEFICA2023Status` expected
- Linux:
  - `mokutil --sb-state`
  - Boot/reboot success with Secure Boot enabled

### 5) If verification fails
1. Re-check host patch, datastore health, snapshot chain.
2. KB 421593 pattern (missing KEK CA 2023):
   - Power off VM -> upgrade VM compatibility -> rename `*.nvram` backup -> power on
3. KB 423919 pattern (invalid PK / DB update failing):
   - Follow manual PK update procedure with change control
4. Re-verify after reboot(s); keep evidence.

### 6) Exit
- Compliant only when verification remains stable across multiple reboots.
- For encrypted workloads (vTPM + BitLocker/LUKS), confirm recovery path tested.

## Order of operations (short answer)
- Bare metal: **Firmware first -> OS rollout -> Verify**
- ESXi VM: **Host/Platform readiness first -> Guest rollout -> Verify**

## Why this order
- OS step is where certificate rollout is triggered, but platform readiness is what makes results persist after reboot.
- Doing platform first reduces rework from verification drift (run success but state lost after reboot).
- This is especially important on ESXi environments with known NVRAM/UEFI persistence risk patterns.

## Exception (when OS-first can be used)
- If there is an urgent OS security requirement, you can run OS-first as a temporary measure.
- After that, complete platform/firmware remediation and re-verify before declaring final compliance.
