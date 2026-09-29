// ============================================================
//  ตั้งค่าระบบ — แก้ไฟล์นี้ไฟล์เดียวตอนติดตั้ง
// ============================================================

// 1) Firebase Console → Project settings → Your apps → Web app → SDK config
export const FIREBASE_CONFIG = {
  apiKey:            'PASTE_API_KEY',
  authDomain:        'PASTE_PROJECT.firebaseapp.com',
  projectId:         'PASTE_PROJECT',
  storageBucket:     'PASTE_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId:             'PASTE_APP_ID'
};

// 2) Cloudinary (ใช้บัญชีเดิม) — preset ต้องเป็นแบบ Unsigned
export const CLOUDINARY = {
  cloud:  'dgu19z5ay',
  preset: 'gkb2026',
  root:   'gkm'          // รูปจะอยู่ใน gkm/<รหัสงาน>/slips, /sponsors, /images
};

// 3) งานที่เปิดเมื่อไม่ได้ระบุ ?e=... ใน URL (ตั้งจากหน้า Admin ได้ด้วย ปุ่ม "ตั้งเป็นงานหลัก")
export const FALLBACK_EVENT_ID = 'buriram-2026';
