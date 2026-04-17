# VM Test Cases — Secure Boot CA 2023

เอกสารนี้เป็น test case สำหรับจำลอง lab เพื่อหาว่า VM แบบไหนจะโดนผลกระทบจากการเปลี่ยน Secure Boot certificate ชุด 2011 ไปเป็นชุด 2023 และถ้าโดนต้องแก้ไขอย่างไร

Scope ของไฟล์นี้คือ VM บน VMware ESXi เท่านั้น แต่ครอบคลุมจุดที่ต้องเตรียมตั้งแต่ host firmware, ESXi version, VM firmware/NVRAM, virtual hardware, และ guest OS

---

## Focus ของการทดสอบนี้

การทดสอบนี้ไม่ได้ focus แค่คำว่า "CA 2023" อย่างเดียว แต่ focus ที่ Secure Boot variables หลัก 4 ตัวนี้:

| ตัวที่ focus | อยู่ที่ไหน | ต้องตรวจอะไร | ถ้าผิดปกติจะกระทบอะไร |
|---|---|---|---|
| CA | อยู่ใน `db` | มี `Windows UEFI CA 2023` หรือยัง | Windows boot manager รุ่นใหม่อาจไม่ถูก trust |
| KEK | อยู่ใน `KEK` | มี `Microsoft Corporation KEK 2K CA 2023` หรือยัง | update `db` / `dbx` ต่อไม่ได้ หรือ future revocation update fail |
| DB | UEFI variable `db` | allow list มี certificate ใหม่ครบไหม | bootloader/EFI app ที่ควรถูก trust อาจ boot ไม่ผ่าน |
| DBX | UEFI variable `dbx` | revocation list update ได้ไหม | revoke bootloader/cert ที่ไม่ปลอดภัยไม่ได้ หรือ update fail |

ดังนั้น pass/fail ของ lab ต้องไม่ดูแค่ว่า VM boot ได้ แต่ต้องดูว่า `CA`, `KEK`, `db`, และ `dbx` อยู่ใน state ที่ update ได้และ persist หลัง reboot

---

## 1) สิ่งที่ต้องเข้าใจก่อนเริ่ม

### 1.1 Certificate ที่เกี่ยวข้อง

| Certificate เก่า | หมดอายุโดยประมาณ | อยู่ที่ | Certificate ใหม่ | ผลกระทบหลัก |
|---|---:|---|---|---|
| Microsoft Corporation KEK CA 2011 | Jun 2026 | KEK | Microsoft Corporation KEK 2K CA 2023 | ถ้าไม่มี KEK ใหม่ จะ update DB/DBX ในอนาคตไม่ได้ |
| Microsoft Windows Production PCA 2011 | Oct 2026 | DB | Windows UEFI CA 2023 | ใช้ trust Windows boot manager รุ่นใหม่ |
| Microsoft Corporation UEFI CA 2011 | Jun 2026 | DB | Microsoft UEFI CA 2023 / Microsoft Option ROM UEFI CA 2023 | กระทบ third-party bootloader, EFI app, option ROM |

### 1.2 VM แบบไหนที่ถือว่าเสี่ยง

ถือว่าเสี่ยงถ้าเข้าเงื่อนไขใดเงื่อนไขหนึ่ง:

- VM ใช้ `EFI` firmware และเปิด `Secure Boot`
- Windows VM ยังไม่มี `Windows UEFI CA 2023` ใน `db`
- Windows VM ยังไม่มี `Microsoft Corporation KEK 2K CA 2023` ใน `KEK`
- VM ถูกสร้างบน ESXi ก่อน `8.0.2` แล้วถูกย้ายหรือ upgrade host ทีหลัง เพราะ `.nvram` อาจยังเป็นชุดเก่า
- VM อยู่บน ESXi 7.x หรือ ESXi 8.x/9.x แต่มี Platform Key (PK) invalid หรือเป็น NULL signature
- VM ใช้ vTPM และมี BitLocker/LUKS ที่ผูกกับ TPM PCRs เพราะการเปลี่ยน Secure Boot key อาจทำให้ถาม recovery key
- Linux VM เปิด Secure Boot และใช้ shim/GRUB/kernel เก่า หรือ OS ไม่ supported แล้ว

