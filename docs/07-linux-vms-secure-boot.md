# Linux VMs — Impact & verification (UEFI + Secure Boot)

## Will Linux VMs be impacted?
Possibly.

Linux VMs that boot with **UEFI + Secure Boot** can be impacted mainly by:
- **dbx (revocation list) updates** revoking older bootloaders
- Old **shim/GRUB** signatures
- **SBAT** enforcement / revocations

## Symptoms
- VM fails to boot with Secure Boot enabled (verification failure)

## Recommended approach
- Keep distros supported and updated (shim/grub/kernel updates)
- Test dbx-related changes on a non-critical VM first

## Quick verification (inside Linux)

```bash
mokutil --sb-state
mokutil --list-enrolled
```
