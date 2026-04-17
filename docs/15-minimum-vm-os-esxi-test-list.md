# Minimum VM Test List — CA 2023 by OS + ESXi

ไฟล์นี้เป็นรายการ test case แบบสั้นและจำเป็นก่อน สำหรับใช้สร้าง lab ตามคู่ `Guest OS + ESXi version`

เป้าหมายคือหาคำตอบให้ได้เร็วว่า:

- VM แบบนี้โดน impact ไหม
- ถ้าโดน เกิดจาก OS, ESXi, NVRAM, KEK, PK หรือ Secure Boot setting
- ต้องแก้ด้วยวิธีไหน

---

## คำสั่งกลางที่ใช้ทุก Windows test

Run PowerShell as Administrator ใน Windows VM

### Check ก่อนเริ่ม

```powershell
Confirm-SecureBootUEFI

[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).Bytes) -match 'Windows UEFI CA 2023'
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI KEK).Bytes) -match 'Microsoft Corporation KEK 2K CA 2023'

Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot -Name AvailableUpdates -ErrorAction SilentlyContinue
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -ErrorAction SilentlyContinue
```

### Trigger update

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

หลัง trigger ให้ reboot อย่างน้อย 2 รอบ แล้ว check ซ้ำ

### Check event

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=1795,1796,1801,1808} -MaxEvents 20 |
  Select-Object TimeCreated, Id, ProviderName, Message
