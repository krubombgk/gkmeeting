// หน้าเว็บสำหรับผู้สมัคร
import {
  db, data, doc, getDoc, onSnapshot, runTransaction, updateDoc, serverTimestamp, query, orderBy
} from './fb.js';
import { FALLBACK_EVENT_ID } from './config.js';
import {
  ref, STATUS, esc, mdBold, sizeSurcharge, shirtPrice, shirtNameOf, regTotal, orderTotal,
  deadlineMs, fmtLeft, fmtDate, normPhone, validPhone, nameKey, phoneHash, codeOf,
  uploadImage, toast, viewImg, shirtSVG
} from './common.js';

let EID = '';
let EV = null;                       // ข้อมูลงาน
let C = { pending: 0, confirmed: 0, reserve: 0 };   // ตัวนับที่นั่ง
let SPONSORS = [];
let page = 'home';

const blankReg   = () => ({ fn: '', ln: '', ph: '', age: '', nick: '', platform: 'Line', platformId: '', by: '', shirt: 0, size: '', sn: '', num: '', extras: [] });
const blankOrder = () => ({ fn: '', ln: '', ph: '', platform: 'Line', platformId: '', round: 0, delivery: 'pickup', addr: { name: '', address: '', phone: '' }, items: [{ shirt: 0, size: '', name: '', num: '' }] });
let R = blankReg();
let O = blankOrder();
let consentShown = false;

const $ = id => document.getElementById(id);
const seatsUsed = () => (C.pending || 0) + (C.confirmed || 0);
const isFull = () => seatsUsed() >= (EV?.quota || 0);

// ── INIT ─────────────────────────────────────────────
async function init() {
  const urlE = new URLSearchParams(location.search).get('e');
  EID = urlE || '';
  if (!EID) {
    try { const s = await getDoc(ref.site()); EID = (s.exists() && data(s).activeEvent) || FALLBACK_EVENT_ID; }
    catch { EID = FALLBACK_EVENT_ID; }
  }
  onSnapshot(ref.event(EID), snap => {
    if (!snap.exists()) { $('page-home').innerHTML = '<div class="status-empty">ยังไม่เปิดงานนี้ครับ</div>'; return; }
    EV = data(snap);
    renderHeader();
    if (page === 'home') renderHome();
  }, err => { console.error(err); $('page-home').innerHTML = '<div class="status-empty">โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรช</div>'; });
  onSnapshot(ref.counters(EID), snap => {
    if (snap.exists()) C = data(snap);
    updateSeatUI();
  });
  onSnapshot(query(ref.sponsors(EID), orderBy('order')), snap => {
    SPONSORS = snap.docs.map(d => data(d));
    buildCarousel();
  }, () => {});
  document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => show(b.dataset.page));
  setInterval(tickCountdowns, 30e3);
}

function renderHeader() {
  document.title = EV.name;
  $('h-name').textContent = EV.name;
  $('h-date').textContent = [EV.dateText, EV.timeText].filter(Boolean).join(' · ');
  $('h-sub').textContent  = [EV.venueShort, EV.organizer].filter(Boolean).join(' · ');
  const lg = $('hlogo'); if (EV.logoUrl) { lg.src = EV.logoUrl; lg.style.display = ''; } else lg.style.display = 'none';
}

function show(p) {
  if (!EV) return;
  page = p;
  ['home', 'compete', 'shirt', 'status', 'success'].forEach(x => $('page-' + x).style.display = x === p ? 'block' : 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  window.scrollTo(0, 0);
  ({ home: renderHome, compete: renderCompete, shirt: renderShirt, status: renderStatus })[p]?.();
}

// ── SPONSOR CAROUSEL ─────────────────────────────────
let carouselAnim = null;
function buildCarousel() {
  const track = $('carousel-track'), bar = $('sponsor-bar');
  if (carouselAnim) cancelAnimationFrame(carouselAnim);
  if (!SPONSORS.length) { bar.style.display = 'none'; track.innerHTML = ''; return; }
  bar.style.display = '';
  const chip = s => s.logoUrl
    ? `<div class="sp-chip"><img src="${esc(s.logoUrl)}" alt="${esc(s.name)}"></div>`
    : `<div class="sp-chip text-only">${esc(s.name)}</div>`;
  track.style.transform = 'translateX(0)';
  track.innerHTML = SPONSORS.map(chip).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const w = track.scrollWidth;
    if (!w || w < track.parentElement.clientWidth) { track.style.justifyContent = 'center'; return; }
    track.innerHTML += SPONSORS.map(chip).join('');
    let off = 0;
    const step = () => { off = (off + 0.6) % w; track.style.transform = `translateX(-${off}px)`; carouselAnim = requestAnimationFrame(step); };
    carouselAnim = requestAnimationFrame(step);
  }));
}

