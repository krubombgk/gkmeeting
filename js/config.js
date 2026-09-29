// ============================================================
//  ตั้งค่าระบบ — แก้ไฟล์นี้ไฟล์เดียวตอนติดตั้ง
// ============================================================

// 1) Firebase Console → Project settings → Your apps → Web app → SDK config
export   const firebaseConfig = {
    apiKey: "AIzaSyDoMrtN5t7uVh5IHzrec7GquxBKXDYL_S4",
    authDomain: "gk-meeting-b50b2.firebaseapp.com",
    projectId: "gk-meeting-b50b2",
    storageBucket: "gk-meeting-b50b2.firebasestorage.app",
    messagingSenderId: "1076293913965",
    appId: "1:1076293913965:web:8c57e6f7fd135599f61e64"
  };

// 2) Cloudinary (ใช้บัญชีเดิม) — preset ต้องเป็นแบบ Unsigned
export const CLOUDINARY = {
  cloud:  'dgu19z5ay',
  preset: 'gkb2026',
  root:   'gkm'          // รูปจะอยู่ใน gkm/<รหัสงาน>/slips, /sponsors, /images
};

// 3) งานที่เปิดเมื่อไม่ได้ระบุ ?e=... ใน URL (ตั้งจากหน้า Admin ได้ด้วย ปุ่ม "ตั้งเป็นงานหลัก")
export const FALLBACK_EVENT_ID = 'buriram-2026';
