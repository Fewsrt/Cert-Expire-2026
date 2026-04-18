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

By default the playbook **attempts to install `sbsigntools`** (`sbverify`) on Linux guests in the same run (PKCS#7 is preferred for bootloader CA flags — see **Prerequisites and verification** below). To skip that package step (assessment still uses embedded string scan if `sbverify` is absent):

```bash
VCENTER_CSV=../path/to/vcenter-export.csv ansible-playbook playbooks/secureboot_ca_assessment.yml -e secureboot_install_sbsigntools=false
```

**RHEL / Alma / Rocky (optional):** if `sbsigntools` is still not found after enabling **CRB**, you may opt in to installing the **EPEL** release RPM from Fedora (adds a third-party repo — confirm with your security team):

```bash
VCENTER_CSV=../path/to/vcenter-export.csv ansible-playbook playbooks/secureboot_ca_assessment.yml \
  -e secureboot_install_epel_for_sbsigntools=true
```

## Prerequisites and verification (by OS)

This section summarizes **what the playbook uses**, **what you may need to install**, and **how to double-check manually**. Official references are linked.

### Linux (guest)

| What is measured | Tool in guest | One install path (playbook) |
|---|---|---|
| Firmware variables (`db`, `KEK`, …) | `mokutil` | Preinstalled (`mokutil` package). |
| Active EFI binary — PE signature | `sbverify --list` first, else `pesign -i file -S` | From distro packages `sbsigntools`/`sbsigntool` and `pesign` (no scanning raw EFI bytes). |

**One package path per OS (what the playbook installs):**

- **Debian / Ubuntu:** `apt install sbsigntool` (enable **universe** on Ubuntu if needed). Verify: `command -v sbverify`.
- **Red Hat family:** Enable **CRB** (playbook does this), then `dnf install sbsigntools`. If your org allows **EPEL**, run the assessment with `-e secureboot_install_epel_for_sbsigntools=true` so the playbook adds EPEL and installs the same package name. Signing workflows for custom kernels use **`pesign`**; this assessment only **reads** vendor shim/GRUB via **`sbverify`** — see [RHEL — Signing a kernel and modules for Secure Boot](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/managing_monitoring_and_updating_the_kernel/signing-a-kernel-and-modules-for-secure-boot_managing-monitoring-and-updating-the-kernel).
- **SUSE / openSUSE:** `zypper install sbsigntools` only.

Upstream tooling for UEFI PE signatures: **sbsigntools** ([Fedora package overview](https://packages.fedoraproject.org/pkgs/sbsigntools/sbsigntools/)).

#### References (what vendors and docs use to *read* EFI signatures)

These sources align the playbook with common practice: **list or verify Authenticode/PKCS#7 on PE/EFI binaries** using user-space tools, not guessing from firmware alone.

| OS family | Primary read path | Alternatives / notes | Source |
|---|---|---|---|
| **Debian / Ubuntu** | `sbverify` from **`sbsigntool`** / **`sbsigntools`** packages (`sbverify --list` on `*.efi`) | Ubuntu docs also use `mokutil` for SB state; wiki examples use `sbverify` with distro keys | [Debian `sbverify(1)`](https://manpages.debian.org/bookworm/sbsigntool/sbverify.1.en.html), [Ubuntu Secure Boot testing (sbverify examples)](https://wiki.ubuntu.com/UEFI/SecureBoot/Testing) |
| **RHEL / Alma / Rocky** | **`sbverify`** from **`sbsigntools`** (often **CRB** and/or **EPEL**); `sbverify --list` on shim | Red Hat documents **`pesign`** for *inspecting* shim signing in support articles; signing workflows use **`pesign`**, **`openssl`**, **`mokutil`** | [Red Hat — Secure Boot certificate guidance (example: `pesign` / `sbverify` on shim)](https://access.redhat.com/articles/7128933), [RHEL 8 — signing kernel/modules for Secure Boot (`pesign`)](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/8/html/managing_monitoring_and_updating_the_kernel/signing-a-kernel-and-modules-for-secure-boot_managing-monitoring-and-updating-the-kernel) |
| **SUSE / openSUSE** | **`sbsigntools`** / `sbverify`; same PE/PKCS#7 model | SUSE often documents **`osslsigncode`** + **`openssl pkcs7`** for extracting/viewing signatures on **kernel** PE images; analogous to EFI PE signing | [SUSE Communities — extract signer / verify kernel PE (osslsigncode, openssl)](https://www.suse.com/c/extract-the-signers-certificate-and-verify-the-signature-of-a-linux-kernel-image/), [openSUSE man `sbattach` / sbsigntools](https://manpages.opensuse.org/Tumbleweed/sbsigntools/sbattach.1.en.html) |
| **Windows** | **`Get-AuthenticodeSignature`** + **`X509Chain`** (playbook); mount ESP then read `bootmgfw.efi` | Community/tools often use **`X509Certificate2::CreateFromSignedFile`**, **Sysinternals Sigcheck**, or dedicated EFI parsers — in part because **catalog vs embedded** Authenticode can confuse pure `Get-AuthenticodeSignature` on boot files | [PowerShell issue — embedded vs catalog signatures on boot binaries](https://github.com/PowerShell/PowerShell/issues/23820) |

**Cross-distro:** `sbverify` is the widely referenced CLI for “list signatures on a UEFI secure boot image” (see [Arch `sbverify(1)`](https://man.archlinux.org/man/extra/sbsigntools/sbverify.1.en) and [Unix.SE — verifying an EFI binary](https://unix.stackexchange.com/questions/753526/verifying-a-signature-of-an-efi-binary)).

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
| `active_bootloader_signature_method` | Linux: `sbverify`, `sbverify_failed`, `pesign`, `pesign_failed`, `sbverify_not_installed` (neither tool on PATH), `unreadable`, `none`. Windows: `windows_authenticode` |
| `decision` | `PASS_OR_LOW_RISK`, `IMPACTED`, `NEEDS_EVIDENCE`, `NEEDS_MANUAL_REVIEW`, or related final state |
| `root_cause` | Why the host is not pass/low-risk |
| `fix` | The remediation workflow for that host |
| `operational_interpretation` | What this snapshot can and cannot claim about **migration/policy impact** vs **whether the system will boot on the next reboot** (static inspection only; not a firmware emulator) |

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

`active_bootloader_has_2011` / `active_bootloader_has_2023` come from **`sbverify --list`** when it succeeds; if `sbverify` is absent or non-zero, the playbook uses **`pesign -i … -S`** (same CA regex on tool output). Both are **distro packages** — no raw-binary heuristic. If both are missing or fail, the row is typically `NEEDS_EVIDENCE`. **`operational_interpretation`** limits claims about **next-reboot boot success**.

## Remediation Mapping

| Finding | Fix |
|---|---|
| `db_has_2023=false` on Windows | Patch Windows, opt in, run Secure-Boot-Update, reboot twice |
| `kek_has_2023=false` on Windows | Same as above; if VMware still fails, check PK or regenerate NVRAM |
| Windows bootloader has 2011 only | After CA/KEK 2023 are present, install latest CU, trigger task, reboot twice |
| Linux active bootloader unowned | Reinstall/update vendor shim/GRUB packages and recreate EFI boot entry |
| Linux `sbverify_not_installed` / `NEEDS_EVIDENCE` | Install **`sbsigntool`** (Debian/Ubuntu) or **`sbsigntools`** (RHEL/SUSE) from vendor repos; RHEL may need **CRB** and/or **EPEL** per policy |
| Linux bootloader has 2011 only | Update vendor shim/GRUB/kernel packages, reboot twice, rerun assessment |
| Linux cannot boot with Secure Boot | Temporarily disable Secure Boot, boot OS, update boot chain, re-enable Secure Boot, rerun assessment |
