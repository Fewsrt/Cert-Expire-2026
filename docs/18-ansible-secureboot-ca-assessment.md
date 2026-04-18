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

Install **`sbsigntools`** (`sbverify`) on Linux guests in the same run (required for PKCS#7-based bootloader flags on Linux — see **Prerequisites and verification** below):

```bash
VCENTER_CSV=../path/to/vcenter-export.csv ansible-playbook playbooks/secureboot_ca_assessment.yml -e secureboot_install_sbsigntools=true
```

## Prerequisites and verification (by OS)

This section summarizes **what the playbook uses**, **what you may need to install**, and **how to double-check manually**. Official references are linked.

### Linux (guest)

| What is measured | Tool in guest | Typical packages / notes |
|---|---|---|
| Firmware variables (`db`, `KEK`, …) | `mokutil` | Usually preinstalled (`mokutil` package). |
| Active EFI binary — PKCS#7 listing | `sbverify --list` | **`sbsigntools`** (provides `sbverify`). This is what drives `active_bootloader_has_*` on Linux. |

**Install `sbverify` by distribution (manual checks):**

- **Debian / Ubuntu:** Package name is often **`sbsigntool`** or **`sbsigntools`**; **Ubuntu** may need the **universe** component enabled. Then: `sudo apt update && sudo apt install -y sbsigntool` (or `sbsigntools`). Verify: `command -v sbverify` and `sbverify --list /boot/efi/.../shim*.efi`.
- **Red Hat Enterprise Linux:** `sbsigntools` is commonly shipped via **CodeReady Builder (CRB)** (repo id like `codeready-builder-for-rhel-9-x86_64-rpms`) or via **EPEL**. Enable CRB (example RHEL 9 x86_64): `sudo subscription-manager repos --enable codeready-builder-for-rhel-9-x86_64-rpms` (or `sudo dnf config-manager --set-enabled crb` where available), then `sudo dnf install -y sbsigntools`. If the package is still missing, install EPEL per [Fedora EPEL](https://docs.fedoraproject.org/en-US/epel/) and retry. Red Hat’s signing workflows for custom kernels/modules use **`pesign`**, **`mokutil`**, etc.; see [RHEL — Signing a kernel and modules for Secure Boot](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/managing_monitoring_and_updating_the_kernel/signing-a-kernel-and-modules-for-secure-boot_managing-monitoring-and-updating-the-kernel) for that context (the playbook’s **read-only** check uses **`sbverify`** on vendor shim/GRUB paths, not `pesign`).
- **SUSE Linux Enterprise / openSUSE:** `sudo zypper install -y sbsigntools` (name may vary; `zypper search sbverify`).

Upstream tooling for UEFI PE signatures: **sbsigntools** ([Fedora package overview](https://packages.fedoraproject.org/pkgs/sbsigntools/sbsigntools/)).

### Windows (guest)

| What is measured | Mechanism | Extra install? |
|---|---|---|
| Firmware variables | `Get-SecureBootUEFI` | None — built into Windows PowerShell for this assessment path. |
| `bootmgfw.efi` certificate chain | `Get-AuthenticodeSignature` and `X509Chain` in PowerShell | None — standard Windows PowerShell modules. |

**Important limitation (Microsoft documentation):** `Get-AuthenticodeSignature` returns information about the Authenticode signature; if a file is both **embedded-signed** and **catalog-signed**, **the catalog signature may be preferred** for display purposes. That can make **bootloader** inspection on Windows subtly different from what the firmware actually uses for UEFI Secure Boot (which relies on **embedded** signatures on the EFI binary). See [Get-AuthenticodeSignature (Microsoft Learn)](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature?view=powershell-7.4) and discussion in [PowerShell issue #23820](https://github.com/PowerShell/PowerShell/issues/23820). For a **manual** cross-check of embedded signature details, operators sometimes use **Sysinternals Sigcheck** (`sigcheck -i`) on a copy of the EFI file, or inspect **Properties → Digital Signatures** on the file when copied off the ESP.

The playbook still records `active_bootloader_signature_method = windows_authenticode` for traceability.

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
| `active_bootloader_signature_method` | Linux: `sbverify` (PKCS#7 from `sbverify --list`), `sbverify_failed`, `sbverify_not_installed`, `unreadable`, `none`. Windows: `windows_authenticode` |
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

The certificate chain is read with `Get-AuthenticodeSignature` and `X509Chain`. See **Prerequisites and verification → Windows** for catalog vs embedded signature caveats.

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

`active_bootloader_has_2011` / `active_bootloader_has_2023` are derived **only** from **`sbverify --list`** output (regex on PKCS#7 text). There is **no** strings/binary fallback for those flags. If `sbverify` is missing, non-zero, or the listing matches no known markers, the host is typically `NEEDS_EVIDENCE` until `sbsigntools` is installed and a successful listing is obtained.

## Remediation Mapping

| Finding | Fix |
|---|---|
| `db_has_2023=false` on Windows | Patch Windows, opt in, run Secure-Boot-Update, reboot twice |
| `kek_has_2023=false` on Windows | Same as above; if VMware still fails, check PK or regenerate NVRAM |
| Windows bootloader has 2011 only | After CA/KEK 2023 are present, install latest CU, trigger task, reboot twice |
| Linux active bootloader unowned | Reinstall/update vendor shim/GRUB packages and recreate EFI boot entry |
| Linux `sbverify` missing | Install **`sbsigntools`** (enable **CRB** and/or **EPEL** on RHEL if needed; **universe** on Ubuntu), then rerun assessment |
| Linux bootloader has 2011 only | Update vendor shim/GRUB/kernel packages, reboot twice, rerun assessment |
| Linux cannot boot with Secure Boot | Temporarily disable Secure Boot, boot OS, update boot chain, re-enable Secure Boot, rerun assessment |