ไม่ถือว่าโดนโดยตรงถ้า:

- VM ใช้ BIOS legacy firmware
- VM ใช้ EFI แต่ปิด Secure Boot
- VM เป็น test workload ที่ยอมรับการปิด Secure Boot เป็น exception ได้

---

## 2) Lab ที่แนะนำให้สร้าง

### 2.1 ESXi / vSphere matrix

ถ้าไม่มีเครื่องจริง ให้ใช้ nested ESXi ได้สำหรับทดสอบพฤติกรรม VM firmware/NVRAM แต่ nested ESXi จะไม่แทน physical OEM firmware ได้ 100%

| Layer | ต้องมี | ใช้ทดสอบอะไร |
|---|---|---|
| vCenter | 1 ตัว ถ้ามี license/lab พร้อม | clone, migrate, template, vTPM, PowerCLI inventory |
| ESXi 7.x latest patch | 1 host | baseline ความเสี่ยง ESXi 7 / NVRAM persistence |
| ESXi 8.0.0 หรือ 8.0.1 | optional | สร้าง VM/NVRAM เก่าเพื่อจำลอง missing KEK 2023 จาก VM origin ก่อน 8.0.2 |
| ESXi 8.0.2+ หรือ 8.0.3 latest | 1 host | baseline ที่ควรผ่าน และใช้ทดสอบ NVRAM regenerate |
| ESXi 9.x | optional | future baseline ถ้า environment มี |

ถ้าทำ lab ได้แค่ 1 host ให้เลือก ESXi 8.0.3 latest แล้วสร้าง test case ที่จำลอง VM เก่าด้วยการ import VM/NVRAM จาก ESXi 7.x หรือ 8.0.1

### 2.2 Host firmware checklist

ใช้กับ ESXi physical host จริง ถ้าเป็น nested ให้บันทึกว่า `not representative of physical firmware`

| รายการ | ค่าที่ต้องเก็บ | วิธีตรวจ |
|---|---|---|
| Server vendor/model | Dell/HPE/Lenovo/etc. | iDRAC/iLO/XCC หรือ BIOS UI |
| BIOS/UEFI firmware version | version/date | vendor UI หรือ ESXi hardware inventory |
| Secure Boot host state | enabled/disabled | BIOS UI และ ESXi command |
| TPM 2.0 state | present/enabled/disabled | BIOS UI และ ESXi command |
| BMC firmware | iDRAC/iLO/XCC version | vendor UI |

ESXi commands:

```sh
/usr/lib/vmware/secureboot/bin/secureBoot.py -c
esxcli hardware trustedboot get
esxcli system settings encryption get
esxcli system version get
```

Pass criteria:

- `secureBoot.py -c` ต้องบอกว่า VIB signatures/tardisks/acceptance levels ผ่าน ถ้าจะเปิด ESXi host Secure Boot
- ถ้าใช้ TPM, `Tpm Present: true`
- host time/BIOS time ต้องถูกต้อง เพราะ Secure Boot validation อาจ fail ถ้าเวลา firmware ผิดมาก

Remediation:

- patch ESXi เป็น latest build ของ major version
- update BIOS/UEFI firmware และ BMC ตาม vendor
- ถ้า host Secure Boot เปิดไม่ได้ ให้แก้ VIB unsigned/unsupported ก่อน

### 2.3 Guest OS matrix ที่ควรมีใน lab

เลือกตาม OS ที่มีใน production จริงก่อน ถ้าไม่รู้ inventory ให้เริ่มจาก matrix นี้

#### Windows Server

| OS | Test priority | เหตุผล |
|---|---:|---|
| Windows Server 2025 | High | supported รุ่นใหม่ ต้องเป็น baseline ที่ผ่าน |
| Windows Server 2022 | High | พบมากใน VM และเคยมีประเด็น Secure Boot/ESXi จาก CVE-2023-24932 |
| Windows Server 2019 | High | production VM พบบ่อย |
| Windows Server 2016 | Medium | supported แต่เก่า ต้องตรวจ update path |
| Windows Server 2012 / 2012 R2 with ESU | Medium | test เฉพาะถ้ายังมี ESU จริง |
| Windows Server 2012 / 2012 R2 without ESU | Exception | ไม่ควรคาดหวัง certificate rollout ปกติ ให้จัดเป็น exception/upgrade |

