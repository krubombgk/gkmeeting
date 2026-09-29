# Goalkeeper Meeting — ระบบสมัครร่วมงาน (Firebase + GitHub Pages)

ระบบสมัครร่วมงานและสั่งเสื้อ ใช้ได้หลายงาน (Bangkok, Buriram, งานถัดไป) จากโค้ดชุดเดียว

- `index.html` — หน้าเว็บสำหรับผู้สมัคร
- `admin.html` — หน้า Admin (ล็อกอินด้วย Gmail)
- `js/config.js` — **ไฟล์เดียวที่ต้องแก้ตอนติดตั้ง**
- `firestore.rules` — กฎความปลอดภัย (วางใน Firebase Console)

---

## ติดตั้งครั้งแรก (ประมาณ 20 นาที)

### 1. สร้างโปรเจกต์ Firebase
1. เข้า https://console.firebase.google.com → **Add project** → ตั้งชื่อ เช่น `gk-meeting` (ไม่ต้องเปิด Analytics)
2. เมนู **Build → Firestore Database** → **Create database** → เลือก location `asia-southeast1 (Singapore)` → เลือก **Production mode**
3. แท็บ **Rules** → ลบของเดิม วางเนื้อหาจากไฟล์ `firestore.rules` ทั้งหมด → **Publish**
4. เมนู **Build → Authentication** → **Get started** → **Google** → เปิด Enable → ใส่อีเมลครู → **Save**
5. ⚙️ **Project settings** → เลื่อนลงไปที่ **Your apps** → กดไอคอน `</>` (Web) → ตั้งชื่อ → **Register app**
   → จะเห็น `firebaseConfig = { ... }` ให้คัดลอกค่าไปวางใน `js/config.js`

### 2. ใส่ตัวเองเป็น Admin คนแรก
Firestore Database → **Start collection**
- Collection ID: `admins`
- Document ID: **อีเมล Gmail ของครู** (ตัวพิมพ์เล็กทั้งหมด)
- Field: `role` (string) = `owner` → Save

(ทีมงานคนอื่นเพิ่มจากหน้า Admin แท็บ "ทีมงาน" ได้เลย ไม่ต้องเข้า Console)

### 3. ขึ้น GitHub Pages
1. สร้าง repository ใหม่ใน GitHub เช่น `gk-meeting` (Public)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ (ลากวางในหน้า **Add file → Upload files** ได้)
3. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `(root)` → Save
4. รอ 1–2 นาที จะได้ลิงก์ `https://<username>.github.io/gk-meeting/`

### 4. อนุญาตโดเมนให้ล็อกอิน Google ได้
Firebase → **Authentication → Settings → Authorized domains** → **Add domain** → `<username>.github.io`

### 5. สร้างงาน
เปิด `https://<username>.github.io/gk-meeting/admin.html` → ล็อกอิน → ระบบจะให้สร้างงานแรก
→ ไปแท็บ **ตั้งค่างาน** ใส่วันที่ สถานที่ QR ฯลฯ → บันทึก → กลับไป **ภาพรวม** กด **เปิดรับสมัคร**

---

## Cloudinary (เก็บรูปสลิป / โลโก้)
ใช้บัญชีเดิม (`dgu19z5ay`, preset `gkb2026`) ตั้งไว้ใน `js/config.js`
preset ต้องเป็นแบบ **Unsigned** (Cloudinary → Settings → Upload → Upload presets)
รูปจะถูกเก็บแยกโฟลเดอร์ `gkm/<รหัสงาน>/slips`, `sponsors`, `images`

## จัดงานใหม่
หน้า Admin → เมนูเลือกงานด้านบน → **+ สร้างงานใหม่** → ติ๊ก "คัดลอกการตั้งค่า"
→ แก้ข้อมูล → ในแท็บภาพรวมกด **★ ตั้งเป็นงานหลัก** (ลิงก์หลักจะเปิดงานนี้)
งานเก่ายังเปิดดูได้ที่ `?e=<รหัสงาน>` และข้อมูลไม่หาย

## โครงสร้างข้อมูล (Firestore)
```
admins/{email}                      ทีมงาน
site/config                         { activeEvent }
events/{eid}                        ตั้งค่างาน (ชื่อ ราคา โควตา เสื้อ ฯลฯ)
events/{eid}/meta/counters          ตัวนับที่นั่ง + เลขที่ล่าสุด
events/{eid}/registrations/{id}     ผู้สมัคร
events/{eid}/shirtOrders/{id}       สั่งเสื้ออย่างเดียว
events/{eid}/sponsors/{id}          ผู้สนับสนุน
events/{eid}/names/{nameKey}        กันชื่อซ้ำ
events/{eid}/lookup/{hash}          เบอร์โทร (เข้ารหัส) → รายการของเบอร์นั้น
```

## ความปลอดภัยโดยย่อ
- ผู้สมัครทั่วไปอ่านรายชื่อทั้งหมดไม่ได้ ดูได้เฉพาะรายการของเบอร์โทรที่ตัวเองกรอก
- เบอร์โทรในตารางค้นหาถูกเข้ารหัส (SHA-256)
- ผู้สมัครแก้ได้แค่ "แนบสลิป" ของตัวเอง เปลี่ยนสถานะเป็นยืนยันเองไม่ได้
- ที่นั่งถูกนับด้วย transaction — สมัครพร้อมกันก็ไม่เกินโควตา
- หน้า Admin เข้าได้เฉพาะอีเมลที่อยู่ใน `admins`

## ค่าใช้จ่าย
แพ็กเกจฟรี (Spark) ของ Firebase พอสำหรับงานขนาดนี้สบายๆ
(อ่านได้ 50,000 ครั้ง/วัน, เขียน 20,000 ครั้ง/วัน) ไม่ต้องผูกบัตร
