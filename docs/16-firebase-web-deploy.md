# Firebase Web App Deploy

เอกสารนี้ใช้ deploy เว็บ `VM CA 2023 Tracker` ที่อยู่ใน folder `public/`

เว็บนี้ใช้:

- Firebase Hosting สำหรับหน้าเว็บ
- Cloud Firestore สำหรับเก็บผล test
- Firestore rules สำหรับควบคุมการอ่าน/เขียน collection ผล test
- ไม่ใช้ Firebase Authentication เพื่อให้ใช้งานได้บน Spark/no billing

---

## 1. เตรียม Firebase project

1. สร้าง Firebase project
2. เปิด Firestore Database
3. เลือก region ตาม policy ขององค์กร

---

## 2. ใส่ Firebase config

แก้ไฟล์นี้:

```text
public/firebase-config.js
```

ตัวอย่าง:

```js
window.FIREBASE_CONFIG = {
  projectId: "your-project"
};
```

หมายเหตุ:

- Firebase web config ไม่ใช่ secret แต่เป็น project-specific config
- ถ้ายังไม่ได้ใส่ config จริง เว็บยังเปิดได้ แต่จะเก็บข้อมูลใน local browser เท่านั้น

---

## 3. Deploy rules และ hosting

Login:

```sh
npx firebase-tools login
```

Deploy โดยระบุ project:

```sh
npx firebase-tools deploy --project <firebase-project-id>
```

หรือ deploy แยก:

```sh
npx firebase-tools deploy --only firestore:rules --project <firebase-project-id>
npx firebase-tools deploy --only hosting --project <firebase-project-id>
```

Project ที่ใช้ตอน setup ครั้งแรก:

```text
cert-expire-2026-ca
```

Hosting URL:

```text
https://cert-expire-2026-ca.web.app
```

---

## 4. Firestore collection

เว็บจะเก็บข้อมูลไว้ที่ collection:

```text
vmCa2023Results
```

Document ID จะตรงกับ test ID เช่น:

```text
1.1
3.2
4.2
```

Field สำคัญ:

| Field | ความหมาย |
|---|---|
| `status` | `pending`, `in-progress`, `pass`, `fail`, `exception` |
| `vmName` | ชื่อ VM ที่ใช้ทดสอบ |
| `esxiBuild` | ESXi version/build |
| `beforeCa` | CA 2023 ก่อน test |
| `beforeKek` | KEK 2023 ก่อน test |
| `afterCa` | CA 2023 หลัง test |
| `afterKek` | KEK 2023 หลัง test |
| `events` | Windows event ID ที่เจอ |
| `impact` | `yes` หรือ `no` |
| `rootCause` | สาเหตุ เช่น missing KEK, PK invalid, NVRAM persistence |
| `actualRemediation` | วิธีแก้ที่ใช้จริง |
| `notes` | evidence หรือ note เพิ่มเติม |

---

## 5. Security note

`firestore.rules` ตอนนี้อนุญาต read/write เฉพาะ collection `vmCa2023Results` เพื่อให้เว็บใช้งานได้ทันทีโดยไม่ต้องตั้ง Auth provider ก่อน

ตอนนี้ตั้งใจเปิดให้ใครก็ได้ที่มี URL อ่าน/เขียนข้อมูล test ได้ โดยไม่ต้องเปิด Billing หรือ Authentication

ถ้าต้องการจำกัดให้เฉพาะทีมจริงในอนาคต ควรเปลี่ยนเป็น Google/Microsoft SSO หรือ Anonymous Auth แล้วปรับ rules ให้ตรวจ `request.auth`, email/domain หรือ custom claims
