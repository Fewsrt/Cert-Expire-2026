# Secure Boot Certificate Management (2011 → 2023) — VMware + Windows Playbook

> TL;DR (TH): ใบรับรอง Secure Boot ชุดเก่า (2011) จะเริ่มหมดอายุช่วง **Jun 2026**
> ต้องทำให้ Windows ติดตั้ง/อัพเดทไปใช้ **Windows UEFI CA 2023** ให้ครบ โดยเฉพาะ VM บน **ESXi 7** ที่มักมีปัญหาเขียน UEFI variables / NVRAM persistence

## Categories (board)

### 0) Start here
- [docs/01-background-scope.md](docs/01-background-scope.md)
- [docs/09-flowcharts.md](docs/09-flowcharts.md)

### 1) Inventory
- [docs/02-inventory-powercli.md](docs/02-inventory-powercli.md)

### 2) Windows rollout (guest)
- [docs/03-windows-opt-in-and-trigger.md](docs/03-windows-opt-in-and-trigger.md)
- [docs/04-verification-windows.md](docs/04-verification-windows.md)

### 3) ESXi host considerations
- [docs/05-esxi-host-firmware-nvram.md](docs/05-esxi-host-firmware-nvram.md)
- [docs/06-esxi7-remediation.md](docs/06-esxi7-remediation.md)

### 4) Linux VMs (UEFI + Secure Boot)
- [docs/07-linux-vms-secure-boot.md](docs/07-linux-vms-secure-boot.md)

### 5) Automation
- [docs/08-automation-vmware-tools.md](docs/08-automation-vmware-tools.md)

### 6) Sandbox / simulation (test all cases)
- [docs/11-sandbox-simulation-use-cases.md](docs/11-sandbox-simulation-use-cases.md)

### 7) References
- [docs/10-references.md](docs/10-references.md)

---

## Notes on “ESXi 8 also affected by NVRAM”

It’s possible for NVRAM/UEFI variable persistence issues to occur on any ESXi version if there are underlying problems (datastore health, permissions, firmware bugs). ESXi 8 reduces risk but is not an absolute guarantee.

If you have a specific Broadcom KB that states this, paste the KB URL/ID and I will pin it into the references and update the wording accordingly.

## Change Log

- 2026-02-07: README formatting improvements + added TH TL;DR, scope, outputs, and ESXi7 caveats
- 2026-02-09: Split runbook into categorized docs under `docs/`
