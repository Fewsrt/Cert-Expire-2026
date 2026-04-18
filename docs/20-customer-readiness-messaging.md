# ข้อความถึงลูกค้า: ความพร้อม vs การันตี

## ขอบเขตของรายงาน

- ผลจาก Ansible/Firestore คือ **ภาพความพร้อมและแนวทางลดความเสี่ยง** ต่อนโยบาย Secure Boot / Microsoft UEFI CA 2023 ตามที่สแกนวัดได้บน VM
- **ไม่ใช่การันตี** ว่าหลัง reboot, หลัง milestone ใด (เช่น กลางปี), หรือหลังการเปลี่ยน revocation (dbx) ระบบจะบูตได้หรือไม่ — ข้อนั้นต้องอ้างแผน rollout ของ Microsoft / OEM / VMware และการทดสอบขององค์กร

## นิยามระดับลูกค้า (readiness tier)

| Tier | ความหมายโดยย่อ |
|------|------------------|
| **not_impacted** | ความเสี่ยงต่ำตามเกณฑ์อัตโนมัติ — มักสอดคล้อง `PASS_OR_LOW_RISK` |
| **needs_review** | ต้องเก็บหลักฐานเพิ่ม แก้การเชื่อมต่อ หรือรันใหม่ — เช่น `NEEDS_EVIDENCE`, `CONNECTIVITY_FAILED`, ข้อยกเว้นสคริปต์ |
| **action_required** | ต้องดำเนินการตาม remediation ที่สรุปในรายงาน (patch, อัปเดต shim/GRUB, Secure Boot update บน Windows ฯลฯ) |

ระดับ **case** = ระดับที่ “แย่ที่สุด” ในบรรดา VM ที่ map เข้า test case นั้น

## แหล่งข้อมูล ESXi / hypervisor

- ค่า **`esxi_generation_hint`** ใน `readinessV1` อาจอิงชื่อ host ในแล็บ (เช่น `esx7` / `esx8`) หรือฟิลด์ inventory ในอนาคต
- ใน **production** ควรมีคอลัมน์ใน inventory CSV หรือข้อมูลจาก vCenter ที่บอกรุ่น/นโยบายชัด — **ห้ามอ้างการย้าย host ลอยๆ โดยไม่มีข้อมูลอ้างอิง**

## การอ้างอิง “ย้ายไป ESXi 8”

ข้อความแนะนำใน `readinessV1.hosts[].nextSteps` อาจกล่าวถึง **แผน hypervisor ตามนโยบายองค์กร** เมื่อพบช่องว่าง firmware/policy ร่วมกับ hint รุ่นเก่า — เป็น **คำแนะนำเชิงแผน** ไม่ใช่คำสั่งอัตโนมัติจากเครื่องมือ
