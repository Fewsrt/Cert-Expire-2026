# Final Compliance Check Runbook

## Purpose
- Provide a final method to decide which machines are `COMPLIANT` / `NON_COMPLIANT` / `UNKNOWN`.
- Use this after rollout and remediation steps are complete.

## Output format
- One CSV report per wave/change window.
- Required columns:
  - AssetName
  - EnvironmentType (`BareMetal` / `VMwareVM`)
  - OSType (`Windows` / `Linux`)
  - SecureBootEnabled
  - CA2023Present
  - UEFICA2023Status
  - BootChainPackageStatus
  - RebootStabilityCheck
  - FinalStatus (`COMPLIANT` / `NON_COMPLIANT` / `UNKNOWN`)
  - Notes

## Final decision criteria
### COMPLIANT
- Windows:
  - `Confirm-SecureBootUEFI` = `True`
  - CA 2023 exists in Secure Boot `db`
  - `UEFICA2023Status` is expected
  - Verification remains valid after at least 2 reboots
- Linux:
  - Secure Boot enabled and boots successfully
  - Signed boot chain is current from supported vendor repo
  - Reboot verification is stable (at least 2 reboots)

### NON_COMPLIANT
- Any required check fails (Secure Boot disabled unexpectedly, CA2023 missing, status invalid, boot failure, unstable post-reboot results)

### UNKNOWN
- Missing telemetry, inaccessible guest, missing VMware Tools/agent data, or incomplete evidence

## Step-by-step execution
1. Export inventory baseline (VM/host/firmware/secure boot metadata)
2. Run guest verification by OS:
   - Windows: Secure Boot + CA2023 + `UEFICA2023Status`
   - Linux: `mokutil`, installed boot-chain packages, reboot result
3. Repeat verification after reboot cycle (minimum 2 reboots for target systems)
4. Classify each machine with final status
5. Attach evidence (command outputs / screenshots / event logs)
6. Publish final CSV and sign-off summary

## Suggested evidence commands
### Windows
```powershell
Confirm-SecureBootUEFI
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

### Linux
```bash
mokutil --sb-state
mokutil --list-enrolled
# Debian/Ubuntu:
dpkg -l shim-signed shim grub-efi-amd64-signed
# RHEL-family:
rpm -q shim grub2
```

## VMware-specific failure handling before final status
1. If Windows verify fails, check KB patterns first:
   - KB 421593: legacy NVRAM (`*.nvram`) regeneration path
   - KB 423919: invalid PK / manual PK update path
2. Re-check ESXi patch level, datastore health, snapshot chain, and host firmware
3. Re-run validation after remediation and reboot

## Sign-off package (minimum)
- Final CSV report
- Exceptions list (owner + target date + mitigation)
- Change window summary
- Verification samples for each OS/environment type
