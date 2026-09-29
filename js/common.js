// ฟังก์ชันที่หน้าเว็บและหน้า Admin ใช้ร่วมกัน
import { db, doc, collection } from './fb.js';
import { CLOUDINARY } from './config.js';

// ── ค่าเริ่มต้นของงานใหม่ ─────────────────────────────
export const DEFAULT_EVENT = {
  name: 'Goalkeeper Meeting Buriram 2026',
  titleLine1: 'Goalkeeper Meeting',
  titleLine2: 'Buriram 2026',
  dateText: '',
  timeText: '08:00–13:00 น.',
  venue: '',
  venueShort: '',
  organizer: 'GK United Thailand',
  quota: 32,
  registrationOpen: false,
  shirtOrderOpen: false,
  youthAge: 15,
  slipHours: 24,
  maxPerPhone: 5,
  entryFee: 390,
  shirtPrice: 300,
  surcharge: 50,
  surchargeSizes: ['4XL', '5XL', 'อื่นๆ'],
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'อื่นๆ'],
  shirts: [
    { name: 'Black x Gold',   desc: 'สีดำ x ทอง',      c1: '#111111', c2: '#C9A84C', img: '' },
    { name: 'Navy x Silver',  desc: 'สีกรมท่า x เงิน',  c1: '#1a2a4a', c2: '#A8B8C8', img: '' },
    { name: 'Green x Bronze', desc: 'สีเขียว x ทองแดง', c1: '#1a4a2a', c2: '#8B6340', img: '' }
  ],
  shirtRounds: [
    { label: 'รอบ 1', orderBy: 'สั่งภายใน ...', receive: 'รับในงาน' },
    { label: 'รอบ 2', orderBy: 'สั่งภายใน ...', receive: 'ได้รับภายใน ...' }
  ],
  schedule: [
    '⏰ **รับสมัครร่วมงาน** — ภายใน ... (รับ 32 คนเท่านั้น)',
    '👕 **สั่งเสื้อรอบที่ 1** — ภายใน ...',
    '📌 **กรุณาแนบสลิปภายใน 24 ชั่วโมง หากเกินเวลาจะต้องขออนุญาตให้คิวสำรองได้สิทธิ์แทนครับ**'
  ],
  bankName: 'KBank',
  bankAccount: '005-3-68238-3 นายฐาปกรณ์ กัลยาประสิทธิ์',
  qrImg: '',
  sizeChartImg: '',
  logoUrl: 'https://lh3.googleusercontent.com/d/1Z96bAGKaRvvy0DM6qY-rCrROMQdBC0J9',
  modeImgCompete: '',
  modeImgShirt: '',
  announceImgs: [],
  lineLink: '',
  linePassword: '',
  lineQrUrl: '',
  idPrefix: 'GKBR',
  shirtIdPrefix: 'SHIRTBR'
};

export const NEW_COUNTERS = { regSeq: 0, shirtSeq: 0, pending: 0, confirmed: 0, reserve: 0, lastRegId: '', lastShirtId: '' };

// ── path ของข้อมูลใน Firestore ───────────────────────
export const ref = {
  site:      ()        => doc(db, 'site', 'config'),
  event:     eid       => doc(db, 'events', eid),
  events:    ()        => collection(db, 'events'),
  counters:  eid       => doc(db, 'events', eid, 'meta', 'counters'),
  regs:      eid       => collection(db, 'events', eid, 'registrations'),
  reg:       (eid, id) => doc(db, 'events', eid, 'registrations', id),
  shirts:    eid       => collection(db, 'events', eid, 'shirtOrders'),
  shirt:     (eid, id) => doc(db, 'events', eid, 'shirtOrders', id),
  name:      (eid, k)  => doc(db, 'events', eid, 'names', k),
  lookup:    (eid, h)  => doc(db, 'events', eid, 'lookup', h),
  sponsors:  eid       => collection(db, 'events', eid, 'sponsors'),
  sponsor:   (eid, id) => doc(db, 'events', eid, 'sponsors', id),
  admin:     email     => doc(db, 'admins', email),
  admins:    ()        => collection(db, 'admins')
};

// ── สถานะ ───────────────────────────────────────────
export const STATUS = {
  pending:   { label: 'รอแนบสลิป',  badge: 'badge-wait' },
  slip:      { label: 'แนบสลิปแล้ว', badge: 'badge-slip' },
  confirmed: { label: 'ยืนยันแล้ว',  badge: 'badge-ok' },
  reserve:   { label: 'ตัวสำรอง',    badge: 'badge-reserve' },
  cancelled: { label: 'ยกเลิก',      badge: 'badge-cancel' }
};
export const HOLDS_SEAT = s => s === 'pending' || s === 'slip' || s === 'confirmed';
// สถานะ → ช่องใน counters
export const counterKey = s => (s === 'pending' || s === 'slip') ? 'pending' : (s === 'confirmed' ? 'confirmed' : (s === 'reserve' ? 'reserve' : null));