#### Windows Client

| OS | Test priority | เหตุผล |
|---|---:|---|
| Windows 11 24H2 | High | baseline client รุ่นใหม่ |
| Windows 11 23H2 / 22H2 / 21H2 | Medium | ทดสอบถ้ายังมีอยู่ |
| Windows 10 22H2 with supported servicing/ESU | High | ยังพบมากและเป็นกลุ่มเสี่ยงด้าน compliance |
| Windows 10 LTSC 2019 / LTSC 2021 | Medium | พบใน VM เฉพาะทาง |
| Windows 10 unsupported without ESU | Exception | ให้จัดเป็น upgrade/replace/exception |

#### Linux

Linux ไม่ได้ใช้ Microsoft Windows automated workflow โดยตรง แต่ถ้าเปิด Secure Boot จะกระทบจาก firmware DB/DBX, shim, GRUB, SBAT และ key chain

| OS family | Test priority | สิ่งที่ต้องเน้น |
|---|---:|---|
| RHEL 8/9/10 | High | shim/grub2/kernel จาก supported repo |
| Rocky/Alma/Oracle Linux 8/9 | High | package chain ตาม vendor |
| Ubuntu 22.04/24.04 LTS | High | `shim-signed`, signed GRUB |
| Debian 12 | Medium | Secure Boot package chain |
| SLES 15 | Medium | shim/grub2/kernel จาก SUSE repo |
| Unsupported Linux / pinned old shim | Exception/High risk | มีโอกาส boot fail เมื่อ dbx/revocation เปลี่ยน |

---

## 3) Standard evidence ที่ต้องเก็บทุก test case

เก็บก่อนและหลัง remediation ทุกครั้ง

### 3.1 vSphere / VM evidence

```powershell
# PowerCLI
Get-VM <vm-name> | Select Name, PowerState, Version, GuestId
Get-VM <vm-name> | Get-AdvancedSetting | Where-Object Name -match 'uefi|secure|nvram'
Get-VM <vm-name> | Select Name, @{N='Firmware';E={$_.ExtensionData.Config.Firmware}}, @{N='SecureBoot';E={$_.ExtensionData.Config.BootOptions.EfiSecureBootEnabled}}
```

เก็บข้อมูลนี้ด้วย:

- VM name
- ESXi host version/build
- VM compatibility / virtual hardware version
- VM created on ESXi version ใด ถ้ารู้
- datastore type
- snapshot state
- vTPM enabled หรือไม่
- BitLocker/LUKS enabled หรือไม่

### 3.2 Windows evidence

Run PowerShell as Administrator:

```powershell
Confirm-SecureBootUEFI

[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).Bytes) -match 'Windows UEFI CA 2023'
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI KEK).Bytes) -match 'Microsoft Corporation KEK 2K CA 2023'
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).Bytes) -match 'Microsoft UEFI CA 2023'
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).Bytes) -match 'Microsoft Option ROM UEFI CA 2023'

Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot -Name AvailableUpdates -ErrorAction SilentlyContinue
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -ErrorAction SilentlyContinue

Get-WinEvent -FilterHashtable @{LogName='System'; Id=1795,1796,1801,1808} -MaxEvents 20 |
  Select-Object TimeCreated, Id, ProviderName, Message
```

แปลผลเร็ว:

- `Confirm-SecureBootUEFI = True` คือ Secure Boot เปิดอยู่
- `Windows UEFI CA 2023 = True` คือ DB trust boot manager รุ่นใหม่แล้ว
- `Microsoft Corporation KEK 2K CA 2023 = True` คือมี KEK ใหม่สำหรับ authorize DB/DBX update
- Event `1808` คือ informational ว่า firmware มี certificate ใหม่ที่ต้องการแล้ว
- Event `1801` คือยังมี update ที่ยัง apply ไม่สำเร็จ
- Event `1795` คือ firmware return error ตอน update DB/KEK
- Event `1796` มักเกี่ยวกับ KEK update failure

### 3.3 Linux evidence

