# Ansible Secure Boot CA Assessment

This workflow answers the four operational questions:

1. Does firmware `db` contain 2011 CA and/or 2023 CA?
2. Does the active bootloader CA chain contain 2011 CA and/or 2023 CA?
3. Which bootloader file is active?
4. Which machines should Ansible check, based only on the vCenter CSV selection?

## Files

- `ansible/inventory/vcenter_csv_inventory.py` reads a vCenter/PowerCLI CSV.
- `ansible/samples/vcenter_targets.csv` shows the expected CSV shape.
- `ansible/playbooks/secureboot_ca_assessment.yml` runs the assessment.
- `ansible/reports/secureboot_ca_assessment.json` is the detailed report.
- `ansible/reports/secureboot_ca_assessment.csv` is the summary report.

## CSV Contract

Required columns:

| Column | Meaning |
|---|---|
| `check` | Only rows with `true`, `yes`, `1`, or `check` are assessed |
| `vm_name` | VM name from vCenter |
| `ansible_host` | DNS name or IP that Ansible can connect to |
| `os_family` | `windows` or `linux` |

Useful optional columns:

| Column | Meaning |
|---|---|
| `guest_os` | Guest OS text from vCenter |
| `secure_boot` | vCenter Secure Boot flag for operator context |
| `firmware` | EFI/BIOS from vCenter |
| `cluster` | vCenter cluster |
| `esxi_host` | ESXi host |
| `ansible_user` | SSH/WinRM user |
| `ansible_port` | SSH/WinRM port if non-standard |

The inventory script also accepts common PowerCLI column names such as `VM`, `Guest OS`, `GuestFullName`, `PowerState`, `VMHost`, and `Host`.

## Run

From the repo root:

```bash
cd ansible
VCENTER_CSV=../path/to/vcenter-export.csv ansible-inventory --list
VCENTER_CSV=../path/to/vcenter-export.csv ansible-playbook playbooks/secureboot_ca_assessment.yml
```

For the sample CSV:

```bash
cd ansible
VCENTER_CSV=samples/vcenter_targets.csv ansible-inventory --list
VCENTER_CSV=samples/vcenter_targets.csv ansible-playbook playbooks/secureboot_ca_assessment.yml
```

## Output Columns

The CSV report includes:

| Column | Meaning |
|---|---|
| `db_has_2011` | Firmware `db` contains 2011 CA text |
| `db_has_2023` | Firmware `db` contains Windows/Microsoft UEFI CA 2023 |
| `kek_has_2023` | Firmware `KEK` contains Microsoft Corporation KEK 2K CA 2023 |
| `active_bootloader_file` | The EFI file considered active |
| `active_bootloader_has_2011` | Active bootloader certificate chain contains 2011 CA text |
| `active_bootloader_has_2023` | Active bootloader certificate chain contains 2023 CA text |
| `active_bootloader_signature_method` | Linux: `sbverify`, `strings_binary_scan`, `sbverify_and_strings_scan`, etc. Windows: `windows_authenticode` |
| `decision` | `PASS_OR_LOW_RISK`, `IMPACTED`, `NEEDS_EVIDENCE`, `NEEDS_MANUAL_REVIEW`, or related final state |
| `root_cause` | Why the host is not pass/low-risk |
| `fix` | The remediation workflow for that host |

## Active Bootloader Logic

### Windows

The playbook mounts the EFI System Partition temporarily and inspects:

```text
\EFI\Microsoft\Boot\bootmgfw.efi
```

If the ESP path cannot be mounted/found, it falls back to:

```text
C:\Windows\Boot\EFI\bootmgfw.efi
```

The certificate chain is read with `Get-AuthenticodeSignature` and `X509Chain`.

### Linux

The playbook reads `efibootmgr -v`, finds `BootCurrent`, maps the EFI path to `/boot/efi/...`, and inspects that active file.

Example:

```text
BootCurrent: 0003
Boot0003* Red Hat Enterprise Linux ... \EFI\redhat\shimx64.efi
```

Active file:

```text
/boot/efi/EFI/redhat/shimx64.efi
```

The certificate chain is read with `sbverify --list`. If `sbverify` is missing, the host is marked `NEEDS_EVIDENCE` because the bootloader CA chain is not proven yet.

## Remediation Mapping

| Finding | Fix |
|---|---|
| `db_has_2023=false` on Windows | Patch Windows, opt in, run Secure-Boot-Update, reboot twice |
| `kek_has_2023=false` on Windows | Same as above; if VMware still fails, check PK or regenerate NVRAM |
| Windows bootloader has 2011 only | After CA/KEK 2023 are present, install latest CU, trigger task, reboot twice |
| Linux active bootloader unowned | Reinstall/update vendor shim/GRUB packages and recreate EFI boot entry |
| Linux `sbverify` missing | Install `sbsigntools`, rerun assessment |
| Linux bootloader has 2011 only | Update vendor shim/GRUB/kernel packages, reboot twice, rerun assessment |
| Linux cannot boot with Secure Boot | Temporarily disable Secure Boot, boot OS, update boot chain, re-enable Secure Boot, rerun assessment |
