# Sandbox / Simulation Plan — Secure Boot Certificates (2011 → 2023)

This document defines a **complete lab plan** to validate Secure Boot certificate/variable updates across **all common failure modes** described in this runbook (Windows guest update, ESXi NVRAM persistence, Broadcom KB 421593/423919, Linux shim/SBAT considerations).

> Goal: be able to say “we tested every meaningful case” before running in production.

---

## 0) Lab build checklist (build once)

### 0.1 vSphere topology (minimum viable)

**Required**
- 1x vCenter (appliance)
- 1x ESXi 7.x host
- 1x ESXi 8.x host
- 1x shared datastore (NFS/iSCSI/vSAN) *or* local datastore (shared preferred)
- VM network + console access (vSphere client)

**Recommended (for deeper coverage)**
- 2nd datastore type (e.g., NFS + iSCSI) to catch storage/persistence edge cases
- Host firmware variety (if you have more servers) to mimic vendor differences

### 0.2 Base VM templates

Create templates you can clone repeatedly:

**Windows template (UEFI capable)**
- Firmware: EFI
- Secure Boot: ON
- VMware Tools installed
- Admin access (local admin)

**Linux template (UEFI capable)**
- Firmware: EFI
- Secure Boot: ON
- Install tools:
  - `mokutil`
  - `efibootmgr` (optional)

> Keep “Secure Boot OFF” clones too, for recovery testing.

### 0.3 Test evidence collection (standardize)

For each test case, capture:
- VM name + ESXi host version/build
- VM compatibility (hardware version)
- Secure Boot state (enabled/disabled)
- For Windows: output of verification commands
- For Linux: `mokutil --sb-state` output
- Screenshots of failures (UEFI verification error) when relevant
- Any vCenter/ESXi events during reboot

Create a per-case folder (example): `evidence/UC-xx/`.

---

## 1) Use case matrix (complete coverage)

Each use case includes:
- **Purpose** (what risk it validates)
- **Lab prerequisites** (what you must have)
- **Steps** (how to run)
- **Pass criteria** (what “good” looks like)
- **If it fails** (next action)

### UC-01 — Windows happy path on ESXi 8 (baseline)

**Purpose**: prove the normal process works end-to-end.

**Prereqs**
- ESXi 8.x host
- Windows VM clone from template (EFI + Secure Boot ON)

**Steps**
1. Run opt-in + task inside Windows:
   - `MicrosoftUpdateManagedOptIn=1`
   - Run `\Microsoft\Windows\PI\Secure-Boot-Update`
2. Reboot
3. Verify (Windows):
   - `Confirm-SecureBootUEFI`
   - Check CA 2023 present (db)
   - Check `UEFICA2023Status`

**Pass criteria**
- Verification is compliant and **stays compliant across 2+ reboots**.

**If it fails**
- Stop and investigate VM config, Secure Boot state, ESXi events.

---

### UC-02 — Windows on ESXi 7 (UEFI variable persistence risk)

**Purpose**: reproduce/validate the ESXi 7 “update doesn’t persist after reboot” risk.

**Prereqs**
- ESXi 7.x host
- Windows VM (EFI + Secure Boot ON)

**Steps**
- Same as UC-01, but run on ESXi 7 and reboot multiple times.

**Pass criteria**
- Verification becomes compliant and remains compliant.

**If it fails**
- Apply remediation order:
  1) Patch ESXi 7 to latest build
  2) Check datastore health, permissions, free space, snapshot chain
  3) Update server BIOS/UEFI firmware + BMC
  4) Migrate VM to ESXi 8 and re-test

---

### UC-03 — Broadcom KB 421593 pattern (legacy NVRAM missing KEK CA 2023)

**Purpose**: validate the scenario where the VM’s `*.nvram` was generated on ESXi < 8.0.2 and retains legacy KEK list.

**Prereqs**
- Ability to obtain a VM created on ESXi < 8.0.2
  - Option A: build a throwaway ESXi < 8.0.2 lab host
  - Option B: import a known older VM (preferred if you already have one)
- ESXi 8.x host (current)

**Steps**
1. Run/inspect the VM on ESXi 8.x; confirm symptom: missing *Microsoft Corporation KEK CA 2023*.
2. Apply KB fix:
   - Power off VM
   - Upgrade VM compatibility (hardware version)
   - Rename `*.nvram` on datastore (keep backup)
   - Power on to regenerate NVRAM
3. Re-verify inside guest.

**Pass criteria**
- KEK list includes 2023 and guest verification passes.