// ── HELPERS ──────────────────────────────────────────
const shirtImg = i => (EV.shirts[i] || {}).img || '';
function shirtPreview(i) {
  const s = EV.shirts[i] || EV.shirts[0], img = shirtImg(i);
  const pic = img
    ? `<img src="${esc(img)}" class="shirt-photo" data-view="${esc(img)}" alt="">`
    : shirtSVG(s.c1, s.c2);
  return `<div class="shirt-prev">${pic}<div class="shirt-name-t">${esc(s.name)}</div><div class="shirt-desc-t">${esc(s.desc)}</div></div>`;
}
function sizeTable() {
  if (EV.sizeChartImg) return `<img src="${esc(EV.sizeChartImg)}" style="width:100%;border-radius:6px;margin-top:.3rem" data-view="${esc(EV.sizeChartImg)}" alt="">`;
  const rows = [['XS', '34–36"', '26"', '16"'], ['S', '36–38"', '27"', '17"'], ['M', '38–40"', '28"', '18"'], ['L', '40–42"', '29"', '19"'], ['XL', '42–44"', '30"', '20"'], ['2XL', '44–46"', '31"', '21"'], ['3XL', '46–48"', '32"', '22"'], ['4XL', '48–50"', '33"', '23"'], ['5XL', '50–52"', '34"', '24"']];
  return `<table class="size-table"><thead><tr><th>ไซส์</th><th>รอบอก</th><th>ความยาว</th><th>รอบไหล่</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const sizeOpts  = cur => EV.sizes.map(s => `<option value="${esc(s)}"${cur === s ? ' selected' : ''}>${esc(s)}${sizeSurcharge(EV, s) ? ` (+${EV.surcharge})` : ''}</option>`).join('');
const styleOpts = cur => EV.shirts.map((s, j) => `<option value="${j}"${Number(cur) === j ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
const platformOpts = cur => ['Line', 'Facebook', 'TikTok', 'อื่นๆ'].map(p => `<option${cur === p ? ' selected' : ''}>${p}</option>`).join('');
function payInfo() {
  return `<div class="pp-row"><span class="pp-badge">${esc(EV.bankName)}</span><span>เลขบัญชี <span class="pp-num">${esc(EV.bankAccount)}</span></span></div>` +
    (EV.qrImg ? `<div style="text-align:center;margin-top:.75rem"><img src="${esc(EV.qrImg)}" class="qr-img" data-view="${esc(EV.qrImg)}" alt="QR"><div class="muted-sm">สแกน QR ชำระเงิน (แตะเพื่อขยาย)</div></div>` : '');
}
function lineBox() {
  if (!EV.lineLink) return '';
  return `<div class="line-box">📣 <strong>เข้ากลุ่ม Line Open Chat</strong> เพื่อรับข่าวสารอัพเดทงานครับ<br>
    👉 <a href="${esc(EV.lineLink)}" target="_blank" rel="noopener">กดที่นี่เพื่อเข้ากลุ่ม</a><br>
    ${EV.linePassword ? `🔑 Password: <strong>${esc(EV.linePassword)}</strong><br>` : ''}
    ${EV.lineQrUrl ? `<img src="${esc(EV.lineQrUrl)}" style="width:160px;height:160px;object-fit:contain;margin-top:.5rem;border-radius:6px" alt="">` : ''}</div>`;
}
const afterPayMsg = () => `หลังชำระเงินแล้ว แนบสลิปได้ที่ปุ่ม "ตรวจสอบสถานะ" ภายใน ${EV.slipHours || 24} ชั่วโมง หรือแจ้งครูบ็อมทาง Facebook, TikTok หรือ Line`;
const RESERVE_MSG = 'ท่านสมัครเป็นตัวสำรอง อย่าเพิ่งชำระเงินจนกว่าทีมงานจะติดต่อกลับนะครับ ขอบคุณครับ';

document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]'); if (v) viewImg(v.dataset.view);
});