```bash
mokutil --sb-state
mokutil --pk
mokutil --kek
mokutil --db
mokutil --dbx
```

Package checks:

```bash
# Ubuntu / Debian
dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic

# RHEL / Rocky / Alma / Oracle Linux
rpm -q shim grub2-efi-x64 grub2-tools kernel

# SLES
rpm -q shim grub2-x86_64-efi kernel-default
```

---

## 4) Windows deployment commands สำหรับ lab

ใช้กับ Windows VM ที่ต้องการ opt-in ให้ Windows ทำ Secure Boot certificate update

```powershell
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
```

หลัง run task:

1. reboot อย่างน้อย 1 ครั้ง
2. รอ task รอบถัดไปถ้ายังไม่ครบ เพราะ Microsoft ระบุว่าอาจใช้เวลาประมาณ 48 ชั่วโมงและต้อง reboot มากกว่า 1 ครั้ง
3. verify ซ้ำหลัง reboot 2 รอบ เพื่อดูว่า UEFI variable persist จริง

---

## 5) Test cases: ESXi host / VM firmware

### TC-FW-01 — Baseline ESXi host firmware readiness

Purpose: ยืนยันว่า ESXi host พร้อมสำหรับ VM Secure Boot testing

Prereq:

- ESXi 7.x และ/หรือ 8.x host
- SSH เข้า host ได้

Steps:

1. ตรวจ ESXi build:
   ```sh
   esxcli system version get
   ```
2. ตรวจ Secure Boot compatibility:
   ```sh
   /usr/lib/vmware/secureboot/bin/secureBoot.py -c
   ```
3. ตรวจ TPM/trusted boot ถ้าใช้:
   ```sh
   esxcli hardware trustedboot get
   esxcli system settings encryption get
   ```
4. เก็บ BIOS/UEFI firmware และ BMC version จาก vendor UI

Expected:

- host ไม่มี unsigned VIB ที่ทำให้ Secure Boot ใช้ไม่ได้
- firmware date/time ถูกต้อง
- ถ้าจะใช้ TPM ต้องเห็น TPM 2.0

Impact decision:

- ถ้า host Secure Boot เปิดไม่ได้ ไม่ได้แปลว่า Windows VM CA 2023 fail เสมอ แต่ถือว่า host compliance ไม่พร้อม
- ถ้า firmware เก่ามาก ให้ update ก่อนใช้เป็น production baseline

Remediation:

- patch ESXi
- remove/replace unsigned VIB
- update BIOS/UEFI/BMC

### TC-FW-02 — VM firmware mode impact

Purpose: แยก VM ที่โดนและไม่โดนจาก firmware mode

VM set:

- VM-A: BIOS legacy
- VM-B: EFI, Secure Boot OFF
- VM-C: EFI, Secure Boot ON

Steps:

1. ตรวจจาก vSphere UI หรือ PowerCLI ว่า firmware/Secure Boot เป็นอะไร
2. ใน Windows VM run:
   ```powershell
   Confirm-SecureBootUEFI
   ```
3. ใน Linux VM run:
   ```bash
   mokutil --sb-state
   ```

Expected:

- BIOS legacy: `Confirm-SecureBootUEFI` ใช้ไม่ได้หรือไม่ใช่ UEFI, ไม่อยู่ใน CA 2023 rollout scope
- EFI + Secure Boot OFF: ไม่โดน Secure Boot enforcement ตอน boot แต่ยังเป็น compliance exception
- EFI + Secure Boot ON: อยู่ใน test scope เต็ม

Remediation:

- ถ้า policy ต้องใช้ Secure Boot ให้ convert/สร้าง VM ใหม่เป็น EFI + Secure Boot ON แล้วทดสอบ OS boot chain

### TC-FW-03 — VM created before ESXi 8.0.2 missing KEK 2023

Purpose: จำลองกรณี `.nvram` เก่าที่ยังมี KEK 2011 แต่ไม่มี KEK 2023

Prereq:

- Windows VM ที่ถูกสร้างบน ESXi ต่ำกว่า 8.0.2 หรือ VM clone/import ที่มี `.nvram` เก่า
- ESXi 8.0.2+ สำหรับรันและแก้

Steps:

