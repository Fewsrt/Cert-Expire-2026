# Verification (Windows guest)

## Confirm Secure Boot enabled

```powershell
Confirm-SecureBootUEFI
```

## Confirm Windows UEFI CA 2023 present in db

```powershell
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
```

## Check servicing status

```powershell
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

Typical expected:
- SecureBoot = `True`
- `UEFICA2023Status = 1`
