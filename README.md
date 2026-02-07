# Secure Boot Certificate Management (2011 → 2023) — VMware + Windows Playbook

> TL;DR (TH): ใบรับรอง Secure Boot ชุดเก่า (2011) จะเริ่มหมดอายุช่วง **Jun 2026**  
> ต้องทำให้ Windows ติดตั้ง/อัพเดทไปใช้ **Windows UEFI CA 2023** ให้ครบ โดยเฉพาะ VM บน **ESXi 7** ที่มักมีปัญหาเขียน UEFI variables

## Background

Microsoft Secure Boot certificates originally issued in **2011** will begin expiring in **June 2026**.  
Organizations should ensure the **2023 Secure Boot certificates** are deployed across Windows systems (physical and virtual) to continue receiving boot-related security updates.

This repository is an **operational runbook** for environments running **Windows VMs on VMware ESXi 7/8**.

## Scope / Audience

- Windows workloads running with **UEFI + Secure Boot**
- VMware vSphere / ESXi **7.x and 8.x**
- Operators using:
  - PowerShell / PowerCLI
  - Optional: VMware Tools guest operations (agentless execution)

## Key Notes (Read First)

- **Windows performs the certificate updates internally.** vCenter does not “push” Secure Boot certs directly.
- **ESXi 8** generally supports Secure Boot variable updates correctly.
- **ESXi 7** may block UEFI variable writes → updates can fail or not persist.
- Plan for **controlled reboots** and avoid rebooting critical tiers in the same batch.
- Take **snapshots/checkpoints** where appropriate before rollout.

## High-Level Strategy

1. Inventory VMs (Secure Boot state + ESXi version)
2. Prioritize **ESXi 7** workloads for migration to **ESXi 8** where possible
3. Enable Microsoft-managed Secure Boot updates (inside Windows)
4. Trigger the Secure Boot update scheduled task
5. Reboot
6. Verify certificates
7. Report compliance

---

## Step 1 — Inventory via PowerCLI

```powershell
Get-VM | Select Name,
@{N="SecureBoot";E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}},
@{N="ESXi";E={$_.VMHost.Version}} |
Export-Csv secureboot_inventory.csv -NoTypeInformation
```

**Output:** `secureboot_inventory.csv`

---

## Step 2 — Opt-in to Microsoft-managed Secure Boot updates (inside Windows)

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

Reboot after completion.

---

## Step 3 — Verification (inside Windows)

### Confirm Secure Boot is enabled

```powershell
Confirm-SecureBootUEFI
```

### Confirm Windows UEFI CA 2023 is present in DB

```powershell
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
```

### Check servicing status

```powershell
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

**Expected (typical):**
- SecureBoot = `True`
- `UEFICA2023Status = 1`

---

## ESXi 7 Remediation Guidance

### Recommended

1. Migrate VM to **ESXi 8**
2. Upgrade VM hardware compatibility
3. Retry certificate update

### Fallback

1. Power off VM
2. Disable Secure Boot
3. Boot
4. Patch Windows
5. Re-enable Secure Boot
6. Reboot

### Last resort

- Rebuild VM on ESXi 8

---

## Optional — VMware Tools Automation (Agentless)

Use when SCCM / Intune / GPO are unavailable.  
PowerCLI uses VMware Tools to execute commands inside the guest OS.

### Requirements

- VMware Tools running
- Guest admin credential
- VM powered on

> No WinRM or network access required.

### Example — Single VM test

```powershell
Invoke-VMScript -VM VM01 `
-ScriptText "hostname" `
-GuestCredential (Get-Credential)
```

### Example — Batch Secure Boot update via VMware Tools

```powershell
$cred = Get-Credential

Get-VM | Where {$_.PowerState -eq "PoweredOn"} | Select -First 50 |
ForEach-Object {
  Invoke-VMScript -VM $_ -GuestCredential $cred -ScriptText '
    reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
    Start-ScheduledTask -TaskName "\\Microsoft\\Windows\\PI\\Secure-Boot-Update"
    shutdown /r /t 60
  '
}
```

**Best practice**
- Batch 25–50 VMs
- Stagger reboots by tier/criticality
- Log success/failure per VM

---

## Compliance Script Example (inside Windows)

```powershell
$result = [System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes)

if ($result -match "Windows UEFI CA 2023") {
  "COMPLIANT"
} else {
  "NON-COMPLIANT"
}
```

---

## Timeline (High level)

- **June 2026** – KEK / UEFI CA 2011 expires
- **Oct 2026** – Windows Production PCA expires

Systems not updated may stop receiving boot-level security fixes.

---

## Change Log

- 2026-02-07: README formatting improvements + added TH TL;DR, scope, outputs, and ESXi7 caveats

## References

- Microsoft: Secure Boot certificate update guidance (search: "Windows UEFI CA 2023 Secure Boot")
- VMware: ESXi UEFI Secure Boot / guest operations documentation

## License

Add a license if you plan to share this broadly (e.g., MIT).
