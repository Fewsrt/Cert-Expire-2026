# ESXi 7 remediation guidance

## Recommended
1. Migrate VM to ESXi 8
2. Upgrade VM hardware compatibility
3. Retry the Windows Secure Boot update

## Fallback
1. Power off VM
2. Disable Secure Boot
3. Boot
4. Patch Windows
5. Re-enable Secure Boot
6. Reboot

## Last resort
- Rebuild VM on ESXi 8