// ── HOME ─────────────────────────────────────────────
function modeGrid() {
  const card = (to, img, icon, h, p, price) => `<div class="mode-card" data-go="${to}">
    ${img ? `<img src="${esc(img)}" class="mode-img" alt="">` : `<div class="mc-icon">${icon}</div>`}
    <div class="mc-h">${h}</div><div class="mc-p">${p}</div><div class="mc-price">${price}</div></div>`;
  return card('compete', EV.modeImgCompete, '🧤', 'สมัครร่วมงาน', `ร่วมกิจกรรม พร้อมรับเสื้อ<br>รับ ${EV.quota} คนเท่านั้น`, `${EV.entryFee} บาท`) +
         card('shirt', EV.modeImgShirt, '👕', 'สั่งเสื้ออย่างเดียว', 'สนับสนุนงาน ไม่ร่วมแข่ง', `${EV.shirtPrice} บาท / ตัว`);
}
function renderHome() {
  if (!EV) return;
  const anns = (EV.announceImgs || []).filter(Boolean);
  $('page-home').innerHTML = `
    <div class="hero">
      ${EV.logoUrl ? `<img src="${esc(EV.logoUrl)}" class="hero-logo" alt="">` : ''}
      <div class="hero-badge">${EV.registrationOpen ? 'Registration Open' : 'Registration Closed'}</div>
      <div class="hero-title">${esc(EV.titleLine1)}<br><span>${esc(EV.titleLine2)}</span></div>
      <div class="hero-meta">${EV.dateText ? `📅 ${esc(EV.dateText)}${EV.timeText ? ' · ' + esc(EV.timeText) : ''}<br>` : ''}${EV.venue ? `📍 ${esc(EV.venue)}` : ''}</div>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num" id="s-main">—</div><div class="stat-lbl">สมัครแล้ว</div></div>
      <div class="stat-card"><div class="stat-num c-green" id="s-conf">—</div><div class="stat-lbl">ยืนยันแล้ว</div></div>
      <div class="stat-card"><div class="stat-num c-gold" id="s-pend">—</div><div class="stat-lbl">รอยืนยัน</div></div>
      <div class="stat-card"><div class="stat-num c-grey" id="s-left">—</div><div class="stat-lbl">ว่างอยู่</div></div>
      <div class="stat-card"><div class="stat-num c-blue" id="s-res">—</div><div class="stat-lbl">คิวสำรอง</div></div>
    </div>
    <div class="quota-card">
      <div class="quota-top"><span>ที่นั่งที่ใช้ไป <span class="live-dot" title="อัปเดตอัตโนมัติ"></span></span><strong id="q-txt">— / ${EV.quota} คน</strong></div>
      <div class="bar-bg" style="height:10px"><div style="display:flex;height:100%">
        <div id="q-bar-conf" class="bar-seg" style="background:var(--red)"></div>
        <div id="q-bar-pend" class="bar-seg" style="background:var(--gold)"></div></div></div>
      <div class="q-leg">
        <div class="q-li"><div class="q-dot" style="background:var(--red)"></div>ยืนยันแล้ว</div>
        <div class="q-li"><div class="q-dot" style="background:var(--gold)"></div>รอการยืนยัน</div>
      </div>
    </div>
    <div class="mode-grid">${modeGrid()}</div>
    ${(EV.schedule || []).length ? `<div class="sched-card"><div class="slabel">กำหนดการสำคัญ</div>${EV.schedule.map(s => `<div class="sched-item">${mdBold(s)}</div>`).join('')}</div>` : ''}
    ${anns.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:.5rem">${anns.map(u => `<img src="${esc(u)}" style="width:100%;border-radius:8px" data-view="${esc(u)}" alt="">`).join('')}</div>` : ''}`;
  $('page-home').querySelectorAll('[data-go]').forEach(c => c.onclick = () => show(c.dataset.go));
  updateSeatUI();
}
function updateSeatUI() {
  if (!EV) return;
  const q = EV.quota || 1, used = seatsUsed();
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('s-main', used); set('s-conf', C.confirmed || 0); set('s-pend', C.pending || 0);
  set('s-left', Math.max(0, q - used)); set('s-res', C.reserve || 0);
  set('q-txt', `${used} / ${q} คน`);
  const cw = Math.min(100, (C.confirmed || 0) / q * 100);
  if ($('q-bar-conf')) $('q-bar-conf').style.width = cw + '%';
  if ($('q-bar-pend')) $('q-bar-pend').style.width = Math.min(100 - cw, (C.pending || 0) / q * 100) + '%';
  const qc = $('c-quota');
  if (qc) qc.innerHTML = quotaMini();
}
const quotaMini = () => `<div class="quota-top"><span>ที่นั่ง <span class="live-dot"></span></span><strong>${seatsUsed()} / ${EV.quota} คน</strong></div>
  <div class="bar-bg"><div class="bar-fg" style="width:${Math.min(100, seatsUsed() / EV.quota * 100)}%"></div></div>
  ${isFull() ? '<div class="waitlist-badge" style="margin:.5rem 0 0">ตอนนี้ที่นั่งเต็มแล้ว — ยังสมัครเป็นตัวสำรองได้ แต่อย่าเพิ่งชำระเงินจนกว่าทีมงานจะติดต่อกลับครับ</div>' : ''}`;

// ── CONSENT ──────────────────────────────────────────
function showConsent() {
  if (consentShown || $('consent-overlay')) return;
  const el = document.createElement('div');
  el.id = 'consent-overlay'; el.className = 'consent-overlay';
  el.innerHTML = `<div class="consent-box">
    <div class="consent-header">${EV.logoUrl ? `<img src="${esc(EV.logoUrl)}" alt="">` : ''}
      <h3>⚠️ สำคัญมากๆครับ</h3><div class="muted-sm">กรุณาอ่านและรับทราบก่อนสมัคร</div></div>
    <div class="consent-body">
      <p>เนื่องจากงานนี้จัดขึ้นเพื่อเน้นสร้างรอยยิ้มและมิตรภาพ งานนี้จึง<strong>ไม่มีรางวัลเป็นเงิน แต่มีของรางวัลตั้งแต่เล็กๆน้อยๆไปจนถึงถุงมือแบรนด์ชั้นนำ</strong>ให้ได้ลุ้นแน่นอนครับ 😁</p><br>
      <p>งานนี้<strong>รับผู้สมัครเพียง ${EV.quota} คน</strong> และ<strong>ไม่มีแบ่งรุ่นอายุ</strong> แต่ในกลุ่มเยาวชนจะได้รับการจัดให้ได้พบกับเยาวชนด้วยกันในรอบแบ่งกลุ่ม เมื่อผ่านจากรอบแบ่งกลุ่มเป็นรอบ Knock-Out จะต้องได้แข่งกับพี่ๆ แต่ด้วยกิจกรรมที่เป็นกิจกรรมแบบสร้างมิตรภาพ ขอให้ทุกคนเล่นกันอย่างมิตรภาพเช่นเดียวกันครับ <strong>แพ้ชนะขอให้เป็นเรื่องรอง</strong> จุดประสงค์ของงานคืออยากให้ทุกคนได้<strong>พบปะกัน แลกเปลี่ยนประสบการณ์ และได้แรงบันดาลใจร่วมกัน</strong>ครับ</p><br>
      <p>ส่วนความชัดเจนของการแบ่งกลุ่มเยาวชนขออนุญาตให้สมัครครบก่อน เพื่อจะได้ทราบจำนวนที่แน่นอนมาประกอบการตัดสินใจอีกทีครับ</p><br>
      <p>เบื้องต้น (อาจมีการเปลี่ยนแปลง) น้องๆที่<strong>อายุยังไม่ถึง ${EV.youthAge} ปี${EV.dateText ? ` ในวันที่ ${esc(EV.dateText)}` : ' ในวันงาน'}</strong> นับเป็นเยาวชนทั้งหมดครับ</p>
    </div>
    <div class="consent-footer">
      <button class="consent-accept-btn" id="consent-ok">รับทราบและดำเนินการต่อ</button>
      <button class="ghost-btn" id="consent-back">ย้อนกลับหน้าแรก</button>
    </div></div>`;
  document.body.appendChild(el);
  $('consent-ok').onclick = () => { consentShown = true; el.remove(); };
  $('consent-back').onclick = () => { el.remove(); show('home'); };
}

// ── สมัครร่วมงาน ─────────────────────────────────────
function renderCompete() {
  if (!EV.registrationOpen) { toast('ยังไม่เปิดรับสมัคร / ปิดรับสมัครแล้วครับ', 3500); show('home'); return; }
  showConsent();
  const pg = $('page-compete');
  pg.innerHTML = `
    <div class="page-hdr"><button class="back-btn" data-go="home">← กลับ</button><div class="page-title">สมัครร่วมงาน</div></div>
    <div class="quota-card" id="c-quota">${quotaMini()}</div>
    <div class="section-card">
      <div class="slabel">ข้อมูลผู้เข้าร่วม</div>
      <div class="hint-box">💡 สมัครให้คนอื่นได้ครับ (เช่น ผู้ปกครองสมัครให้ลูก) — ใส่ชื่อผู้เข้าร่วมจริง ส่วนเบอร์โทรใช้เบอร์ผู้ปกครองได้ เช็คสถานะด้วยเบอร์นี้จะเห็นทุกคนที่สมัครไว้</div>
      <div class="frow">
        <div class="field"><label>ชื่อ <span class="req">*</span></label><input id="r-fn" data-k="fn" placeholder="ชื่อจริง"></div>
        <div class="field"><label>นามสกุล <span class="req">*</span></label><input id="r-ln" data-k="ln" placeholder="นามสกุล"></div>
      </div>
      <div class="frow">
        <div class="field"><label>เบอร์โทร <span class="req">*</span></label><input id="r-ph" data-k="ph" type="tel" inputmode="tel" placeholder="08X-XXX-XXXX"></div>
        <div class="field"><label>อายุ (ปี) <span class="req">*</span></label><input id="r-age" data-k="age" type="number" inputmode="numeric" placeholder="22" min="4" max="80"></div>
      </div>
      <div class="field"><label>ชื่อที่ใช้ในงาน <span class="req">*</span></label><input id="r-nick" data-k="nick" placeholder="ชื่อที่จะประกาศในสนาม"></div>
      <div class="field"><label>สมัครแทนโดย (ถ้ามี)</label><input id="r-by" data-k="by" placeholder="เช่น คุณแม่ของน้อง — เว้นว่างถ้าสมัครเอง"></div>
      <div class="slabel" style="margin-top:.75rem">ช่องทางติดต่อ</div>
      <div class="frow">
        <div class="field"><label>Platform <span class="req">*</span></label><select id="r-platform" data-k="platform">${platformOpts(R.platform)}</select></div>
        <div class="field"><label>ID / ชื่อบัญชี <span class="req">*</span></label><input id="r-pid" data-k="platformId" placeholder="@username หรือ ID"></div>
      </div>
    </div>
    <div class="section-card">
      <div class="slabel">เสื้อนักกีฬา</div>
      <div class="shirt-tabs">${EV.shirts.map((s, i) => `<button class="shirt-tab${R.shirt === i ? ' active' : ''}" data-shirt="${i}">${esc(s.name)}</button>`).join('')}</div>
      <div id="r-prev">${shirtPreview(R.shirt)}</div>
      <div class="slabel" style="margin-top:.5rem">ไซส์ <span class="req">*</span></div>
      <div class="size-grid">${EV.sizes.map(sz => `<button class="sz-btn${R.size === sz ? ' active' : ''}${sizeSurcharge(EV, sz) ? ' surcharge' : ''}" data-sz="${esc(sz)}">${esc(sz)}${sizeSurcharge(EV, sz) ? `<span class="sz-extra">+${EV.surcharge}฿</span>` : ''}</button>`).join('')}</div>
      <details><summary class="chart-toggle">ดูตารางไซส์ ▾</summary>${sizeTable()}</details>
      <div class="frow" style="margin-top:.7rem">
        <div class="field"><label>ชื่อหลังเสื้อ</label><input id="r-sn" data-k="sn" data-upper placeholder="SOMCHAI" maxlength="12"></div>
        <div class="field"><label>เบอร์เสื้อ</label><input id="r-num" data-k="num" type="number" inputmode="numeric" placeholder="1–99" min="0" max="99"></div>
      </div>
      <div class="extra-row">
        <div><div class="extra-lbl">สั่งเสื้อเพิ่ม</div><div class="extra-p">${EV.shirtPrice} บาท / ตัว</div></div>
        <div class="qty-ctrl"><button class="qty-btn" data-xq="-1">−</button><div class="qty-n" id="r-xn">${R.extras.length}</div><button class="qty-btn" data-xq="1">+</button></div>
      </div>
      <div id="r-xlist"></div>
    </div>
    <div class="section-card">
      <div class="slabel">ชำระเงิน</div>
      <div id="r-paynote"></div>
      <div class="pay-box" id="r-pay"></div>
      <div class="later-note">📲 ${esc(afterPayMsg())}</div>
    </div>
    <button class="submit-btn" id="r-sub">ยืนยันการสมัคร</button>`;

  // เติมค่าที่พิมพ์ไว้
  pg.querySelectorAll('[data-k]').forEach(el => {
    el.value = R[el.dataset.k] ?? '';
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (el.dataset.upper !== undefined) el.value = el.value.toUpperCase();
      R[el.dataset.k] = el.value; el.classList.remove('err');
    });
  });
  pg.querySelector('[data-go]').onclick = () => show('home');
  pg.querySelectorAll('[data-shirt]').forEach(b => b.onclick = () => {
    R.shirt = Number(b.dataset.shirt);
    pg.querySelectorAll('[data-shirt]').forEach(x => x.classList.toggle('active', x === b));
    $('r-prev').innerHTML = shirtPreview(R.shirt);
  });
  pg.querySelectorAll('.sz-btn').forEach(b => b.onclick = () => {
    R.size = b.dataset.sz;
    pg.querySelectorAll('.sz-btn').forEach(x => x.classList.toggle('active', x === b));
    renderRPay();
  });
  pg.querySelectorAll('[data-xq]').forEach(b => b.onclick = () => {
    const n = Math.max(0, Math.min(5, R.extras.length + Number(b.dataset.xq)));
    while (R.extras.length < n) R.extras.push({ shirt: 0, size: '', name: '', num: '' });
    R.extras.length = n;
    $('r-xn').textContent = n; renderRXList(); renderRPay();
  });
  $('r-sub').onclick = submitReg;
  renderRXList(); renderRPay();
}
function itemEditor(list, i, title, onChange) {
  const it = list[i];
  return `<div class="item-box" data-i="${i}">
    <div class="slabel" style="margin-bottom:.4rem">${title}</div>
    <div class="frow">
      <div class="field"><label>ไซส์ <span class="req">*</span></label><select data-f="size"><option value="">เลือก</option>${sizeOpts(it.size)}</select></div>
      <div class="field"><label>แบบเสื้อ</label><select data-f="shirt">${styleOpts(it.shirt)}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label>ชื่อหลังเสื้อ</label><input data-f="name" placeholder="SOMCHAI" maxlength="12" value="${esc(it.name)}"></div>
      <div class="field"><label>เบอร์เสื้อ</label><input data-f="num" type="number" inputmode="numeric" placeholder="1–99" value="${esc(it.num)}"></div>
    </div></div>`;
}
function bindItems(container, list, onChange) {
  container.querySelectorAll('.item-box').forEach(box => {
    const it = list[Number(box.dataset.i)];
    box.querySelectorAll('[data-f]').forEach(el => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (el.dataset.f === 'name') el.value = el.value.toUpperCase();
        it[el.dataset.f] = el.dataset.f === 'shirt' ? Number(el.value) : el.value;
        onChange && onChange();
      });
    });
  });
}
function renderRXList() {
  const l = $('r-xlist');
  l.innerHTML = R.extras.map((_, i) => itemEditor(R.extras, i, `เสื้อเพิ่มตัวที่ ${i + 1}`)).join('');
  bindItems(l, R.extras, renderRPay);
}
function renderRPay() {
  const el = $('r-pay'); if (!el) return;
  const sur = sizeSurcharge(EV, R.size);
  const xc = R.extras.reduce((s, it) => s + shirtPrice(EV, it.size), 0);
  $('r-paynote').innerHTML = isFull() ? '<div class="waitlist-badge">ตัวสำรอง: ยังไม่ต้องโอนเงินครับ</div>' : '';
  el.innerHTML = `<div class="pay-row"><span>ค่าสมัคร + เสื้อ</span><span class="pv">฿${EV.entryFee + sur}${sur ? ` <small class="c-gold">(+${sur} ไซส์พิเศษ)</small>` : ''}</span></div>
    ${R.extras.length ? `<div class="pay-row"><span>เสื้อเพิ่ม (${R.extras.length} ตัว)</span><span class="pv">฿${xc}</span></div>` : ''}
    <div class="pay-div"></div><div class="pay-total-row"><span>รวม</span><span>฿${regTotal(EV, { shirtSize: R.size, extras: R.extras })}</span></div>
    ${isFull() ? '' : payInfo()}`;
  $('r-sub').textContent = isFull() ? 'สมัครเป็นตัวสำรอง' : 'ยืนยันการสมัคร';
}

function markErr(ids) {
  let ok = true;
  ids.forEach(([id, valid]) => { const e = $(id); const good = valid(e.value); e.classList.toggle('err', !good); if (!good) ok = false; });
  return ok;
}
const notEmpty = v => String(v).trim().length > 0;

async function submitReg() {
  if (!markErr([['r-fn', notEmpty], ['r-ln', notEmpty], ['r-ph', validPhone], ['r-age', v => v > 0 && v < 100], ['r-nick', notEmpty], ['r-pid', notEmpty]])) {
    toast(validPhone(R.ph) ? 'กรุณากรอกข้อมูลให้ครบ' : 'กรุณาตรวจสอบเบอร์โทร (10 หลัก)'); return;
  }
  if (!R.size) { toast('กรุณาเลือกไซส์เสื้อ'); return; }
  if (R.extras.some(it => !it.size)) { toast('กรุณาเลือกไซส์เสื้อเพิ่มให้ครบ'); return; }

  const btn = $('r-sub'); btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  const key = nameKey(R.fn, R.ln);
  const hash = await phoneHash(EID, R.ph);
  const regRef = doc(ref.regs(EID));
  let result;
  try {
    result = await runTransaction(db, async tx => {
      const evS = await tx.get(ref.event(EID));
      const cS  = await tx.get(ref.counters(EID));
      const nS  = await tx.get(ref.name(EID, key));
      const lS  = await tx.get(ref.lookup(EID, hash));
      const ev = data(evS), c = data(cS);
      if (!ev.registrationOpen) throw new Error('CLOSED');
      if (nS.exists()) throw new Error('DUP');
      const refs = lS.exists() ? (data(lS).refs || []) : [];
      if (refs.filter(r => r.startsWith('r:')).length >= (ev.maxPerPhone || 5)) throw new Error('PHONE_LIMIT');
      const status = (c.pending + c.confirmed) < ev.quota ? 'pending' : 'reserve';
      const seq = c.regSeq + 1;
      const reg = {
        code: codeOf(ev.idPrefix, seq), seq, createdAt: serverTimestamp(),
        firstName: R.fn.trim(), lastName: R.ln.trim(), nameKey: key,
        phone: R.ph.trim(), age: Number(R.age), nickname: R.nick.trim(), registeredBy: R.by.trim(),
        platform: R.platform, platformId: R.platformId.trim(),
        shirt: R.shirt, shirtSize: R.size, shirtName: R.sn.trim(), shirtNumber: String(R.num || ''),
        extras: R.extras.map(it => ({ shirt: Number(it.shirt) || 0, size: it.size, name: String(it.name || '').trim(), num: String(it.num || '') })),
        total: regTotal(ev, { shirtSize: R.size, extras: R.extras }),
        status, slipUrl: '', slipAt: null, deadlineOverride: null, preReg: false, note: ''
      };
      tx.set(regRef, reg);
      tx.update(ref.counters(EID), status === 'pending'
        ? { regSeq: seq, pending: c.pending + 1, lastRegId: regRef.id }
        : { regSeq: seq, reserve: c.reserve + 1, lastRegId: regRef.id });
      tx.set(ref.name(EID, key), { at: serverTimestamp() });
      tx.set(ref.lookup(EID, hash), { refs: [...refs, 'r:' + regRef.id] });
      return { ...reg, createdAt: new Date() };
    });
  } catch (err) {
    console.error(err);
    const msg = { CLOSED: 'ปิดรับสมัครแล้วครับ', DUP: `ชื่อ "${R.fn} ${R.ln}" สมัครไว้แล้ว — เช็คได้ที่ "ตรวจสอบสถานะ" ครับ`, PHONE_LIMIT: `เบอร์นี้สมัครครบ ${EV.maxPerPhone || 5} คนแล้ว กรุณาใช้เบอร์อื่น` }[err.message];
    toast(msg || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 4500);
    btn.disabled = false; btn.textContent = isFull() ? 'สมัครเป็นตัวสำรอง' : 'ยืนยันการสมัคร';
    return;
  }
  const r = result, reserve = r.status === 'reserve';
  const rows = [['ชื่อ-นามสกุล', `${r.firstName} ${r.lastName}`], ['ชื่อในงาน', r.nickname], ['ติดต่อ', `${r.platform}: ${r.platformId}`],
    ['เสื้อ', `${shirtNameOf(EV, r.shirt)} / ${r.shirtSize}`], ['ยอดชำระ', '฿' + r.total]];
  if (r.registeredBy) rows.splice(1, 0, ['สมัครแทนโดย', r.registeredBy]);
  if (r.extras.length) rows.push(['เสื้อเพิ่ม', r.extras.map((it, i) => `ตัว${i + 1}: ${shirtNameOf(EV, it.shirt)} / ${it.size} / ${it.name || '-'} / #${it.num || '-'}`).join(', ')]);
  const dl = Date.now() + (EV.slipHours || 24) * 3600e3;
  showSuccess(reserve ? 'สมัครเป็นตัวสำรองเรียบร้อย' : 'สมัครเรียบร้อย!', r.code, rows,
    reserve ? RESERVE_MSG : `กรุณาชำระเงินและแนบสลิปภายใน ${fmtDate(dl)} น.`,
    reserve ? null : { id: regRef.id, type: 'r', name: `${r.firstName} ${r.lastName}`, total: r.total }, !reserve);
  R = blankReg();
}

