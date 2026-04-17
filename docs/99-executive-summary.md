# Secure Boot Cert Update (2011 -> 2023) - Executive Summary (All-in-One)

## TL;DR (TH)
- ใบรับรอง Secure Boot ชุดปี 2011 เริ่มหมดอายุช่วง **June 2026**
- งานหลักคือทำให้ workload ที่ใช้ **UEFI + Secure Boot** โดยเฉพาะ Windows ใช้ cert ชุดปี 2023 ให้ครบ
- ใน VMware จุดเสี่ยงหลักคือ **UEFI variable / NVRAM persistence** (รันสำเร็จแต่หายหลัง reboot)

## สรุปภาพรวมทั้งหมด
- ฝั่ง **Windows**: ต้อง opt-in, trigger task, reboot, verify ว่ามี CA 2023 และสถานะผ่าน
- ฝั่ง **Linux**: ความเสี่ยงหลักมาจาก dbx revocation + เวอร์ชัน shim/GRUB/SBAT เก่า
- ฝั่ง **ESXi/vSphere**: ไม่ได้อัปเดต cert guest แทน Windows แต่มีผลต่อการ persist UEFI variables ของ VM
- ฝั่ง **Physical / Non-VMware**: ให้ใช้ OEM firmware + OS vendor runbook โดยไม่ใช้ VMware KB path

## Scope
- Primary: Windows workloads (VM และ physical) ที่เปิด UEFI + Secure Boot
- Secondary: Linux workloads ที่เปิด UEFI + Secure Boot
- Infrastructure: VMware ESXi 7.x/8.x/9.x (รวมเคส legacy VM)

## Baseline OS versions for fresh install (CA 2023-ready)
> ใช้เป็น baseline สำหรับ "ติดตั้งใหม่" เพื่อลดความเสี่ยงเรื่อง Secure Boot CA 2023 ในช่วง 2026 transition

| Environment | Windows baseline (recommended) | Linux baseline (recommended) | Notes |
|---|---|---|---|
| VMware VM (UEFI + Secure Boot) | Windows 11 (22H2/23H2/24H2) หรือ Windows Server 2022/2025 | Ubuntu LTS (supported) หรือ RHEL-family ที่ยัง support (เช่น RHEL 9/10 line) | ต้องตรวจว่า VM firmware/ESXi พร้อมให้ UEFI variable persist หลัง reboot |
| Physical / Non-VMware | Windows 11 (22H2/23H2/24H2) หรือ Windows Server 2022/2025 | Ubuntu LTS (supported) หรือ RHEL-family ที่ยัง support | ให้ยึด OEM firmware + OS vendor runbook เป็นหลัก |

### Additional compatibility notes
- Windows "Applies to" ใน Microsoft guidance ครอบคลุม Windows 10/11 และ Server 2016/2019/2022/2025 แต่สำหรับงานติดตั้งใหม่ให้ prefer รุ่นใหม่กว่าเป็น baseline
- Linux ให้ตัดสินจาก boot chain เวอร์ชันจริง (`shim`/`grub`/`SBAT`/`dbx`) มากกว่า OS major อย่างเดียว
- ถ้าใช้ Oracle Linux ให้ยืนยันว่า key-rotation/shim update ตาม vendor notice ถูก apply ครบ

## Impact ที่คาดว่าจะเจอ
### Windows impact
- ถ้าไม่ deploy cert 2023 ให้ครบ อาจไม่ผ่าน compliance หลังเข้า window การหมดอายุ
- บาง VM อาจรัน task ผ่านแต่ verify ไม่ผ่านเพราะค่าใน UEFI ไม่ persist
- ระบบที่มี vTPM + BitLocker อาจเจอ recovery prompt ถ้าเปลี่ยน Secure Boot keys โดยไม่เตรียมแผน

### Linux impact
- เสี่ยงบูตไม่ขึ้นเมื่อเจอ dbx/shim/SBAT revocation และ boot chain เก่า
- ต้องมี recovery path (temporary disable Secure Boot -> update -> enable กลับ)

### ESXi / vSphere impact
- ESXi 7 มีความเสี่ยงสูงกว่าเรื่อง UEFI/NVRAM persistence
- ESXi 8/9 ลดความเสี่ยงแต่ไม่ใช่ศูนย์
- เคส KB 421593 / 423919 ทำให้ guest rollout ถูกต้องแต่ยังไม่ compliant ได้