**If it fails**
- Treat as persistence/PK issue; proceed to UC-04.

Ref: Broadcom KB 421593

---

### UC-04 — Broadcom KB 423919 pattern (invalid PK blocks DB/DBX/KEK updates)

**Purpose**: validate manual Platform Key remediation and its operational risks.

**Prereqs**
- A VM that exhibits the KB symptom (invalid PK signature / secure boot updates failing)
- Console access
- Snapshot capability

**Additional prereqs (if encrypted)**
- If vTPM + BitLocker (Windows) or vTPM + LUKS (Linux):
  - Recovery key(s)
  - A documented rollback path

**Steps**
- Follow KB 423919 procedure (summary):
  - Shutdown VM, snapshot
  - Attach a small FAT32 disk with `WindowsOEMDevicesPK.der`
  - Add advanced parameter `uefi.allowAuthBypass = "TRUE"`
  - Force EFI setup; enroll PK from the disk
  - Remove bypass param; remove disk; reboot

**Pass criteria**
- Platform Key is updated successfully and automated updates succeed.

**If it fails**
- Restore snapshot and re-check prerequisites (especially encryption/vTPM interactions).

Ref: Broadcom KB 423919

---

### UC-05 — ESXi 8 “still NVRAM problems” validation

**Purpose**: prove that ESXi 8 is not a guarantee; validate your detection + response.

**Prereqs**
- ESXi 8.x host
- Windows VM

**How to simulate** (safe methods)
- The safest “simulation” is to use real-world patterns rather than intentionally corrupting a VM.
- Recommended simulation approach:
  - Use UC-03 (legacy NVRAM) on ESXi 8
  - Use UC-04 (PK invalid) on ESXi 8

**Pass criteria**
- Your runbook correctly identifies the root cause and applies the correct KB remediation.

---

### UC-06 — Linux VM baseline (UEFI + Secure Boot)

**Purpose**: confirm Linux VMs continue booting with Secure Boot enabled.

**Prereqs**
- Linux VM (EFI + Secure Boot ON)
- `mokutil` installed

**Steps**
1. Verify:
   - `mokutil --sb-state`
2. Apply normal distro updates (shim/grub/kernel)
3. Reboot
4. Verify again

**Pass criteria**
- Secure Boot remains enabled and VM boots cleanly after updates.

---

### UC-07 — Linux “revocation/dbx risk” tabletop simulation (recommended)

**Purpose**: validate you can recover if a Linux VM fails Secure Boot due to shim/dbx/SBAT issues.

**Prereqs**
- Linux VM (EFI + Secure Boot ON)
- Snapshot capability

**Steps (tabletop + controlled)**
1. Take snapshot
2. Document recovery procedure:
   - Boot via console
   - Temporarily disable Secure Boot
   - Boot, update shim/grub/kernel
   - Re-enable Secure Boot
3. Execute in lab only if you can safely reproduce a failure.

**Pass criteria**
- You can recover to a bootable, updated system with Secure Boot re-enabled.

---

### UC-08 — vTPM + BitLocker (Windows) interaction

**Purpose**: ensure Secure Boot key changes don’t strand you without recovery.

**Prereqs**
- Windows VM with vTPM enabled
- BitLocker enabled
- Recovery key exported and stored

**Steps**
- Perform UC-04 (PK update) in lab.

**Pass criteria**
- You can boot successfully or recover using the recovery key.

---

### UC-09 — vTPM + LUKS (Linux) interaction (optional)

**Purpose**: same as UC-08 but for Linux.

**Prereqs**
- Linux VM with vTPM
- LUKS sealed to TPM PCRs (if you use this pattern)
- Recovery plan

**Steps**
- Perform key update scenarios in lab only.

**Pass criteria**
- System can boot or be recovered.

---

## 2) Recommended lab naming + cloning strategy

- Keep 2 templates: `TPL-WIN-UEFI-SB-ON`, `TPL-LINUX-UEFI-SB-ON`
- For each UC, clone to `UC-xx-<OS>-<ESXi7|ESXi8>`
- Never test destructive steps without a snapshot.

---

## 3) Exit criteria (declare “ready for prod”)

You can declare readiness when:
- UC-01 and UC-02 pass (or UC-02 has a documented mitigation such as mandatory ESXi 8 migration)
- UC-03 and UC-04 are understood and you can execute remediation reliably
- Linux UC-06 passes for each distro you run
- Encryption UC-08/UC-09 tested for at least one representative VM (if you use encryption)

---

## References
- Broadcom KB 421593:
  https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- Broadcom KB 423919:
  https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html
