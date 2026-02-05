# Secure Boot Certificate Management — VMware + Windows Playbook

## Background

Microsoft Secure Boot certificates originally issued in 2011 will begin expiring in **June 2026**.
Organizations must deploy the **2023 Secure Boot certificates** to all Windows systems (physical and virtual) to continue receiving boot-related security updates.

This document provides an operational playbook for environments running Windows VMs on VMware ESXi 7/8.

Official references:

- Microsoft: Windows Secure Boot certificate expiration and CA updates  
  https://support.microsoft.com/en-us/topic/windows-secure-boot-certificate-expiration-and-ca-updates-7ff40d33-95dc-4c3c-8725-a9b95457578e

- Microsoft IT Pro Blog – Act now: Secure Boot certificates expire in June 2026  
  https://techcommunity.microsoft.com/blog/windows-itpro-blog/act-now-secure-boot-certificates-expire-in-june-2026/4426856

---

## High Level Strategy

1. Inventory all VMs (Secure Boot + ESXi version)
2. Prioritize ESXi 7 workloads for migration to ESXi 8
3. Enable Microsoft-managed Secure Boot updates in Windows
4. Trigger Secure Boot update task
5. Reboot
6. Verify certificates
7. Report compliance

Important:

- ESXi 8 supports Secure Boot variable updates correctly.
- ESXi 7 frequently blocks UEFI variable writes.
- Windows performs certificate updates internally. vCenter cannot update certificates directly.

---

## Step 1 – Inventory via PowerCLI

Run from vCenter:

```powershell
Get-VM | Select Name,
@{N="SecureBoot";E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}},
@{N="ESXi";E={$_.VMHost.Version}} |
Export-Csv secureboot_inventory.csv -NoTypeInformation
```

Use this CSV to separate:

- ESXi 8 (supported path)
- ESXi 7 (requires remediation)

---

## Step 2 – Enable Microsoft Managed Secure Boot Updates (inside Windows)

Deploy using SCCM / Intune / GPO / Ansible / PowerCLI Invoke-VMScript.

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
```

Trigger Secure Boot update task:

```powershell
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

Reboot after completion.

---

## Step 3 – Verification (inside Windows)

Confirm Secure Boot:

```powershell
Confirm-SecureBootUEFI
```

Confirm 2023 certificate present:

```powershell
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
```

Check registry servicing state:

```powershell
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

Expected:

- SecureBoot = True
- UEFICA2023Status = 1

---

## ESXi 7 Remediation

If Secure Boot update fails:

Recommended:

1. Migrate VM to ESXi 8
2. Upgrade VM hardware
3. Retry certificate update

Fallback:

1. Power off VM
2. Disable Secure Boot
3. Boot
4. Patch Windows
5. Re-enable Secure Boot
6. Reboot

Last resort:

- Rebuild VM on ESXi 8

---

## Automation Pattern

Layer 1 – vCenter / PowerCLI

- Inventory
- Reboot waves
- Host migration

Layer 2 – Windows

- SCCM / GPO deployment
- Certificate update
- Verification

---

## Timeline

- June 2026 – KEK / UEFI CA 2011 expires
- Oct 2026 – Windows Production PCA expires

Systems not updated will stop receiving boot-level security fixes.

---

## Recommended Rollout

1. Pilot group (10–20 VMs)
2. ESXi 8 production
3. ESXi 7 migration
4. Compliance validation
5. Final audit

---

## Compliance Script Example

```powershell
$result = [System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes)

if ($result -match "Windows UEFI CA 2023") {
 Write-Output "COMPLIANT"
} else {
 Write-Output "NON-COMPLIANT"
}
```

---

## Notes

- Secure Boot must remain enabled during update
- Snapshot before rollout
- Do not batch reboot critical tiers
- Monitor Event Log: Microsoft-Windows-Kernel-Boot

---

End of document.
