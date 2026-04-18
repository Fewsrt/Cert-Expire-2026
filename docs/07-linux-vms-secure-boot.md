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
- Use `Linux final Secure Boot impact assessment` from the web app for the final yes/no decision.
- Use `Linux final remediation workflow` from the web app for the standard fix path.

## Version impact matrix (practical)
> Linux impact is not decided by OS major version alone.  
> It depends on the active boot chain: **shim + GRUB + SBAT + db/dbx keys**.

| Pattern | Risk level | Typical outcome |
|---|---|---|
| Old shim/GRUB/SBAT chain, not updated for recent revocations | High | May fail Secure Boot validation / boot failure |
| Distro still supported, shim/grub signed packages current | Medium-Low | Usually boots and remains compliant (still verify after reboot) |
| Unsupported distro / pinned old boot packages | High | Break/fail risk increases when dbx revocation is applied |

## Distro notes (operator view)
- RHEL-family (RHEL/Alma/Rocky/OL): track vendor Secure Boot notices and keep `shim`/`grub2` current from official repos.
- Ubuntu/Debian-family: ensure `shim-signed` and signed GRUB packages are current in supported release channels.
- If workload is business critical, validate in staging with Secure Boot enabled before production rollout.

## Explicit version guide (as of 2026-02)
> This is an operator baseline, not a permanent rule.  
> Always check current vendor notices before production change.

| Distro family | Generally safer baseline | Higher-risk pattern |
|---|---|---|
| RHEL family | `shim >= 15.4` and current signed `grub2` from supported repo | Old shim chain (`shim < 15.4`) or unsupported release |
| Oracle Linux | OL7/8/9/10 systems with Oracle Secure Boot key-rotation updates applied (notices reference `shim 15.8` streams) | OL hosts/VMs missing Oracle key-rotation shim/certs updates |
| Ubuntu LTS | Supported releases with current `shim-signed` (Ubuntu package index shows `15.8` line in current supported series) | Old pinned `shim-signed`/GRUB packages outside supported updates |

### What this means in practice
- `RHEL`: very old shim binaries are known revocation risk; keep shim/grub chain current.
- `Oracle Linux`: follow Oracle Secure Boot notices and apply the matching shim/cert updates as one change set.
- `Ubuntu`: keep `shim-signed` and signed GRUB from the release update channel; avoid pinning old boot packages.

## If you need a yes/no decision
1. Run `Linux final Secure Boot impact assessment`.
2. Confirm Secure Boot is enabled.
3. Confirm active EFI boot path points to vendor shim.
4. Confirm shim/GRUB EFI files are owned by supported vendor packages.
5. Confirm `sbverify` evidence is collected for active EFI files.
6. Reboot at least 2 times after updates and rerun assessment.
7. If any failure appears, treat as impacted and run `Linux final remediation workflow`.
