# Windows (Guest) — Opt-in + Trigger Secure Boot Update

## Opt-in to Microsoft-managed Secure Boot updates

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

Reboot after completion.

## Notes
- This step is Windows-specific.
- For ESXi 7, see ESXi remediation guidance if variables don’t persist.