1. Power on VM บน ESXi 8.0.2+
2. ตรวจ KEK:
   ```powershell
   [System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI KEK).Bytes) -match 'Microsoft Corporation KEK 2K CA 2023'
   ```
3. ถ้าได้ `False` ให้ power off VM
4. upgrade VM compatibility เป็น latest supported
5. rename `.nvram` ใน datastore เช่น `vmname.nvram` เป็น `vmname.nvram_old`
6. power on ให้ ESXi generate NVRAM ใหม่
7. verify KEK อีกครั้ง

Expected:

- ก่อนแก้: KEK 2023 missing
- หลังแก้: KEK 2023 present

Remediation:

- ใช้ขั้นตอน rename/regenerate `.nvram`
- ต้องระวัง VM ที่มี vTPM/BitLocker/LUKS ให้เก็บ recovery key และ snapshot ก่อน

### TC-FW-04 — Invalid Platform Key blocks DB/DBX/KEK update

Purpose: ทดสอบกรณี PK invalid ทำให้ update Secure Boot database ไม่สำเร็จ

Prereq:

- VM บน ESXi 7.x/8.x/9.x ที่เปิด EFI + Secure Boot
- snapshot ก่อนทำ
- ถ้ามี BitLocker/LUKS ต้องมี recovery key

Detection:

Windows:

```powershell
$pk = Get-SecureBootUEFI -Name PK
$bytes = $pk.Bytes
$cert = $bytes[44..($bytes.Length-1)]
[IO.File]::WriteAllBytes("PK.der", $cert)
certutil -dump PK.der
```

ถ้า command fail เช่น `Cannot index into a null array` หรือ dump ได้ค่า `00` และ length ประมาณ 45 bytes ให้ถือว่า PK invalid

Linux:

```bash
mokutil --pk
```

ถ้าไม่มี output ให้สงสัยว่า PK ต้องแก้

Steps:

1. shutdown VM
2. take snapshot
3. attach FAT32 disk ขนาดประมาณ 128 MB ที่มี `WindowsOEMDevicesPK.der`
4. เพิ่ม advanced parameter:
   ```text
   uefi.allowAuthBypass = "TRUE"
   ```
5. ตั้ง VM ให้ Force EFI Setup
6. boot เข้า EFI setup
7. ไปที่ Secure Boot Configuration > PK Options > Enroll PK
8. เลือกไฟล์ `WindowsOEMDevicesPK.der`
9. commit changes และ shutdown/reboot
10. remove `uefi.allowAuthBypass`
11. detach disk
12. verify PK และ run Windows Secure Boot update อีกครั้ง

Expected:

- PK valid
- KEK/DB update สำเร็จ
- Windows event เปลี่ยนจาก 1801/1795/1796 ไปเป็น 1808 หลัง update สำเร็จ

Remediation:

- ถ้า fail ให้ restore snapshot แล้วตรวจว่า DER file ไม่เสีย, disk เป็น FAT32, และลบ bypass parameter หลังจบ

---

## 6) Test cases: Windows Server

### TC-WS-01 — Windows Server baseline happy path on ESXi 8.0.2+

OS to run:

- Windows Server 2025
- Windows Server 2022
- Windows Server 2019
- Windows Server 2016 ถ้ายังมีใช้

VM config:

- Firmware: EFI
- Secure Boot: ON
- VM compatibility: latest supported by ESXi 8.0.2+
- vTPM: OFF สำหรับ baseline แรก

Steps:

1. install OS และ patch ให้ล่าสุด
2. install VMware Tools
3. run evidence commands ก่อน update
4. opt-in และ trigger task:
   ```powershell
   reg add HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
   Start-ScheduledTask -TaskName "\Microsoft\Windows\PI\Secure-Boot-Update"
   ```
5. reboot
6. verify DB/KEK/Event log
7. reboot ซ้ำอีก 1 รอบ แล้ว verify อีกครั้ง

Expected:

- `Windows UEFI CA 2023 = True`
- `Microsoft Corporation KEK 2K CA 2023 = True`
- event log มี 1808 หรือ status บอก updated
- ค่าไม่หายหลัง reboot รอบที่ 2

Impact decision:

