# Final Decision Runbook

This is the operating model for the lab and production checks. Do not decide impact from OS version alone. Decide from the active boot chain and the Secure Boot databases that the firmware is actually using.

## Questions This Must Answer

Every test case must end with these answers:

1. Is Secure Boot active for this machine?
2. Which EFI file is the firmware booting?
3. Which CA chain signs the active bootloader?
4. Are 2023 KEK/db certificates present and readable?
5. Is the bootloader owned by a supported OS package?
6. If the case fails, what exact remediation fixes it?

If any answer is unknown, the test case is not final yet.

## Minimal Command Sets

Use only these command groups in the web app:

- Windows final Secure Boot impact assessment
- Windows final remediation workflow
- Linux final Secure Boot impact assessment
- Linux final remediation workflow

Do not add separate one-off commands unless they directly answer a failed branch, such as PK repair or VMware NVRAM regeneration.

## Decision Rules

### Windows

| Condition | Decision | Fix |
|---|---|---|
| Secure Boot is off | Non-compliant or out of scope | Enable UEFI Secure Boot if policy requires it, then rerun assessment |
| KEK 2023 is missing | Impacted | Patch Windows, opt in, run Secure-Boot-Update task, reboot twice, rerun assessment |
| db is missing Windows/Microsoft UEFI CA 2023 | Impacted | Patch Windows, opt in, run Secure-Boot-Update task, reboot twice, rerun assessment |
| bootmgfw.efi chain uses only 2011 CA | Impacted or pending boot manager transition | After CA/KEK 2023 are present, install latest CU, trigger Secure-Boot-Update, reboot twice |
| events 1795/1796/1801/1802/1803 repeat | Impacted | Check event message, PK, firmware write path, VMware NVRAM persistence |
| KEK/db 2023 present and boot manager chain is acceptable | Pass or low risk | Keep patched and retain evidence |

Windows Server 2019, 2022, and 2025 can all be in either pass or impacted state. The version does not answer the question by itself.

### Linux

| Condition | Decision | Fix |
|---|---|---|
| Secure Boot is off | Non-compliant or out of scope | Enable UEFI Secure Boot if policy requires it, then rerun assessment |
| active EFI path does not point to vendor shim | Needs review | Fix EFI boot entry or reinstall vendor bootloader packages |
| shim/GRUB EFI files are not owned by packages | Impacted | Reinstall/update vendor shim and GRUB packages |
| shim/GRUB/kernel packages are old, pinned, or unsupported | Impacted/high risk | Update vendor shim/GRUB/kernel packages from supported repos |
| sbverify is missing | Evidence incomplete | Install sbsigntools and rerun assessment |
| sbverify shows unexpected or revoked chain | Impacted | Update boot chain; if unbootable, temporarily disable Secure Boot, update, re-enable |
| system reboots twice with current vendor boot chain | Pass or low risk | Keep patched and retain evidence |

Linux impact is mostly a boot-chain and revocation risk, not a Windows CA rollout workflow. RHEL 8/9/10, Ubuntu LTS, and SLES can all pass if the active boot chain is current and supported.

## Version Impact Matrix

Use this matrix as a triage shortcut only:

| Platform | Version signal | Final decision depends on |
|---|---|---|
| Windows Server 2019 | Supported but often missing CA/KEK transition until patched and opted in | CA/KEK/db state, events, bootmgfw.efi chain |
| Windows Server 2022 | Supported but commonly tested because of Secure Boot update history | CA/KEK/db state, events, bootmgfw.efi chain |
| Windows Server 2025 | Newer baseline, expected lower risk | CA/KEK/db state and bootmgfw.efi chain |
| RHEL 8/9/10 | Supported streams can pass | shim-x64/shim, grub2, kernel package state, active EFI path, signatures |
| Ubuntu 20.04/22.04/24.04 | Supported/ESM status matters | shim-signed, signed GRUB, kernel package state, active EFI path, signatures |
| SLES 15 | Service pack and module support matter | shim, grub2-x86_64-efi, kernel-default package state, active EFI path, signatures |
| Unsupported or pinned Linux | High risk | Must update or document exception |

## Required Final Result Per Case

Each test case result must record:

- `Decision`: Pass, Impacted, Non-compliant/out of scope, or Needs review
- `RootCause`: missing KEK 2023, missing db 2023, bootloader CA chain, package ownership, old/pinned boot chain, PK invalid, NVRAM persistence, or Secure Boot off
- `FixApplied`: exact command/workflow used
- `Retest`: assessment rerun after reboot, preferably after two reboots

If `FixApplied` is empty on a failed case, the case is not complete.
