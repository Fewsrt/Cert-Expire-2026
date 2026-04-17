# Final Compliance Check Runbook

## Document version
- Version: `v1.1`
- Updated: `2026-04-17`
- Change summary:
  - รวม test cases เดิม + UAT matrix ให้เป็นชุดเดียว
  - จัดกลุ่ม scenario ใหม่ตาม `Core checks` และ `Combination checks (Firmware/OS/ESXi)`
  - ลดหัวข้อซ้ำและทำให้ใช้เป็น execution sheet ได้ทันที

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

## Unified test matrix (v1.1)
> ตารางนี้เป็นชุดทดสอบหลักชุดเดียว (รวมข้อที่ซ้ำแล้ว) ใช้ได้ทั้ง SIT/UAT และ final sign-off

### A) Core checks (ต้องผ่านทุก wave)
| Test Case ID | Scenario | OS | Environment | Priority | Owner | Test Data/Setup | Expected Result | Pass/Fail | Evidence Link | Remark |
|---|---|---|---|---|---|---|---|---|---|---|
| CORE-01 | Inventory and scope readiness | Windows/Linux | BareMetal/VMwareVM | Critical |  | ระบุเครื่องเป้าหมาย + UEFI + Secure Boot + OS type | Inventory ครบและพร้อมเริ่ม rollout |  |  |  |
| CORE-02 | Platform readiness check | Windows/Linux | VMwareVM | Critical |  | ตรวจ ESXi build, VM compatibility, datastore/snapshot health | ไม่พบ blocker ด้าน platform |  |  |  |
| CORE-03 | Windows CA2023 verification | Windows | BareMetal/VMwareVM | Critical |  | รัน verify command หลัง update | `SecureBoot=True`, พบ CA2023, `UEFICA2023Status` expected |  |  |  |
| CORE-04 | Linux Secure Boot and boot-chain verification | Linux | BareMetal/VMwareVM | Critical |  | ตรวจ `mokutil` + `shim/grub` package state | Secure Boot enabled, boot-chain current จาก supported repo |  |  |  |
| CORE-05 | Reboot stability >= 2 rounds | Windows/Linux | BareMetal/VMwareVM | Critical |  | Warm reboot/cold reboot อย่างน้อย 2 รอบ | ผล verify คงที่ ไม่เกิด drift |  |  |  |
| CORE-06 | Classification and evidence quality | Windows/Linux | BareMetal/VMwareVM | Critical |  | จัดสถานะ + แนบหลักฐาน | Map สถานะถูกต้อง + หลักฐานครบ audit |  |  |  |

### B) Combination checks (Firmware / OS / ESXi)
| Test Case ID | Scenario | OS | Environment | Priority | Owner | Test Data/Setup | Expected Result | Pass/Fail | Evidence Link | Remark |
|---|---|---|---|---|---|---|---|---|---|---|
| COMBO-PHY-01 | Physical firmware old + OS old | Windows | BareMetal | High |  | BIOS/UEFI เก่า + Windows รุ่นเก่าใน scope | ผ่านได้เมื่อ remediation ครบ หรือระบุเป็น exception ชัดเจน |  |  |  |
| COMBO-PHY-02 | Physical firmware old + OS old | Linux | BareMetal | High |  | firmware เก่า + Linux boot-chain เก่า | หาก fail ต้องเข้ากระบวนการ recovery path |  |  |  |
| COMBO-PHY-03 | Physical firmware new + OS old | Windows/Linux | BareMetal | High |  | firmware ใหม่ + OS เก่า | ต้องผ่าน verify และ reboot stability |  |  |  |
| COMBO-PHY-04 | Physical firmware old + OS new | Windows/Linux | BareMetal | High |  | firmware เก่า + OS ใหม่ | ต้องพิสูจน์ว่า firmware ไม่ทำให้ verify drift |  |  |  |
| COMBO-PHY-05 | Physical firmware new + OS new (golden path) | Windows/Linux | BareMetal | Critical |  | baseline ใหม่ทั้งหมด | ควรผ่านครบและใช้เป็น benchmark |  |  |  |
| COMBO-VM-01 | VM on ESXi 7 | Windows/Linux | VMwareVM | Critical |  | VM EFI + Secure Boot บน ESXi 7 | ผ่านได้แต่ต้องเน้นตรวจ persistence |  |  |  |
| COMBO-VM-02 | VM on ESXi 8 | Windows/Linux | VMwareVM | Critical |  | VM EFI + Secure Boot บน ESXi 8 | ควรเสถียรกว่า ESXi 7 และผ่าน verify ซ้ำ |  |  |  |
| COMBO-VM-03 | VM created on ESXi 7 then host upgraded to ESXi 8 | Windows/Linux | VMwareVM | Critical |  | VM legacy ย้ายมา host ใหม่ | ต้องไม่เกิด legacy NVRAM drift หลัง reboot |  |  |  |
| COMBO-VM-04 | Create template on ESXi 8.0.3 then deploy on ESXi 7 | Windows/Linux | VMwareVM | High |  | Template crossover 8.0.3 -> 7 | ต้องผ่าน compatibility + verify + reboot stability |  |  |  |

### C) Risk and negative checks
| Test Case ID | Scenario | OS | Environment | Priority | Owner | Test Data/Setup | Expected Result | Pass/Fail | Evidence Link | Remark |
|---|---|---|---|---|---|---|---|---|---|---|
| RISK-01 | NVRAM persistence test | Windows/Linux | VMwareVM | Critical |  | ทดสอบ warm/cold reboot ต่อเนื่อง | ค่า Secure Boot-related state ไม่หาย |  |  |  |
| RISK-02 | Revert snapshot then check old CA/state rollback | Windows/Linux | VMwareVM | Critical |  | Snapshot ก่อน rollout แล้ว revert | ตรวจพบ rollback ได้ และจัดสถานะตรงจริง |  |  |  |
| RISK-03 | Disable Secure Boot intentionally | Windows/Linux | BareMetal/VMwareVM | Critical |  | ปิด Secure Boot แล้วรัน validation | ต้องถูกจัด `NON_COMPLIANT` ทันที |  |  |  |
| RISK-04 | Missing telemetry / incomplete evidence | Windows/Linux | BareMetal/VMwareVM | High |  | ตัดข้อมูลบางส่วนหรือหลักฐานไม่ครบ | ต้องถูกจัด `UNKNOWN` จนกว่าจะเก็บข้อมูลครบ |  |  |  |

## Exit gate (minimum pass criteria) - v1.1
- Windows: `Confirm-SecureBootUEFI=True` + พบ CA2023 ใน `db` + `UEFICA2023Status` expected + ผ่านหลัง reboot >= 2 รอบ
- Linux: Secure Boot enabled + boot-chain current จาก supported repo + reboot >= 2 รอบแล้วเสถียร
- VMware: ไม่เกิด UEFI/NVRAM persistence drift หลัง reboot หรือหลัง host/version crossover
- เอกสาร: มี evidence ครบ, final CSV ครบทุกคอลัมน์, และมี owner/remediation สำหรับทุก exception

## Execution notes
- ทุก test case ต้องเก็บผลอย่างน้อย 3 จุด: ก่อนทำ, หลังทำ, หลัง reboot cycle
- ถ้าเคสล้มเหลว ให้ map เข้า remediation path ที่ระบุใน runbook และ re-test ด้วย Test Case ID เดิม
- หากเปลี่ยนเงื่อนไขทดสอบ ให้สร้างเป็นเวอร์ชันใหม่ (`v1.2`, `v1.3`) และบันทึก change summary ด้านบนเสมอ