- ผ่าน: OS/version/config นี้ไม่โดน impact ใน lab baseline
- ไม่ผ่าน: โดน impact ต้องแยกต่อว่าเป็น PK invalid, missing KEK, firmware write error หรือ ESXi/NVRAM persistence

Remediation:

- ถ้า missing KEK จาก NVRAM เก่า ใช้ TC-FW-03
- ถ้า PK invalid ใช้ TC-FW-04
- ถ้า Event 1795 ให้ตรวจ firmware/virtual firmware/ESXi patch และ vendor/Broadcom guidance

### TC-WS-02 — Windows Server on ESXi 7.x

Purpose: วัดความเสี่ยง ESXi 7.x ว่า UEFI variable persist หลัง reboot หรือไม่

OS to run:

- อย่างน้อย Windows Server 2022 และ 2019
- เพิ่ม Server 2016 ถ้ามี production

VM config:

- Firmware: EFI
- Secure Boot: ON
- VM compatibility ตามที่ production ใช้จริงบน ESXi 7

Steps:

1. clone VM จาก template
2. run Windows update ให้ล่าสุด
3. run opt-in/task
4. reboot 2 รอบ
5. verify DB/KEK/Event log หลังแต่ละ reboot

Expected:

- ค่าที่ update แล้วต้องยังอยู่หลัง reboot

Failure pattern:

- task เหมือน run สำเร็จ แต่ reboot แล้ว CA 2023 หาย
- event 1801/1795/1796 วนซ้ำ

Remediation:

1. patch ESXi 7 เป็น latest build
2. ตรวจ datastore write/snapshot chain
3. update host BIOS/UEFI/BMC
4. migrate VM ไป ESXi 8.0.2+ แล้ว retest
5. ถ้ายัง fail ให้ตรวจ TC-FW-03 และ TC-FW-04

### TC-WS-03 — Windows Server with vTPM + BitLocker

Purpose: ทดสอบว่าการเปลี่ยน Secure Boot key ไม่ทำให้ VM boot ไม่ได้โดยไม่มี recovery key

OS to run:

- Windows Server 2022 หรือ 2025 เป็นตัวแทน
- เพิ่ม OS อื่นถ้า production ใช้ BitLocker บน server VM

VM config:

- EFI + Secure Boot ON
- vTPM ON
- BitLocker ON

Prereq:

- export BitLocker recovery key
- take snapshot
- มี console access

Steps:

1. verify BitLocker:
   ```powershell
   manage-bde -status
   manage-bde -protectors -get C:
   ```
2. run TC-WS-01
3. ถ้าต้องแก้ PK/NVRAM ให้ทำ TC-FW-03 หรือ TC-FW-04
4. reboot และดูว่าถาม recovery key หรือไม่

Expected:

- VM boot ได้
- ถ้าถาม recovery key ต้อง recover ได้และกลับมาปกติ

Remediation:

- suspend BitLocker ก่อนเปลี่ยน key ถ้า change window อนุญาต:
  ```powershell
  Suspend-BitLocker -MountPoint C: -RebootCount 2
  ```
- เก็บ recovery key ก่อนทุกครั้ง

### TC-WS-04 — Windows Server 2012/2012 R2 ESU vs non-ESU

Purpose: แยก legacy server ว่าจะ update ได้จริงหรือควรเป็น exception

VM config:

- EFI + Secure Boot ON

Test set:

- Server 2012/2012 R2 with ESU
- Server 2012/2012 R2 without ESU ถ้ายังมี production

Steps:

1. patch OS ให้ครบตาม entitlement
2. ตรวจว่ามี scheduled task และ registry path ที่เกี่ยวข้องหรือไม่
3. run opt-in/task ถ้ามี
4. verify DB/KEK/Event log

Expected:

- ESU: ควรเข้า update path ได้ตาม Microsoft support scope
- non-ESU: ไม่ควร assume ว่าจะได้ certificate update ครบ

Remediation:

- upgrade OS
- migrate workload ไป supported OS
- ถ้าย้ายไม่ได้ ให้จัดเป็น exception พร้อม risk acceptance และแผนปิด Secure Boot หรือ isolate ตาม policy

---

## 7) Test cases: Windows Client

### TC-WC-01 — Windows 11 baseline