// ── ราคา ─────────────────────────────────────────────
export const sizeSurcharge = (ev, sz) => (ev.surchargeSizes || []).includes(sz) ? Number(ev.surcharge) || 0 : 0;
export const shirtPrice    = (ev, sz) => (Number(ev.shirtPrice) || 0) + sizeSurcharge(ev, sz);
export const shirtNameOf   = (ev, i)  => ((ev.shirts || [])[Number(i) || 0] || {}).name || '-';
export function regTotal(ev, r) {
  if (r.preReg && !r.shirtSize) return 0;
  return (Number(ev.entryFee) || 0) + sizeSurcharge(ev, r.shirtSize) +
    (r.extras || []).reduce((s, it) => s + shirtPrice(ev, it.size), 0);
}
export const orderTotal = (ev, o) => (o.items || []).reduce((s, it) => s + shirtPrice(ev, it.size), 0);

// ── เวลา / กำหนดแนบสลิป ──────────────────────────────
export const ms = t => !t ? 0 : (typeof t.toMillis === 'function' ? t.toMillis() : (t instanceof Date ? t.getTime() : Number(t) || 0));
export function deadlineMs(ev, r) {
  if (r.status !== 'pending') return 0;
  if (r.deadlineOverride) return ms(r.deadlineOverride);
  const c = ms(r.createdAt);
  return c ? c + (Number(ev.slipHours) || 24) * 3600e3 : 0;
}
export function fmtLeft(msLeft) {
  if (msLeft <= 0) return 'เกินกำหนดแล้ว';
  const h = Math.floor(msLeft / 3600e3), m = Math.floor((msLeft % 3600e3) / 60e3);
  return h > 0 ? `เหลือ ${h} ชม. ${m} นาที` : `เหลือ ${m} นาที`;
}
export function fmtDate(t) {
  const v = ms(t); if (!v) return '-';
  return new Date(v).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── ข้อความ ──────────────────────────────────────────
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// **ตัวหนา** ในข้อความกำหนดการ
export const mdBold = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^66/, '0').replace(/^0+/, '');
export const validPhone = p => /^0\d{8,9}$/.test(String(p || '').replace(/\D/g, '').replace(/^66/, '0'));

const TITLES = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
// ใช้กันสมัครซ้ำ: ตัดคำนำหน้า ช่องว่าง และตัวพิมพ์ใหญ่เล็ก
export const nameKey = (fn, ln) =>
  (String(fn || '').trim().replace(TITLES, '') + String(ln || '').trim())
    .toLowerCase().replace(/[\s.\/]/g, '').slice(0, 200);

export async function phoneHash(eid, phone) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eid + '|' + normPhone(phone)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const codeOf = (prefix, seq) => `${prefix}-${String(seq).padStart(3, '0')}`;

// ── Google Drive link → รูป ──────────────────────────
export function driveUrl(url) {
  url = String(url || '').trim();
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}

// ── อัปโหลดรูปขึ้น Cloudinary (ย่อก่อนส่ง) ─────────────
async function compress(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900e3) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const keepPng = file.type === 'image/png' && file.size < 400e3;   // โลโก้พื้นใส
    return await new Promise(r => c.toBlob(b => r(b || file), keepPng ? 'image/png' : 'image/jpeg', quality));
  } catch { return file; }
}
export async function uploadImage(file, eid, folder, name) {
  const fd = new FormData();
  fd.append('file', await compress(file));
  fd.append('upload_preset', CLOUDINARY.preset);
  fd.append('folder', `${CLOUDINARY.root}/${eid}/${folder}`);
  if (name) fd.append('public_id', `${name}_${Date.now()}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloud}/image/upload`, { method: 'POST', body: fd });
  const j = await res.json();
  if (!j.secure_url) throw new Error(j.error?.message || 'Upload failed');
  return j.secure_url;
}

// ── UI เล็กๆ ─────────────────────────────────────────
export function toast(msg, dur = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), dur);
}
export function viewImg(url) {
  let lb = document.getElementById('_lb');
  if (!lb) {
    lb = document.createElement('div'); lb.id = '_lb'; lb.className = 'lightbox';
    lb.onclick = () => lb.style.display = 'none';
    lb.innerHTML = '<img id="_lb-img" alt=""><div class="lightbox-x">×</div>';
    document.body.appendChild(lb);
  }
  document.getElementById('_lb-img').src = url; lb.style.display = 'flex';
}
export function shirtSVG(c1, c2, w = 64, h = 64) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 80 80" fill="none"><path d="M20 15L10 30L22 33L22 65L58 65L58 33L70 30L60 15L50 20Q40 26 30 20Z" fill="${esc(c1)}" stroke="${esc(c2)}" stroke-width="1.5"/><path d="M30 20Q35 14 40 14Q45 14 50 20" fill="none" stroke="${esc(c2)}" stroke-width="1.5"/></svg>`;
}
