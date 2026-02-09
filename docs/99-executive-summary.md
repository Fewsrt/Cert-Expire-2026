# Secure Boot Cert Update (2011 → 2023) — Executive Summary (VMware/ESXi)

## TL;DR (TH)
- ใบรับรอง Secure Boot ชุดเก่า (2011) จะเริ่มหมดอายุช่วง **Jun 2026**
- เป้าหมายคือให้ระบบ/VM ที่ใช้ UEFI + Secure Boot โดยเฉพาะ Windows ใช้ **Windows UEFI CA 2023** ให้ครบ
- จุดเสี่ยงที่เจอบ่อยใน VMware คือเรื่อง **UEFI variables / NVRAM persistence** (ทำแล้วไม่ติดหลัง reboot)

## Scope
- Windows VMs บน VMware ESXi 7.x/8.x (หลัก)
- Linux VMs ที่เปิด UEFI + Secure Boot (อาจได้รับผลกระทบจาก dbx/shim/SBAT)

## What changes where?
- **Guest/VM Secure Boot variables (db/KEK/dbx):** Windows update task จะเขียนตรงนี้ (ระดับ VM)
- **Host BIOS/UEFI keys (PK/KEK/db/dbx ในเครื่องจริง):** โดยปกติไม่ต้องอัปเดต “เพราะ” UEFI CA 2023 rollout แต่ควรอัปเดต firmware หาก troubleshoot ปัญหา persistence

## Windows VM rollout (ขั้นต่ำ)
1) Inventory: VM firmware=EFI, Secure Boot enabled, ESXi version/build, VM compatibility
2) Inside Windows (guest): opt-in + run task
   - Set `MicrosoftUpdateManagedOptIn=1`
   - Run Scheduled Task: `\Microsoft\Windows\PI\Secure-Boot-Update`
3) Reboot
4) Verify:
   - `Confirm-SecureBootUEFI`
   - Check CA 2023 present in `db`
   - Check `UEFICA2023Status`

## ESXi / NVRAM risks (สำคัญ)
### ทำไม NVRAM สำคัญ
UEFI variables ของ VM ถูก persist ในไฟล์ `*.nvram` ของ VM หากไม่ persist จะเห็นอาการ “ทำแล้วหายหลัง reboot”.

### ESXi 8 ก็โดนได้
Broadcom ระบุเคสที่เกี่ยวข้องกับ ESXi 8 ด้วย (ดู KB refs):
- **KB 421593:** VM ที่สร้างบน ESXi < 8.0.2 จะมี `*.nvram` legacy ทำให้ KEK list ขาด **Microsoft Corporation KEK CA 2023** แม้อัป host แล้ว
  - แนวทาง: power off → upgrade VM compatibility → rename `*.nvram` → power on เพื่อ regenerate
- **KB 423919:** VM ที่มี **Platform Key (PK) signature invalid** จะทำให้ automated updates ของ DB/DBX/KEK fail (ครอบคลุม ESXi 7.x/8.x/9.x)
  - แนวทาง: manual PK update (มี caution เรื่อง vTPM + BitLocker/LUKS)

## Linux VMs (UEFI + Secure Boot)
- ผลกระทบหลักมาจาก **dbx revocation** และอายุของ **shim/GRUB/SBAT**
- อาการ: เปิด Secure Boot แล้วบูตไม่ขึ้น
- ตรวจสอบเบื้องต้น:
  - `mokutil --sb-state`
  - `mokutil --list-enrolled`

## Recommended operator decision tree (สั้น)
- ถ้า verify ผ่าน → COMPLIANT
- ถ้า verify ไม่ผ่านบน ESXi 7/8:
  1) Patch ESXi build
  2) ตรวจ datastore/snapshot chain
  3) อัป BIOS/UEFI firmware + BMC
  4) Apply KB-specific fix (421593 regen NVRAM / 423919 PK update)
  5) (ถ้ายังไม่จบ) migrate ไป ESXi 8 + upgrade VM compatibility

## References (pinned)
- Broadcom KB 421593 — Missing Microsoft Corporation KEK CA 2023:
  https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- Broadcom KB 423919 — Manual Update of Secure Boot Platform Key:
  https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html

- Microsoft Secure Boot overview:
  https://learn.microsoft.com/windows-hardware/design/device-experiences/oem-secure-boot
- PowerShell SecureBoot module:
  - Confirm-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/confirm-securebootuefi
  - Get-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/get-securebootuefi
- mokutil manpage (Ubuntu example):
  https://manpages.ubuntu.com/manpages/jammy/man1/mokutil.1.html
- shim project (SBAT background):
  https://github.com/rhboot/shim
