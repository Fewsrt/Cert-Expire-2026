# Optional automation — VMware Tools (agentless)

Use when SCCM/Intune/GPO are unavailable.

## Example — single VM test

```powershell
Invoke-VMScript -VM VM01 `
-ScriptText "hostname" `
-GuestCredential (Get-Credential)
```

## Example — batch update

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
