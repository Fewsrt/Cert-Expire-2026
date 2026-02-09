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

## High-level strategy
See: [02-inventory-powercli.md](02-inventory-powercli.md) → [03-windows-opt-in-and-trigger.md](03-windows-opt-in-and-trigger.md) → [04-verification-windows.md](04-verification-windows.md)
