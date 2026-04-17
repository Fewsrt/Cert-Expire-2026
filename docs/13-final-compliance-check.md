# Final Compliance Check Runbook

## Purpose
- Provide a final method to decide which machines are `COMPLIANT` / `NON_COMPLIANT` / `UNKNOWN`.
- Use this after rollout and remediation steps are complete.

## Output format
- One CSV report per wave/change window.
- Required columns:
  - AssetName
  - EnvironmentType (`BareMetal` / `VMwareVM`)
  - OSType (`Windows` / `Linux`)
  - SecureBootEnabled
  - CA2023Present
  - UEFICA2023Status
  - BootChainPackageStatus
  - RebootStabilityCheck
  - FinalStatus (`COMPLIANT` / `NON_COMPLIANT` / `UNKNOWN`)
  - Notes

## Final decision criteria
### COMPLIANT
- Windows:
  - `Confirm-SecureBootUEFI` = `True`
  - CA 2023 exists in Secure Boot `db`
  - `UEFICA2023Status` is expected
  - Verification remains valid after at least 2 reboots
- Linux:
  - Secure Boot enabled and boots successfully
  - Signed boot chain is current from supported vendor repo
  - Reboot verification is stable (at least 2 reboots)

### NON_COMPLIANT
- Any required check fails (Secure Boot disabled unexpectedly, CA2023 missing, status invalid, boot failure, unstable post-reboot results)

### UNKNOWN
- Missing telemetry, inaccessible guest, missing VMware Tools/agent data, or incomplete evidence

## Step-by-step execution
1. Export inventory baseline (VM/host/firmware/secure boot metadata)
2. Run guest verification by OS:
   - Windows: Secure Boot + CA2023 + `UEFICA2023Status`
   - Linux: `mokutil`, installed boot-chain packages, reboot result
3. Repeat verification after reboot cycle (minimum 2 reboots for target systems)
4. Classify each machine with final status
5. Attach evidence (command outputs / screenshots / event logs)
6. Publish final CSV and sign-off summary

## Suggested evidence commands
### Windows
```powershell
Confirm-SecureBootUEFI
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023"
Get-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing -Name UEFICA2023Status
```

### Linux
```bash
mokutil --sb-state
mokutil --list-enrolled
# Debian/Ubuntu:
dpkg -l shim-signed shim grub-efi-amd64-signed
# RHEL-family:
rpm -q shim grub2
```

## VMware-specific failure handling before final status
1. If Windows verify fails, check KB patterns first:
   - KB 421593: legacy NVRAM (`*.nvram`) regeneration path
   - KB 423919: invalid PK / manual PK update path
2. Re-check ESXi patch level, datastore health, snapshot chain, and host firmware
3. Re-run validation after remediation and reboot

## Sign-off package (minimum)
- Final CSV report
- Exceptions list (owner + target date + mitigation)
- Change window summary
- Verification samples for each OS/environment type

## Test cases (TH) - สิ่งที่ต้องเทส

### 1) Pre-check / Inventory
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-01 | ตรวจ scope เครื่องเป้าหมาย | แยก `VMwareVM`/`BareMetal`, OS, UEFI, Secure Boot | มีรายการเครื่องครบและระบุสถานะพื้นฐานชัดเจน |
| TC-02 | ตรวจความพร้อมแพลตฟอร์ม | ตรวจ ESXi build, VM compatibility, datastore/snapshot health | ไม่พบ blocker ก่อน rollout |

### 2) Windows rollout + verification
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-03 | Opt-in สำเร็จ | ตั้ง `MicrosoftUpdateManagedOptIn=1` | ค่า registry ถูกต้อง |
| TC-04 | Trigger task สำเร็จ | รัน `\Microsoft\Windows\PI\Secure-Boot-Update` | Task สำเร็จ ไม่มี error สำคัญ |
| TC-05 | Verify CA 2023 | ตรวจ `Confirm-SecureBootUEFI`, ค้นหา CA2023 ใน `db`, ตรวจ `UEFICA2023Status` | `SecureBoot=True`, พบ CA2023, status เป็นค่าที่คาดหวัง |
| TC-06 | Reboot stability (Windows) | Reboot อย่างน้อย 2 รอบและ verify ซ้ำ | ผล verify คงที่ ไม่เกิด drift |

### 3) Linux verification
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-07 | Secure Boot state | รัน `mokutil --sb-state` | แสดง enabled ตาม policy |
| TC-08 | Boot-chain package status | ตรวจ `shim/grub` ด้วย `dpkg` หรือ `rpm` | ได้แพ็กเกจจากช่องทางที่ยัง support และไม่ใช่ชุดเก่าเสี่ยง |
| TC-09 | Reboot stability (Linux) | Reboot อย่างน้อย 2 รอบ | บูตผ่านต่อเนื่อง ไม่มี failure จาก SBAT/dbx |

### 4) VMware-specific risk cases
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-10 | NVRAM persistence | Verify ซ้ำหลัง reboot | ค่า UEFI variable ไม่หายหลัง reboot |
| TC-11 | KB 421593 pattern | ทำ remediation ตาม path แล้ว verify ใหม่ | กลับมาผ่าน compliance ได้ |
| TC-12 | KB 423919 pattern | ทำ manual PK update ตาม change control แล้ว verify | อัปเดตสำเร็จและบูตได้เสถียร |

### 5) Negative / failure / recovery
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-13 | Missing telemetry | จำลองเครื่องที่ไม่มี agent/tool data | จัดสถานะเป็น `UNKNOWN` |
| TC-14 | Secure Boot disabled unexpectedly | พบเครื่องที่ Secure Boot ถูกปิด | จัดเป็น `NON_COMPLIANT` และเข้าสู่ remediation |
| TC-15 | Linux recovery path | จำลอง boot failure แล้วทำ recovery runbook | กู้ระบบกลับมาและเปิด Secure Boot ได้ |

### 6) Compliance output / audit readiness
| Test Case ID | รายการทดสอบ | วิธีทดสอบย่อ | Expected Result |
|---|---|---|---|
| TC-16 | Final classification | ตรวจการ map `COMPLIANT/NON_COMPLIANT/UNKNOWN` | จัดสถานะถูกต้องตามเกณฑ์ |
| TC-17 | Evidence completeness | ตรวจ command output, screenshot, event log, reboot proof | หลักฐานครบพร้อม audit |
| TC-18 | CSV report quality | ตรวจคอลัมน์ required fields ครบ | ใช้ sign-off ได้ทันที |

## Exit gate (minimum pass criteria)
- Windows: `Confirm-SecureBootUEFI=True` + พบ CA2023 ใน `db` + `UEFICA2023Status` expected + ผ่านหลัง reboot >= 2 รอบ
- Linux: Secure Boot enabled + boot-chain current จาก supported repo + reboot >= 2 รอบแล้วเสถียร
- VMware: ไม่เกิด UEFI/NVRAM persistence drift หลัง reboot
- เอกสาร: มี evidence ครบ และ final CSV พร้อม sign-off