```

แปลผลสั้น ๆ:

- `1808` = update/certificate state ดีขึ้นหรือสำเร็จ
- `1801` = มี certificate update ที่ยัง apply ไม่สำเร็จ
- `1795` = firmware/virtual firmware return error
- `1796` = มักเกี่ยวกับ KEK update failure

---

## 1. Windows Server 2019 บน ESXi 7.0

### 1.1 Test 1 — Baseline EFI + Secure Boot ON

Purpose: ดูว่า Windows Server 2019 บน ESXi 7.0 update CA 2023 ได้และค่า persist หลัง reboot หรือไม่

VM setting:

- Guest OS: Windows Server 2019
- ESXi: 7.0 latest patch ที่หาได้
- Firmware: EFI
- Secure Boot: ON
- vTPM: OFF
- BitLocker: OFF

Steps:

1. ติดตั้ง Windows Server 2019
2. Windows Update ให้ล่าสุด
3. Install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. run check ซ้ำหลัง reboot แต่ละรอบ

Expected:

- `Confirm-SecureBootUEFI = True`
- `Windows UEFI CA 2023 = True`
- `Microsoft Corporation KEK 2K CA 2023 = True`
- ค่าไม่หายหลัง reboot รอบที่ 2

ถ้า fail:

- ถ้า CA/KEK หายหลัง reboot ให้สงสัย ESXi 7 / NVRAM persistence
- patch ESXi 7 ให้ล่าสุด
- ตรวจ datastore/snapshot chain
- ถ้ายัง fail ให้ migrate ไป ESXi 8.0.2+ แล้ว retest

### 1.2 Test 2 — EFI + Secure Boot OFF

Purpose: ยืนยันว่า VM ที่ปิด Secure Boot จะไม่โดน enforcement โดยตรง แต่เป็น compliance exception

VM setting:

- Guest OS: Windows Server 2019
- ESXi: 7.0
- Firmware: EFI
- Secure Boot: OFF

Steps:

1. boot VM
2. run:
   ```powershell
   Confirm-SecureBootUEFI
   ```
3. บันทึกผล

Expected:

- command จะ return `False` หรือไม่สามารถ confirm Secure Boot ได้
- VM ไม่อยู่ในกลุ่มที่ Windows Secure Boot CA 2023 rollout มีผลโดยตรง

Action:

- ถ้า policy ต้องเปิด Secure Boot ให้เปิด Secure Boot แล้วกลับไปทำ test 1.1
- ถ้าเปิดไม่ได้ ให้บันทึกเป็น exception

### 1.3 Test 3 — Invalid PK / Missing KEK check

Purpose: ตรวจว่า VM มีปัญหา PK invalid หรือ KEK 2023 missing หรือไม่

Steps:

1. check KEK:
   ```powershell
   [System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI KEK).Bytes) -match 'Microsoft Corporation KEK 2K CA 2023'
   ```
2. check PK:
   ```powershell
   $pk = Get-SecureBootUEFI -Name PK
   $bytes = $pk.Bytes
   $cert = $bytes[44..($bytes.Length-1)]
   [IO.File]::WriteAllBytes("PK.der", $cert)
   certutil -dump PK.der
   ```

Expected:

- KEK 2023 ควรเป็น `True`
- `certutil -dump PK.der` ต้องอ่าน certificate ได้ปกติ

ถ้า fail:

- ถ้า KEK 2023 missing และ VM เกิดจาก ESXi เก่า ให้ regenerate `.nvram`
- ถ้า PK invalid ให้ทำ manual PK update ตาม Broadcom KB 423919

---

## 2. Windows Server 2019 บน ESXi 8.0

### 2.1 Test 1 — Baseline EFI + Secure Boot ON

Purpose: ใช้เป็น baseline ว่า Windows Server 2019 บน ESXi 8.0 update ได้ปกติหรือไม่

VM setting:

- Guest OS: Windows Server 2019
- ESXi: 8.0.2+ หรือ 8.0.3 latest
- Firmware: EFI
- Secure Boot: ON
- vTPM: OFF
- BitLocker: OFF

Steps:

1. ติดตั้ง Windows Server 2019
2. patch OS ให้ล่าสุด
3. install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. run check ซ้ำ

Expected:

- CA 2023 และ KEK 2023 เป็น `True`
- ไม่มี event 1801/1795/1796 วนซ้ำ

ถ้า fail:

- ตรวจว่า VM ถูกสร้างบน ESXi ก่อน 8.0.2 หรือไม่
- ตรวจ `.nvram`
- ตรวจ PK invalid

### 2.2 Test 2 — VM เก่าที่ย้ายมาจาก ESXi 7.0

Purpose: จำลอง production VM ที่สร้างบน ESXi 7 แล้ว migrate มา ESXi 8

VM setting:

- Guest OS: Windows Server 2019
- ESXi ปัจจุบัน: 8.0.2+
- VM origin: สร้างจาก ESXi 7.0 หรือ import clone จาก ESXi 7.0
- Firmware: EFI
- Secure Boot: ON

Steps:

1. power on VM บน ESXi 8.0.2+
2. check KEK 2023
3. trigger update
4. reboot 2 รอบ
5. check CA/KEK ซ้ำ

Expected:

- ถ้า VM ไม่มี legacy NVRAM issue ต้องผ่านเหมือน test 2.1

ถ้า fail:

1. power off VM
2. upgrade VM compatibility เป็น latest supported
3. rename `.nvram` เป็น backup เช่น `vmname.nvram_old`
4. power on ให้ ESXi generate NVRAM ใหม่
5. check KEK/CA ใหม่

---

## 3. Windows Server 2022 บน ESXi 7.0

### 3.1 Test 1 — Baseline EFI + Secure Boot ON

Purpose: ทดสอบกลุ่มเสี่ยงสำคัญ เพราะ Windows Server 2022 + Secure Boot เคยมีประเด็นกับ ESXi 7.x

VM setting:

- Guest OS: Windows Server 2022
- ESXi: 7.0 latest patch
- Firmware: EFI
- Secure Boot: ON
- vTPM: OFF
- BitLocker: OFF

Steps:

1. ติดตั้ง Windows Server 2022
2. patch OS ให้ล่าสุด
3. install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. check CA/KEK/Event log

Expected:

- CA 2023 และ KEK 2023 เป็น `True`
- VM boot ได้ทุก reboot
- ค่า persist หลัง reboot

ถ้า fail:

- ถ้า boot เข้า UEFI Boot Manager หรือ boot ไม่ขึ้น ให้ capture screenshot
- ถ้า event 1801/1795/1796 วนซ้ำ ให้ตรวจ PK/KEK/NVRAM
- ถ้าเป็น production pattern ให้พิจารณา migrate ไป ESXi 8.0.2+

### 3.2 Test 2 — Reboot persistence test

Purpose: ทดสอบเฉพาะว่า UEFI variable บน ESXi 7 หายหลัง reboot หรือไม่

Steps:

1. หลัง test 3.1 ผ่าน ให้จดผล CA/KEK
2. reboot VM รอบที่ 1 แล้ว check
3. reboot VM รอบที่ 2 แล้ว check
4. power off VM แล้ว power on ใหม่ แล้ว check

Expected:

- CA/KEK 2023 ยังเป็น `True` ทุกครั้ง

ถ้า fail:

- จัดว่า impacted จาก NVRAM persistence
- patch ESXi 7
- ตรวจ datastore
- migrate ไป ESXi 8 แล้ว retest

---

## 4. Windows Server 2022 บน ESXi 8.0

### 4.1 Test 1 — Baseline EFI + Secure Boot ON

Purpose: ใช้เป็น baseline หลักสำหรับ Windows Server รุ่นใหม่

VM setting:

- Guest OS: Windows Server 2022
- ESXi: 8.0.2+ หรือ 8.0.3 latest
- Firmware: EFI
- Secure Boot: ON
- vTPM: OFF
- BitLocker: OFF

Steps:

1. ติดตั้ง Windows Server 2022
2. patch OS ให้ล่าสุด
3. install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. check CA/KEK/Event log

Expected:

- CA 2023 และ KEK 2023 เป็น `True`
- ไม่มี event failure วนซ้ำ
- VM boot ได้ปกติ

ถ้า fail:

- ตรวจว่า VM สร้างก่อน ESXi 8.0.2 หรือไม่
- ตรวจ PK invalid
- regenerate `.nvram` ถ้า KEK 2023 missing

### 4.2 Test 2 — vTPM + BitLocker

Purpose: ทดสอบ risk ตอน Secure Boot key เปลี่ยนกับ VM ที่ encrypt disk

VM setting:

- Guest OS: Windows Server 2022
- ESXi: 8.0.2+
- Firmware: EFI
- Secure Boot: ON
- vTPM: ON
- BitLocker: ON

Prereq:

- ต้องมี BitLocker recovery key
- ต้อง take snapshot ก่อน

Steps:

1. ตรวจ BitLocker:
   ```powershell
   manage-bde -status
   manage-bde -protectors -get C:
   ```
2. suspend BitLocker ชั่วคราว:
   ```powershell
   Suspend-BitLocker -MountPoint C: -RebootCount 2
   ```
3. trigger Secure Boot update
4. reboot 2 รอบ
5. check CA/KEK
6. ตรวจว่า BitLocker กลับมาปกติ

Expected:

- VM boot ได้
- ไม่ถาม recovery key หรือถ้าถามต้อง recover ได้
- CA/KEK 2023 เป็น `True`

ถ้า fail:

- ใช้ recovery key
- restore snapshot ถ้า boot ไม่ได้
- ทำ change control ใหม่ก่อน retry

---

## 5. Windows Server 2025 บน ESXi 8.0

### 5.1 Test 1 — New OS baseline

Purpose: ใช้ยืนยันว่า OS รุ่นใหม่ไม่มีปัญหาใน ESXi 8 baseline

VM setting:

- Guest OS: Windows Server 2025
- ESXi: 8.0.2+ หรือ 8.0.3 latest
- Firmware: EFI
- Secure Boot: ON
- vTPM: OFF สำหรับ test แรก

Steps:

1. ติดตั้ง Windows Server 2025
2. patch OS ให้ล่าสุด
3. install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. check CA/KEK/Event log

Expected:

- CA 2023 และ KEK 2023 เป็น `True`
- VM boot ได้ปกติ

ถ้า fail:

- ตรวจ PK/KEK/NVRAM
- ตรวจ ESXi patch level

---

## 6. Windows 10 22H2 บน ESXi 7.0

### 6.1 Test 1 — Client legacy baseline

Purpose: ทดสอบ Windows 10 VM ที่ยังมีอยู่ใน production

VM setting:

- Guest OS: Windows 10 22H2
- ESXi: 7.0 latest patch
- Firmware: EFI
- Secure Boot: ON

Steps:

1. ติดตั้งหรือ clone Windows 10 22H2
2. patch ให้ล่าสุดตาม support/ESU ที่มี
3. run check ก่อนเริ่ม
4. trigger Secure Boot update
5. reboot 2 รอบ
6. check CA/KEK/Event log

Expected:

- ถ้าอยู่ใน supported servicing/ESU ต้อง update ได้
- ถ้าไม่มี support/ESU ให้จัดเป็น exception

ถ้า fail:

- ตรวจ ESXi 7 NVRAM persistence
- ตรวจ PK/KEK
- พิจารณา upgrade เป็น Windows 11 หรือ supported OS

---

## 7. Windows 11 บน ESXi 8.0

### 7.1 Test 1 — Windows 11 baseline

Purpose: baseline สำหรับ Windows client รุ่นใหม่

VM setting:

- Guest OS: Windows 11 24H2 หรือ version ที่ production ใช้
- ESXi: 8.0.2+
- Firmware: EFI
- Secure Boot: ON
- vTPM: ON

Steps:

1. ติดตั้ง Windows 11
2. patch ให้ล่าสุด
3. install VMware Tools
4. run check ก่อนเริ่ม
5. trigger Secure Boot update
6. reboot 2 รอบ
7. check CA/KEK/Event log

Expected:

- CA 2023 และ KEK 2023 เป็น `True`
- boot manager update สำเร็จ
- VM boot ได้ปกติ

ถ้า fail:

- ตรวจ vTPM requirement
- ตรวจ PK/KEK/NVRAM
- ถ้าเป็น standalone ESXi ที่จัดการ vTPM ไม่ได้ ให้ทดสอบบน vCenter-managed environment

---

## 8. Linux RHEL-family บน ESXi 8.0

### 8.1 Test 1 — Secure Boot baseline

Purpose: ตรวจว่า Linux VM boot chain ยังผ่าน Secure Boot หลัง update package

VM setting:

- Guest OS: RHEL 8/9, Rocky/Alma/Oracle Linux 8/9 ตามที่มีจริง
- ESXi: 8.0.2+
- Firmware: EFI
- Secure Boot: ON

Steps:

1. ติดตั้ง OS จาก supported ISO
2. update package ล่าสุด
3. run:
   ```bash
   mokutil --sb-state
   mokutil --pk
   mokutil --kek
   mokutil --db
   mokutil --dbx
   rpm -q shim grub2-efi-x64 grub2-tools kernel
   ```
4. reboot 2 รอบ
5. run check ซ้ำ

Expected:

- `SecureBoot enabled`
- boot ได้ทุกครั้ง
- shim/grub/kernel มาจาก supported repo

ถ้า fail:

- ปิด Secure Boot ชั่วคราว
- boot เข้า OS
- update `shim`, `grub2`, `kernel`
- เปิด Secure Boot กลับแล้ว retest

---

## 9. Ubuntu LTS บน ESXi 8.0

### 9.1 Test 1 — Secure Boot baseline

Purpose: ตรวจ Ubuntu VM ที่เปิด Secure Boot

VM setting:

- Guest OS: Ubuntu 22.04 LTS หรือ 24.04 LTS
- ESXi: 8.0.2+
- Firmware: EFI
- Secure Boot: ON

Steps:

1. ติดตั้ง OS จาก supported ISO
2. update package ล่าสุด
3. run:
   ```bash
   mokutil --sb-state
   mokutil --pk
   mokutil --kek
   mokutil --db
   mokutil --dbx
   dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic
   ```
4. reboot 2 รอบ
5. run check ซ้ำ

Expected:

- `SecureBoot enabled`
- boot ได้ทุกครั้ง
- `shim-signed` และ GRUB เป็น package จาก supported repo

ถ้า fail:

- ปิด Secure Boot ชั่วคราว
- update `shim-signed`, signed GRUB, kernel
- เปิด Secure Boot กลับแล้ว retest

---

## 10. Test set ที่ควรทำก่อนเป็นอันดับแรก

ถ้าเวลาจำกัด ให้ทำแค่ 6 ชุดนี้ก่อน:

1. Windows Server 2022 บน ESXi 8.0 — test 4.1
2. Windows Server 2022 บน ESXi 7.0 — test 3.1 และ 3.2
3. Windows Server 2019 บน ESXi 7.0 — test 1.1
4. Windows Server 2019 บน ESXi 8.0 โดยใช้ VM ที่ migrate มาจาก ESXi 7.0 — test 2.2
5. Windows Server 2022 บน ESXi 8.0 with vTPM + BitLocker — test 4.2 ถ้า production ใช้ encryption
6. Linux representative 1 ตัวต่อ OS family ที่ใช้งานจริง — test 8.1 หรือ 9.1

---

## 11. สรุปผลที่ควรเขียนหลังทดสอบ

ใช้ format นี้ทุก test:

```text
Test ID:
Guest OS:
ESXi version/build:
VM firmware:
Secure Boot:
vTPM:
Encryption:
Before CA 2023:
Before KEK 2023:
After CA 2023:
After KEK 2023:
Event IDs:
Result: Pass / Fail / Exception
Impact: Yes / No
Root cause:
Remediation:
Retest result:
```
