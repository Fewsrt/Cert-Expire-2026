
# Secure Boot Certificate Management — VMware + Windows Playbook

## Background

Microsoft Secure Boot certificates originally issued in 2011 will begin expiring in **June 2026**.
Organizations must deploy the **2023 Secure Boot certificates** to all Windows systems (physical and virtual) to continue receiving boot-related security updates.

This document provides an operational playbook for environments running Windows VMs on VMware ESXi 7/8.

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

```powershell
Get-VM | Select Name,
@{N="SecureBoot";E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}},
@{N="ESXi";E={$_.VMHost.Version}} |
Export-Csv secureboot_inventory.csv -NoTypeInformation
```

---

## Step 2 – Enable Microsoft Managed Secure Boot Updates (inside Windows)

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

Reboot after completion.

---

## Step 3 – Verification (inside Windows)

```powershell
Confirm-SecureBootUEFI
```

```powershell
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
```

```powershell
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

Expected:

- SecureBoot = True
- UEFICA2023Status = 1

---

## ESXi 7 Remediation

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

# NEW OPTION – VMware Tools Automation (Agentless)

This option is used when SCCM / Intune / GPO are unavailable.

PowerCLI uses VMware Tools to execute commands inside the guest OS.

### Requirements

- VMware Tools running
- Guest admin credential
- VM powered on

No WinRM or network access required.

---

## Example – Single VM Test

```powershell
Invoke-VMScript -VM VM01 `
-ScriptText "hostname" `
-GuestCredential (Get-Credential)
```

---

## Example – Secure Boot Update via VMware Tools

```powershell
$cred = Get-Credential

Get-VM | Where {$_.PowerState -eq "PoweredOn"} | Select -First 50 |
ForEach {
 Invoke-VMScript -VM $_ -GuestCredential $cred -ScriptText '
 reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
 Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
 shutdown /r /t 60
 '
}
```

Best practice:

- Batch 25–50 VMs
- Avoid rebooting critical tiers simultaneously
- Log success / failure

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

## Timeline

- June 2026 – KEK / UEFI CA 2011 expires
- Oct 2026 – Windows Production PCA expires

Systems not updated will stop receiving boot-level security fixes.

---

End of document.
