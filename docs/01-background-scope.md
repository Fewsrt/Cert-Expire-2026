# Background / Scope

## TL;DR (TH)
ใบรับรอง Secure Boot ชุดเก่า (2011) จะเริ่มหมดอายุช่วง **Jun 2026**
ควรวางแผนให้ Windows/VM ใช้ **Windows UEFI CA 2023** ให้ครบ โดยเฉพาะ VM บน **ESXi 7** ที่มักมีปัญหาเรื่อง UEFI variable persistence.

## Background
Microsoft Secure Boot certificates originally issued in **2011** will begin expiring in **June 2026**.
Organizations should ensure the **2023 Secure Boot certificates** are deployed across Windows systems (physical and virtual) to continue receiving boot-related security updates.

## Scope / Audience
- Windows workloads running with **UEFI + Secure Boot** (primary scope)
- Linux workloads running with **UEFI + Secure Boot** (impact notes + verification guidance)
- VMware vSphere / ESXi **7.x and 8.x**

## Key Notes
- Windows performs the certificate updates internally.
- ESXi 8 generally supports UEFI variable updates more reliably.
- ESXi 7 can have UEFI variable write/NVRAM persistence issues.

## Impact Overview
### Windows impact
- If 2023 certificates are not applied, Secure Boot-related update path can become non-compliant as 2011 certs expire (starting around **June 2026**).
- Some VMs may show rollout task success but fail post-reboot verification because UEFI variables did not persist.
- On encrypted systems (vTPM + BitLocker), Secure Boot key changes can trigger recovery prompts if change control is not planned.

### Linux impact
- Main risk is from **dbx revocations** and outdated **shim/GRUB/SBAT** chain, not from Windows rollout steps.
- Typical symptom: system fails Secure Boot validation and cannot boot with Secure Boot enabled.
- Recovery usually requires controlled rollback path (temporary Secure Boot disable, update boot chain, then re-enable).

### ESXi / vSphere impact
- Host platform does not directly run Windows guest rollout, but host/VM firmware behavior determines whether guest UEFI changes persist.
- ESXi 7 has higher operational risk for UEFI variable/NVRAM persistence issues; ESXi 8+ reduces but does not eliminate risk.
- Legacy VM NVRAM and invalid PK scenarios (KB 421593 / KB 423919 patterns) can cause repeated non-compliance even when guest steps are correct.

## High-level strategy
See: [02-inventory-powercli.md](02-inventory-powercli.md) → [03-windows-opt-in-and-trigger.md](03-windows-opt-in-and-trigger.md) → [04-verification-windows.md](04-verification-windows.md)
