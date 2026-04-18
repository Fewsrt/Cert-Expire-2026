# Workflow: dev ↔ Ansible controller (Git)

ขั้นตอนนี้ใช้ **Git เป็นช่องทางหลัก** ระหว่างเครื่อง dev กับ controller (เช่น `root-215`) — ไม่ใช้ `scp`/`rsync` เป็นช่องทางหลักสำหรับโค้ดหรือ snapshot รายงานที่ตกลงจะ commit

## 1) อัปเดตโค้ด / playbook

บน **dev**

```bash
git add -A && git commit -m "..." && git push origin main
```

บน **controller** (ภายใต้ clone เดียวกัน เช่น `/root/Cert-Expire-2026`)

```bash
cd /root/Cert-Expire-2026 && git pull
```

## 2) รันการประเมิน (ข้อมูลจริงอยู่ที่ controller)

```bash
cd /root/Cert-Expire-2026/ansible
set -a && [ -f playbooks/.env ] && . playbooks/.env
set +a
export VCENTER_CSV="${VCENTER_CSV:-/path/to/inventory.csv}"
ansible-playbook -i inventory/vcenter_csv_inventory.py playbooks/secureboot_ca_assessment.yml
```

ผลลัพธ์หลัก: `ansible/reports/secureboot_ca_assessment.json` (และ CSV ถ้าต้องการ — ไฟล์ CSV อื่นยังถูก ignore ตาม `.gitignore`)

## 3) Commit snapshot รายงานที่อนุญาตผ่าน Git

ไฟล์ที่ **อนุญาตให้ track** ตาม `.gitignore` ปัจจุบัน:

- `ansible/reports/secureboot_ca_assessment.json`
- `ansible/reports/inventory-host-to-case-id.json`

บน controller หลังรัน:

```bash
cd /root/Cert-Expire-2026
git add ansible/reports/secureboot_ca_assessment.json
# ถ้าแก้ mapping: git add ansible/reports/inventory-host-to-case-id.json
git status   # ตรวจว่าไม่มี secret / ข้อมูลที่ห้ามออกนอกองค์กร
git commit -m "chore(reports): secureboot_ca_assessment snapshot"
git push origin main
```

**Checklist ก่อน push:** ไม่มีรหัสผ่าน, key, หรือข้อมูลลับใน diff; ยอมรับได้หรือไม่หากมี hostname/IP ของลูกค้า

## 4) เปิด UI

เปิด `public/index.html` หรือหน้าเว็บที่ deploy ไว้