## Post-June 2026 expected outcomes
- Workloads ที่ยังพึ่ง trust chain ชุดเก่า (2011) จะมีโอกาสไม่ผ่าน Secure Boot policy/compliance สูงขึ้น
- Windows endpoints/VMs ที่ rollout cert 2023 ไม่ครบ อาจไม่พร้อมสำหรับ boot security servicing ตาม baseline ใหม่
- VMware environments จะเห็นเคส verification drift มากขึ้น (ทำผ่านครั้งแรกแต่ไม่คงหลัง reboot) โดยเฉพาะ VM ที่มี NVRAM/PK issues
- Linux workloads ที่มี shim/GRUB/SBAT เก่าจะเสี่ยง boot failure มากขึ้นเมื่อมี revocation/dbx enforcement เพิ่ม
- Operational impact: incident/recovery ticket เพิ่ม, ต้องใช้ maintenance window มากขึ้น, และต้องมี rollback/recovery procedure พร้อมใช้งานจริง

## One-page decision flow (ใช้งานจริง)
1. จำแนกก่อนว่าเป็น `VMware VM` หรือ `Physical/Non-VMware`
2. ถ้าไม่ใช่ VMware: ไปตาม runbook ผู้ผลิตเครื่อง/OS โดยตรง
3. ทำ platform readiness ก่อน (firmware/host/storage baseline ตามสภาพแวดล้อม)
4. ถ้าเป็น VMware: inventory ให้ครบ (EFI, Secure Boot, OS type, ESXi build, VM compatibility, VM origin)
5. ถ้า UEFI หรือ Secure Boot ยังไม่พร้อม: ยังไม่เข้า rollout CA 2023
6. Windows path: opt-in + run `\Microsoft\Windows\PI\Secure-Boot-Update` + reboot + verify
7. Linux path: verify (`mokutil`), patch boot chain, test reboot
8. ถ้า verify ไม่ผ่านใน VMware: ไล่ remediation host/storage/firmware แล้ว apply KB-specific fix

## Order rationale and exception
- Recommended: **Platform/Firmware first -> OS rollout -> Verification**
- Reason: OS เป็นตัว trigger การอัปเดต แต่ platform เป็นตัวตัดสินว่าค่า Secure Boot จะ persist หลัง reboot หรือไม่
- Exception: ถ้ามีหน้าต่างงานเร่งด่วนด้าน OS security สามารถทำ `OS-first` ชั่วคราวได้
- Requirement หลัง OS-first: ต้องกลับมาทำ platform remediation และ re-verify ก่อน sign-off compliance

## VMware remediation summary (เมื่อ verify ไม่ผ่าน)
1. Patch ESXi host ให้ล่าสุดใน major เดิม
2. ตรวจ datastore health/free space/snapshot chain
3. อัปเดต host BIOS/UEFI firmware + BMC
4. เคส **KB 421593**: regenerate `*.nvram` (power off -> upgrade compatibility -> rename nvram -> power on)
5. เคส **KB 423919**: manual PK update (มี change risk กับ vTPM + BitLocker/LUKS)
6. Re-verify หลัง reboot หลายรอบจนสถานะคงที่

## Minimum verification criteria (ก่อนปิดงาน)
### Windows
- `Confirm-SecureBootUEFI` = True
- พบ CA 2023 ใน Secure Boot `db` ตาม policy
- `UEFICA2023Status` อยู่สถานะ expected
- ผ่านซ้ำได้หลัง reboot มากกว่า 1 รอบ

### Linux
- `mokutil --sb-state` เป็น enabled ตามต้องการ
- ระบบบูตผ่านหลัง update boot chain
- มีหลักฐาน recovery/rollback ที่ทดสอบแล้ว (ถ้าใช้ encryption)

## Recommended rollout order
1. Pilot (ESXi 8 + representative apps)
2. ESXi 7 high-risk workloads
3. Broad rollout by business wave
4. Final audit + compliance evidence pack

## Exit criteria
- Workload ใน scope มีผล verify ครบตามเกณฑ์
- เคส exception มี owner + mitigation + due date ชัดเจน
- เอกสารหลักฐานพร้อมสำหรับ audit/management sign-off

## References (pinned)
- Broadcom KB 421593:
  https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- Broadcom KB 423919:
  https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html
- Microsoft Secure Boot overview:
  https://learn.microsoft.com/windows-hardware/design/device-experiences/oem-secure-boot
- PowerShell SecureBoot module:
  - Confirm-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/confirm-securebootuefi
  - Get-SecureBootUEFI: https://learn.microsoft.com/powershell/module/secureboot/get-securebootuefi
- Linux reference:
  - mokutil: https://manpages.ubuntu.com/manpages/jammy/man1/mokutil.1.html
  - shim (SBAT): https://github.com/rhboot/shim