// ── สั่งเสื้อ ─────────────────────────────────────────
function renderShirt() {
  if (!EV.shirtOrderOpen) { toast('ยังไม่เปิด / ปิดรับสั่งเสื้อแล้วครับ', 3000); show('home'); return; }
  const pg = $('page-shirt');
  const rounds = EV.shirtRounds || [];
  pg.innerHTML = `
    <div class="page-hdr"><button class="back-btn" data-go="home">← กลับ</button><div class="page-title">สั่งเสื้ออย่างเดียว</div></div>
    <div class="section-card"><div class="slabel">ข้อมูลผู้สั่ง</div>
      <div class="frow">
        <div class="field"><label>ชื่อ <span class="req">*</span></label><input id="o-fn" data-k="fn" placeholder="ชื่อจริง"></div>
        <div class="field"><label>นามสกุล <span class="req">*</span></label><input id="o-ln" data-k="ln" placeholder="นามสกุล"></div>
      </div>
      <div class="field"><label>เบอร์โทร <span class="req">*</span></label><input id="o-ph" data-k="ph" type="tel" inputmode="tel" placeholder="08X-XXX-XXXX"></div>
      <div class="frow">
        <div class="field"><label>Platform <span class="req">*</span></label><select data-k="platform">${platformOpts(O.platform)}</select></div>
        <div class="field"><label>ID / ชื่อบัญชี <span class="req">*</span></label><input id="o-pid" data-k="platformId" placeholder="@username หรือ ID"></div>
      </div>
    </div>
    ${rounds.length > 1 ? `<div class="section-card"><div class="slabel">รอบการส่ง</div><div class="dl-picker">
      ${rounds.map((r, i) => `<div class="dl-opt${O.round === i ? ' active' : ''}" data-round="${i}"><h4>${esc(r.label)}</h4><p>${esc(r.orderBy)}</p><div class="dl-date">${esc(r.receive)}</div></div>`).join('')}
    </div></div>` : ''}
    <div class="section-card"><div class="slabel">รายการเสื้อ</div>
      <div class="shirt-tabs">${EV.shirts.map((s, i) => `<button class="shirt-tab${i === 0 ? ' active' : ''}" data-shirt="${i}">${esc(s.name)}</button>`).join('')}</div>
      <div id="o-prev">${shirtPreview(0)}</div>
      <div class="extra-row" style="border-top:none;padding-top:0">
        <div class="extra-lbl">จำนวน <span class="req">*</span></div>
        <div class="qty-ctrl"><button class="qty-btn" data-oq="-1">−</button><div class="qty-n" id="o-qn">${O.items.length}</div><button class="qty-btn" data-oq="1">+</button></div>
      </div>
      <div id="o-ilist"></div>
      <details><summary class="chart-toggle">ดูตารางไซส์ ▾</summary>${sizeTable()}</details>
    </div>
    <div class="section-card"><div class="slabel">การรับเสื้อ <span class="req">*</span></div>
      <div class="delivery-opts">
        <div class="delivery-opt${O.delivery === 'pickup' ? ' active' : ''}" data-d="pickup"><h4>🏟️ รับในงาน</h4><p>${esc(EV.venueShort || 'รับที่สนาม')}${EV.dateText ? '<br>' + esc(EV.dateText) : ''}</p></div>
        <div class="delivery-opt${O.delivery === 'ship' ? ' active' : ''}" data-d="ship"><h4>📦 ส่งพัสดุ</h4><p>จัดส่งทางไปรษณีย์<br>ค่าส่งผู้รับเป็นผู้ชำระ</p></div>
      </div>
      <div id="o-addr" style="display:${O.delivery === 'ship' ? 'block' : 'none'}">
        <div class="field"><label>ชื่อผู้รับ <span class="req">*</span></label><input id="o-an" data-a="name" placeholder="ชื่อ-นามสกุลผู้รับ"></div>
        <div class="field"><label>ที่อยู่จัดส่ง <span class="req">*</span></label><textarea id="o-aa" data-a="address" rows="3" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"></textarea></div>
        <div class="field"><label>เบอร์โทรผู้รับ <span class="req">*</span></label><input id="o-ap" data-a="phone" type="tel" placeholder="08X-XXX-XXXX"></div>
      </div>
    </div>
    <div class="section-card"><div class="slabel">ชำระเงิน</div>
      <div class="pay-box" id="o-pay"></div>
      <div class="later-note">📲 ${esc(afterPayMsg())}</div>
    </div>
    <button class="submit-btn" id="o-sub">ยืนยันการสั่งซื้อ</button>`;

  pg.querySelectorAll('[data-k]').forEach(el => {
    el.value = O[el.dataset.k] ?? '';
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { O[el.dataset.k] = el.value; el.classList.remove('err'); });
  });
  pg.querySelectorAll('[data-a]').forEach(el => {
    el.value = O.addr[el.dataset.a] || '';
    el.addEventListener('input', () => { O.addr[el.dataset.a] = el.value; el.classList.remove('err'); });
  });
  pg.querySelector('[data-go]').onclick = () => show('home');
  pg.querySelectorAll('[data-round]').forEach(b => b.onclick = () => {
    O.round = Number(b.dataset.round);
    pg.querySelectorAll('[data-round]').forEach(x => x.classList.toggle('active', x === b));
  });
  pg.querySelectorAll('[data-shirt]').forEach(b => b.onclick = () => {
    pg.querySelectorAll('[data-shirt]').forEach(x => x.classList.toggle('active', x === b));
    $('o-prev').innerHTML = shirtPreview(Number(b.dataset.shirt));
  });
  pg.querySelectorAll('[data-oq]').forEach(b => b.onclick = () => {
    const n = Math.max(1, Math.min(20, O.items.length + Number(b.dataset.oq)));
    while (O.items.length < n) O.items.push({ shirt: 0, size: '', name: '', num: '' });
    O.items.length = n;
    $('o-qn').textContent = n; renderOItems(); renderOPay();
  });
  pg.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    O.delivery = b.dataset.d;
    pg.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('active', x === b));
    $('o-addr').style.display = O.delivery === 'ship' ? 'block' : 'none';
  });
  $('o-sub').onclick = submitOrder;
  renderOItems(); renderOPay();
}
function renderOItems() {
  const l = $('o-ilist');
  l.innerHTML = O.items.map((_, i) => itemEditor(O.items, i, `เสื้อตัวที่ ${i + 1}`)).join('');
  bindItems(l, O.items, renderOPay);
}
function renderOPay() {
  const el = $('o-pay'); if (!el) return;
  el.innerHTML = O.items.map((it, i) => `<div class="pay-row"><span>ตัวที่ ${i + 1}${it.size ? ` (${esc(it.size)})` : ''} · ${esc(shirtNameOf(EV, it.shirt))}</span><span class="pv">฿${shirtPrice(EV, it.size)}</span></div>`).join('') +
    `<div class="pay-div"></div><div class="pay-total-row"><span>รวม</span><span>฿${orderTotal(EV, O)}</span></div>${payInfo()}`;
}
async function submitOrder() {
  const checks = [['o-fn', notEmpty], ['o-ln', notEmpty], ['o-ph', validPhone], ['o-pid', notEmpty]];
  if (O.delivery === 'ship') checks.push(['o-an', notEmpty], ['o-aa', notEmpty], ['o-ap', validPhone]);
  if (!markErr(checks)) { toast('กรุณากรอกข้อมูลให้ครบ / ตรวจสอบเบอร์โทร'); return; }
  if (O.items.some(it => !it.size)) { toast('กรุณาเลือกไซส์เสื้อให้ครบทุกตัว'); return; }

  const btn = $('o-sub'); btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  const hash = await phoneHash(EID, O.ph);
  const oRef = doc(ref.shirts(EID));
  let result;
  try {
    result = await runTransaction(db, async tx => {
      const evS = await tx.get(ref.event(EID));
      const cS  = await tx.get(ref.counters(EID));
      const lS  = await tx.get(ref.lookup(EID, hash));
      const ev = data(evS), c = data(cS);
      if (!ev.shirtOrderOpen) throw new Error('CLOSED');
      const refs = lS.exists() ? (data(lS).refs || []) : [];
      if (refs.length >= 20) throw new Error('PHONE_LIMIT');
      const seq = c.shirtSeq + 1;
      const o = {
        code: codeOf(ev.shirtIdPrefix, seq), seq, createdAt: serverTimestamp(),
        firstName: O.fn.trim(), lastName: O.ln.trim(), phone: O.ph.trim(),
        platform: O.platform, platformId: O.platformId.trim(),
        round: (ev.shirtRounds || []).length ? O.round : -1,
        items: O.items.map(it => ({ shirt: Number(it.shirt) || 0, size: it.size, name: String(it.name || '').trim(), num: String(it.num || '') })),
        delivery: O.delivery,
        address: O.delivery === 'ship' ? { name: O.addr.name.trim(), address: O.addr.address.trim(), phone: O.addr.phone.trim() } : null,
        total: orderTotal(ev, O), status: 'pending', slipUrl: '', slipAt: null, note: ''
      };
      tx.set(oRef, o);
      tx.update(ref.counters(EID), { shirtSeq: seq, lastShirtId: oRef.id });
      tx.set(ref.lookup(EID, hash), { refs: [...refs, 's:' + oRef.id] });
      return o;
    });
  } catch (err) {
    console.error(err);
    toast({ CLOSED: 'ปิดรับสั่งเสื้อแล้วครับ', PHONE_LIMIT: 'เบอร์นี้มีรายการเยอะเกินไป กรุณาติดต่อทีมงาน' }[err.message] || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่', 4000);
    btn.disabled = false; btn.textContent = 'ยืนยันการสั่งซื้อ';
    return;
  }
  const o = result, rd = (EV.shirtRounds || [])[o.round];
  showSuccess('สั่งซื้อเรียบร้อย!', o.code, [
    ['ชื่อ', `${o.firstName} ${o.lastName}`], ['ติดต่อ', `${o.platform}: ${o.platformId}`],
    ['จำนวน', o.items.length + ' ตัว'], ...(rd ? [['รอบส่ง', `${rd.label} — ${rd.receive}`]] : []),
    ['การรับเสื้อ', o.delivery === 'pickup' ? 'รับในงาน' : 'ส่งพัสดุ — ' + o.address.name], ['ยอดชำระ', '฿' + o.total]
  ], afterPayMsg(), { id: oRef.id, type: 's', name: `${o.firstName} ${o.lastName}`, total: o.total }, false);
  O = blankOrder();
}

// ── SUCCESS ──────────────────────────────────────────
function showSuccess(title, code, rows, msg, slipTarget, withLine) {
  page = 'success';
  ['home', 'compete', 'shirt', 'status'].forEach(p => $('page-' + p).style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pg = $('page-success'); pg.style.display = 'block';
  pg.innerHTML = `<div class="succ-wrap">
    <div class="succ-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <div class="succ-title">${esc(title)}</div>
    <div class="reg-num">#${esc(code)}</div>
    <div class="succ-details">${rows.map(([k, v]) => `<div class="sd-row"><span class="sdk">${esc(k)}</span><span class="sdv">${esc(v)}</span></div>`).join('')}</div>
    <div class="succ-msg">${esc(msg)}</div>
    ${slipTarget ? `<div class="section-card" style="margin-top:1rem;text-align:left"><div class="slabel">ชำระเงิน</div>${payInfo()}
      <button class="submit-btn" id="succ-slip" style="margin-top:.75rem">📎 แนบสลิปเลย</button>
      <div class="muted-sm" style="text-align:center;margin-top:.4rem">หรือแนบภายหลังที่ "ตรวจสอบสถานะ"</div></div>` : ''}
    ${withLine ? lineBox() : ''}
    <button class="ghost-btn" id="succ-home" style="max-width:220px;margin:1rem auto 0">กลับหน้าแรก</button>
  </div>`;
  $('succ-home').onclick = () => show('home');
  if (slipTarget) $('succ-slip').onclick = () => openUpload(slipTarget, () => {
    $('succ-slip').outerHTML = '<div class="slip-done-tag" style="justify-content:center;height:44px;margin-top:.75rem">✅ แนบสลิปแล้ว — รอทีมงานยืนยัน</div>';
  });
  window.scrollTo(0, 0);
}

// ── ตรวจสอบสถานะ ─────────────────────────────────────
let lastPhone = '';
function renderStatus() {
  $('page-status').innerHTML = `
    <div class="page-hdr"><div class="page-title">ตรวจสอบสถานะ</div></div>
    <div class="status-search-card">
      <div class="muted" style="margin-bottom:.75rem">กรอกเบอร์โทรที่ใช้สมัคร / สั่งเสื้อ</div>
      <div class="status-search-row">
        <input class="status-ph-input" id="st-ph" type="tel" inputmode="tel" placeholder="08X-XXX-XXXX" value="${esc(lastPhone)}">
        <button class="status-search-btn" id="st-go">ค้นหา</button>
      </div>
    </div>
    <div id="st-result"></div>`;
  $('st-go').onclick = searchStatus;
  $('st-ph').onkeydown = e => { if (e.key === 'Enter') searchStatus(); };
  if (lastPhone) searchStatus();
}
async function searchStatus() {
  const ph = $('st-ph').value.trim();
  if (!validPhone(ph)) { toast('กรุณาใส่เบอร์โทรให้ถูกต้อง'); return; }
  lastPhone = ph;
  const out = $('st-result');
  out.innerHTML = '<div class="loader">กำลังค้นหา...</div>';
  try {
    const l = await getDoc(ref.lookup(EID, await phoneHash(EID, ph)));
    const refs = l.exists() ? (data(l).refs || []) : [];
    const docs = await Promise.all(refs.map(async r => {
      const [t, id] = r.split(':');
      const s = await getDoc(t === 'r' ? ref.reg(EID, id) : ref.shirt(EID, id));
      return s.exists() ? { t, id, ...data(s) } : null;
    }));
    const regs = docs.filter(d => d && d.t === 'r'), orders = docs.filter(d => d && d.t === 's');
    if (!regs.length && !orders.length) { out.innerHTML = '<div class="status-empty">ไม่พบข้อมูล กรุณาตรวจสอบเบอร์โทร</div>'; return; }
    out.innerHTML =
      (regs.length ? `<div class="status-section-label">การสมัครร่วมงาน</div>${regs.map(regCard).join('')}` : '') +
      (orders.length ? `<div class="status-section-label">การสั่งเสื้อ</div>${orders.map(orderCard).join('')}` : '');
    out.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => {
      const d = docs.find(x => x && x.id === b.dataset.slip);
      openUpload({ id: d.id, type: d.t, name: `${d.firstName} ${d.lastName}`, total: d.total }, searchStatus);
    });
    tickCountdowns();
  } catch (err) {
    console.error(err);
    out.innerHTML = '<div class="status-empty">ค้นหาไม่สำเร็จ กรุณาลองใหม่</div>';
  }
}
const badge = s => `<div class="status-badge ${STATUS[s]?.badge || 'badge-wait'}">${STATUS[s]?.label || esc(s)}</div>`;
function slipRow(d, isReg) {
  if (d.status === 'pending') {
    const dl = isReg ? deadlineMs(EV, d) : 0;
    return `<div class="status-divider"></div>
      ${dl ? `<div class="countdown" data-deadline="${dl}"></div>` : ''}
      <div class="status-slip-row"><div class="status-slip-icon slip-icon-wait">📎</div>
      <div class="status-slip-text">ยังไม่ได้แนบสลิป · ยอด ฿${d.total}</div>
      <button class="slip-attach-btn" data-slip="${esc(d.id)}">แนบสลิป</button></div>`;
  }
  if (d.status === 'slip') return `<div class="status-divider"></div><div class="status-slip-row"><div class="status-slip-icon slip-icon-done">✅</div>
      <div class="status-slip-text">ส่งสลิปแล้ว รอทีมงานยืนยัน</div><button class="slip-attach-btn ghost" data-slip="${esc(d.id)}">แนบใหม่</button></div>`;
  if (d.status === 'reserve') return `<div class="status-divider"></div><div class="status-slip-row"><div class="status-slip-icon slip-icon-reserve">⏳</div>
      <div class="status-slip-text">รอทีมงานติดต่อกลับ<br><span class="muted-sm">ตอนนี้ที่นั่งเต็ม ${EV.quota} คนแล้ว หากมีผู้สละสิทธิ์ ทีมงานจะติดต่อตามลำดับคิว ยังไม่ต้องโอนเงินนะครับ</span></div></div>`;
  return '';
}
function regCard(r) {
  const extras = (r.extras || []).map((e, i) => `<br><span class="muted-sm">เสื้อเพิ่มตัวที่ ${i + 1}: ${esc(shirtNameOf(EV, e.shirt))} · ${esc(e.size)}${e.name ? ' · ' + esc(e.name) : ''}${e.num ? ' · #' + esc(e.num) : ''}</span>`).join('');
  return `<div class="status-card">
    <div class="status-card-header"><div class="status-card-id">#${esc(r.code)}</div>${badge(r.status)}</div>
    <div class="status-card-name">${esc(r.firstName)} ${esc(r.lastName)}${r.nickname ? ` <span class="muted-sm">(${esc(r.nickname)})</span>` : ''}</div>
    <div class="status-card-detail">${r.shirtSize ? `${esc(shirtNameOf(EV, r.shirt))} · ไซส์ ${esc(r.shirtSize)} · ` : ''}฿${r.total}${extras}</div>
    ${slipRow(r, true)}
    ${r.status === 'confirmed' || r.status === 'pending' || r.status === 'slip' ? lineBox() : ''}
  </div>`;
}
function orderCard(o) {
  const rd = (EV.shirtRounds || [])[o.round];
  return `<div class="status-card">
    <div class="status-card-header"><div class="status-card-id">#${esc(o.code)}</div>${badge(o.status)}</div>
    <div class="status-card-name">${esc(o.firstName)} ${esc(o.lastName)}</div>
    <div class="status-card-detail">${o.items.length} ตัว · ${rd ? esc(rd.label) + ' · ' : ''}${o.delivery === 'ship' ? 'ส่งพัสดุ' : 'รับในงาน'} · ฿${o.total}
      ${o.items.map((it, i) => `<br><span class="muted-sm">ตัวที่ ${i + 1}: ${esc(shirtNameOf(EV, it.shirt))} · ${esc(it.size)}${it.name ? ' · ' + esc(it.name) : ''}${it.num ? ' · #' + esc(it.num) : ''}</span>`).join('')}</div>
    ${slipRow(o, false)}
  </div>`;
}
function tickCountdowns() {
  document.querySelectorAll('[data-deadline]').forEach(el => {
    const left = Number(el.dataset.deadline) - Date.now();
    el.className = 'countdown' + (left <= 0 ? ' over' : left < 3 * 3600e3 ? ' soon' : '');
    el.innerHTML = left > 0
      ? `⏱ แนบสลิปภายใน ${fmtDate(Number(el.dataset.deadline))} น. · <strong>${fmtLeft(left)}</strong>`
      : `⚠️ <strong>เกินกำหนดแนบสลิปแล้ว</strong> — ยังแนบได้ แต่กรุณาติดต่อทีมงานโดยด่วน สิทธิ์อาจถูกส่งต่อให้คิวสำรอง`;
  });
}

// ── แนบสลิป ──────────────────────────────────────────
function openUpload(target, onDone) {
  let file = null;
  const bg = document.createElement('div');
  bg.className = 'upload-modal-bg';
  bg.innerHTML = `<div class="upload-modal">
    <div class="upload-modal-title">แนบสลิปการโอน</div>
    <div class="upload-modal-sub">${esc(target.name)} · ยอด ฿${target.total}</div>
    <label class="upload-zone" id="uz"><input type="file" accept="image/*" hidden id="uz-in">
      <div class="upload-zone-icon" id="uz-icon">📎</div><div class="upload-zone-text" id="uz-text">แตะเพื่อเลือกรูปสลิป</div>
      <img id="uz-prev" style="display:none;max-height:180px;margin:.5rem auto 0;border-radius:6px" alt=""></label>
    <button class="upload-confirm-btn" id="uz-ok" disabled>อัปโหลดสลิป</button>
    <button class="upload-cancel-btn" id="uz-cancel">ยกเลิก</button></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) close(); };
  $('uz-cancel').onclick = close;
  $('uz-in').onchange = e => {
    file = e.target.files[0]; if (!file) return;
    $('uz').classList.add('has-file'); $('uz-icon').textContent = '✅'; $('uz-text').textContent = file.name;
    const p = $('uz-prev'); p.src = URL.createObjectURL(file); p.style.display = 'block';
    $('uz-ok').disabled = false;
  };
  $('uz-ok').onclick = async () => {
    const btn = $('uz-ok'); btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
    try {
      const url = await uploadImage(file, EID, 'slips', `slip_${target.type}_${target.id}`);
      btn.textContent = 'กำลังบันทึก...';
      await updateDoc(target.type === 'r' ? ref.reg(EID, target.id) : ref.shirt(EID, target.id),
        { slipUrl: url, slipAt: serverTimestamp(), status: 'slip' });
      toast('แนบสลิปสำเร็จ ✓');
      close(); onDone && onDone();
    } catch (err) {
      console.error(err);
      toast('อัปโหลดไม่สำเร็จ กรุณาลองใหม่', 3500);
      btn.disabled = false; btn.textContent = 'อัปโหลดสลิป';
    }
  };
}

init();