OS to run:

- Windows 11 24H2
- เพิ่ม 23H2/22H2/21H2 ถ้ามี production

VM config:

- EFI + Secure Boot ON
- vTPM ON ถ้าต้อง match Windows 11 requirement

Steps:

1. install Windows 11 และ patch ล่าสุด
2. install VMware Tools
3. run evidence commands
4. opt-in/task
5. reboot 2 รอบ
6. verify DB/KEK/Event log

Expected:

- CA 2023 และ KEK 2023 present
- boot manager update สำเร็จหลัง reboot

Remediation:

- ใช้ TC-FW-03/TC-FW-04 ถ้า fail จาก NVRAM/PK
- ถ้า standalone ESXi ทำ vTPM ไม่ได้ ให้ใช้ vCenter-managed environment หรือทดสอบ Windows 10/Server แทน

### TC-WC-02 — Windows 10 22H2 / LTSC

OS to run:

- Windows 10 22H2 with supported servicing/ESU
- Windows 10 LTSC 2019
- Windows 10 LTSC 2021

VM config:

- EFI + Secure Boot ON

Steps:

1. patch OS ให้ล่าสุดตาม servicing channel
2. run opt-in/task
3. reboot 2 รอบ
4. verify CA 2023/KEK 2023/Event log

Expected:

- supported Windows 10/LTSC ต้อง update ได้

Remediation:

- ถ้า Windows 10 ไม่มี support/ESU ให้จัดเป็น upgrade/replace/exception
- ถ้า supported แต่ fail ให้ตรวจ NVRAM/PK/ESXi ตาม TC-FW-03/04

---

## 8) Test cases: Linux VM

### TC-LX-01 — Linux baseline Secure Boot boot chain

OS to run:

- RHEL 8/9/10 หรือ clone ที่ตรง production
- Ubuntu 22.04/24.04 LTS
- Oracle/Rocky/Alma/SLES ตามที่มีจริง

VM config:

- EFI + Secure Boot ON
- vTPM OFF สำหรับ baseline แรก

Steps:

1. install OS จาก supported ISO
2. update package ล่าสุดจาก official repo
3. verify:
   ```bash
   mokutil --sb-state
   mokutil --pk
   mokutil --kek
   mokutil --db
   mokutil --dbx
   ```
4. verify package:
   ```bash
   rpm -q shim grub2-efi-x64 grub2-tools kernel || true
   dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic || true
   ```
5. reboot 2 รอบ

Expected:

- `SecureBoot enabled`
- boot ได้หลัง update/reboot
- shim/grub/kernel มาจาก supported vendor repo

Impact decision:

- ถ้าใช้ unsupported distro หรือ pinned old shim/grub ให้ถือว่า high risk

Remediation:

- update shim/grub/kernel
- ถ้า boot fail ให้ disable Secure Boot ชั่วคราว, boot เข้า OS, update boot chain, แล้วเปิด Secure Boot ใหม่

### TC-LX-02 — Linux with old shim/GRUB simulation

Purpose: ทดสอบ recovery path เมื่อ Secure Boot validation fail

Prereq:

- clone Linux VM
- snapshot
- console access

Steps:

1. บันทึก shim/grub version ปัจจุบัน
2. ถ้ามี repo/package เก่าที่ปลอดภัยใน lab ให้ pin/downgrade เฉพาะใน clone
3. apply update/revocation test เฉพาะถ้ารู้ rollback path
4. reboot และดูว่าติด Secure Boot verification หรือไม่

Expected:

- ถ้า boot fail ต้อง recover ได้

Recovery:

1. ปิด Secure Boot ชั่วคราวใน VM settings
2. boot เข้า OS
3. update shim/grub/kernel จาก supported repo
4. เปิด Secure Boot กลับ
5. verify `mokutil --sb-state`

### TC-LX-03 — Linux with vTPM + LUKS

Purpose: ทดสอบผลกระทบกับ disk encryption ที่ผูกกับ TPM

Prereq:

- Linux VM ที่ใช้ vTPM
- LUKS/sealed secret ผูกกับ TPM PCRs
- recovery passphrase/key
- snapshot

Steps:

1. verify Secure Boot and TPM sealing config
2. run TC-LX-01
3. ถ้าต้องแก้ PK/NVRAM ให้ทำบน clone เท่านั้น
4. reboot และตรวจว่า unlock disk ได้หรือไม่

Expected:

- boot/unlock สำเร็จ หรือ recover ด้วย recovery key ได้

Remediation:

- unseal/reseal TPM policy หลังเปลี่ยน Secure Boot key
- เก็บ recovery key ก่อนเปลี่ยนทุกครั้ง

---

## 9) Final decision matrix

ใช้ตัดสินว่า VM โดน impact หรือไม่

| เงื่อนไข | Impact | Action |
|---|---|---|
| BIOS legacy | Not directly impacted by Secure Boot CA 2023 | จัดเป็น out of scope หรือ modernization plan |
| EFI + Secure Boot OFF | ไม่โดน boot enforcement แต่ไม่ compliant ถ้า policy ต้องเปิด | เปิด Secure Boot แล้ว test หรือทำ exception |
| EFI + Secure Boot ON, CA/KEK 2023 present, reboot 2 รอบแล้วยังอยู่ | Pass | rollout ได้ตาม change process |
| Windows event 1801 ต่อเนื่อง | Impacted | ตรวจ AvailableUpdates, KEK, PK, NVRAM |
| Windows event 1795 | Impacted | firmware/virtual firmware write error; patch ESXi/OEM firmware, ตรวจ PK |
| Windows event 1796 หรือ AvailableUpdates ค้างที่ KEK bit | Impacted | ตรวจ KEK และ PK; ใช้ TC-FW-04 |
| Missing KEK 2023 บน VM ที่ origin ก่อน ESXi 8.0.2 | Impacted | upgrade VM compatibility + regenerate NVRAM |
| PK invalid/null | Impacted | manual PK update |
| vTPM + BitLocker/LUKS | Operationally high risk | snapshot + recovery key + controlled change |
| Linux old shim/grub/SBAT | Impacted/high risk | update boot chain หรือ temporary disable Secure Boot เพื่อ recover |
| Unsupported OS | Impacted by support gap | upgrade/replace/exception |

---

## 10) Minimum test set ถ้าเวลาน้อย

ถ้าต้องทำ lab ให้เร็วที่สุด ให้ทำชุดนี้ก่อน:

1. Windows Server 2022 on ESXi 8.0.2+ with EFI + Secure Boot ON
2. Windows Server 2019 on ESXi 8.0.2+ with EFI + Secure Boot ON
3. Windows Server 2022 on ESXi 7.x with EFI + Secure Boot ON
4. VM created on ESXi < 8.0.2 แล้วนำมารันบน ESXi 8.0.2+ เพื่อตรวจ missing KEK 2023
5. Windows VM with invalid PK หรืออย่างน้อย run detection command เพื่อพิสูจน์ว่าไม่มี invalid PK
6. Windows VM with vTPM + BitLocker ถ้า production ใช้ encryption
7. Linux representative distro 1 ตัวต่อ family ที่ production ใช้ เช่น RHEL-family และ Ubuntu LTS

ถ้าทั้ง 7 ข้อผ่าน จึงค่อยขยายตาม OS/version ที่เหลือใน inventory

---

## 11) References

- Microsoft Secure Boot certificate updates guidance:
  - https://support.microsoft.com/en-us/topic/secure-boot-certificate-updates-guidance-for-it-professionals-and-organizations-e2b43f9f-b424-42df-bc6a-8476db65ab2f
- Microsoft KB5036210 - deploying Windows UEFI CA 2023:
  - https://support.microsoft.com/en-us/topic/kb5036210-deploying-windows-uefi-ca-2023-certificate-to-secure-boot-allowed-signature-database-db-a68a3eae-292b-4224-9490-299e303b450b
- Broadcom KB 423893 - Secure Boot certificate expirations and update failures in VMware VMs:
  - https://knowledge.broadcom.com/external/article/423893/secure-boot-certificate-expirations-and.html
- Broadcom KB 421593 - missing Microsoft Corporation KEK CA 2023 on Windows VMs in ESXi:
  - https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- Broadcom KB 423919 - manual update of Secure Boot Platform Key in VMs:
  - https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html
