// หน้า Admin
import {
  db, auth, googleProvider, data, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, runTransaction, serverTimestamp, Timestamp, query, orderBy,
  signInWithPopup, signOut, onAuthStateChanged
} from './fb.js';
import {
  DEFAULT_EVENT, NEW_COUNTERS, ref, STATUS, HOLDS_SEAT, counterKey, sizeSurcharge, shirtNameOf,
  regTotal, orderTotal, ms, deadlineMs, fmtLeft, fmtDate, esc, normPhone, validPhone, nameKey, phoneHash,
  codeOf, driveUrl, uploadImage, toast, viewImg, shirtSVG
} from './common.js';

const $ = id => document.getElementById(id);
const root = $('admin-root');
let USER = null, EID = '', EV = null, C = null, SITE = {};
let EVENTS = [], REGS = [], ORDERS = [], SPONSORS = [];
let tab = 'overview', unsubs = [];
let regFilter = 'all', regSearch = '', orderFilter = 'all', orderSearch = '';
let shirtF = { status: 'active', source: 'all', round: 'all' };
let draft = null;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ── AUTH ─────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  USER = user;
  unsubs.forEach(u => u()); unsubs = [];
  $('admin-nav').style.display = 'none'; $('ev-select').style.display = 'none';
  if (!user) {
    $('admin-user').innerHTML = '';
    root.innerHTML = `<div class="admin-login"><div style="font-size:32px;margin-bottom:.4rem">🧤</div><h2>Admin Panel</h2>
      <p>Goalkeeper Meeting</p><button class="login-btn" id="g-login">เข้าสู่ระบบด้วย Google</button></div>`;
    $('g-login').onclick = () => signInWithPopup(auth, googleProvider).catch(e => toast('เข้าสู่ระบบไม่สำเร็จ: ' + e.code, 4000));
    return;
  }
  $('admin-user').innerHTML = `<span class="muted-sm">${esc(user.email)}</span> <button class="link-btn" id="logout">ออก</button>`;
  $('logout').onclick = () => signOut(auth);
  let ok = false;
  try { ok = (await getDoc(ref.admin(user.email))).exists(); } catch (e) { console.error(e); }
  if (!ok) {
    root.innerHTML = `<div class="admin-login"><div style="font-size:32px">⛔</div><h2>ไม่มีสิทธิ์เข้าหน้านี้</h2>
      <p>บัญชี <strong>${esc(user.email)}</strong> ยังไม่ได้อยู่ในรายชื่อทีมงาน<br>ให้ Admin เพิ่มอีเมลนี้ในแท็บ "ทีมงาน" ก่อนครับ</p></div>`;
    return;
  }
  await loadEvents();
});

async function loadEvents(selectId) {
  const [evs, site] = await Promise.all([getDocs(ref.events()), getDoc(ref.site()).catch(() => null)]);
  EVENTS = evs.docs.map(d => ({ id: d.id, name: data(d).name }));
  SITE = site && site.exists() ? data(site) : {};
  if (!EVENTS.length) return renderFirstEvent();
  const want = selectId || store.get('gkm-admin-eid');
  const pick = EVENTS.find(e => e.id === want) ? want : (EVENTS.find(e => e.id === SITE.activeEvent) ? SITE.activeEvent : EVENTS[0].id);
  const sel = $('ev-select');
  sel.innerHTML = EVENTS.map(e => `<option value="${esc(e.id)}">${esc(e.name)}${e.id === SITE.activeEvent ? ' ★' : ''}</option>`).join('') + '<option value="__new">+ สร้างงานใหม่...</option>';
  sel.style.display = '';
  sel.onchange = () => { if (sel.value === '__new') { sel.value = EID; newEventModal(); } else selectEvent(sel.value); };
  $('admin-nav').style.display = '';
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draft = null; render(); });
  selectEvent(pick);
}

function renderFirstEvent() {
  root.innerHTML = `<div class="admin-section" style="max-width:480px;margin:1rem auto">
    <div class="admin-title">🎉 สร้างงานแรก</div>
    <div class="field"><label>รหัสงาน (ใช้ในลิงก์ ภาษาอังกฤษ/ตัวเลข)</label><input id="fe-id" value="buriram-2026"></div>
    <div class="field"><label>ชื่องาน</label><input id="fe-name" value="${esc(DEFAULT_EVENT.name)}"></div>
    <button class="add-btn-sm" id="fe-go">สร้างงาน</button></div>`;
  $('fe-go').onclick = async () => {
    const id = slug($('fe-id').value);
    if (!id) return toast('กรุณาใส่รหัสงาน');
    await createEvent(id, { ...DEFAULT_EVENT, name: $('fe-name').value.trim() || DEFAULT_EVENT.name });
    await setDoc(ref.site(), { activeEvent: id });
    loadEvents(id);
  };
}
const slug = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
async function createEvent(id, cfg) {
  const { createdAt, ...rest } = cfg;
  await setDoc(ref.event(id), { ...rest, createdAt: serverTimestamp() });
  await setDoc(ref.counters(id), { ...NEW_COUNTERS });
}

function newEventModal() {
  modal(`<div class="upload-modal-title">สร้างงานใหม่</div>
    <div class="field"><label>รหัสงาน (เช่น khonkaen-2027)</label><input id="ne-id" placeholder="event-2027"></div>
    <div class="field"><label>ชื่องาน</label><input id="ne-name" placeholder="Goalkeeper Meeting ..."></div>
    <label class="check-row"><input type="checkbox" id="ne-copy" checked> คัดลอกการตั้งค่า (ราคา เสื้อ บัญชี ฯลฯ) จากงานนี้</label>
    <div class="muted-sm" style="margin:.5rem 0">งานใหม่จะยังปิดรับสมัครอยู่ ไปตั้งค่าแล้วค่อยเปิดครับ</div>
    <button class="upload-confirm-btn" id="ne-go">สร้าง</button>`, m => {
    $('ne-go').onclick = async () => {
      const id = slug($('ne-id').value), name = $('ne-name').value.trim();
      if (!id || !name) return toast('กรุณาใส่รหัสและชื่องาน');
      if (EVENTS.some(e => e.id === id)) return toast('รหัสงานนี้มีอยู่แล้ว');
      const base = $('ne-copy').checked && EV ? { ...EV } : { ...DEFAULT_EVENT };
      await createEvent(id, { ...base, name, registrationOpen: false, shirtOrderOpen: false });
      m.close(); toast('สร้างงานแล้ว'); loadEvents(id);
    };
  });
}

// ── SUBSCRIBE ────────────────────────────────────────
function selectEvent(eid) {
  unsubs.forEach(u => u()); unsubs = [];
  EID = eid; EV = null; C = null; REGS = []; ORDERS = []; SPONSORS = []; draft = null;
  store.set('gkm-admin-eid', eid);
  $('ev-select').value = eid;
  root.innerHTML = '<div class="loader">กำลังโหลด...</div>';
  const onErr = e => { console.error(e); toast('โหลดข้อมูลไม่สำเร็จ: ' + (e.code || e.message), 4000); };
  unsubs.push(onSnapshot(ref.event(eid), s => { EV = data(s); if (tab !== 'settings' || !draft) schedule(); }, onErr));
  unsubs.push(onSnapshot(ref.counters(eid), s => { C = s.exists() ? data(s) : { ...NEW_COUNTERS }; schedule(); }, onErr));
  unsubs.push(onSnapshot(query(ref.regs(eid), orderBy('seq')), s => { REGS = s.docs.map(d => ({ id: d.id, ...data(d) })); schedule(); }, onErr));
  unsubs.push(onSnapshot(query(ref.shirts(eid), orderBy('seq')), s => { ORDERS = s.docs.map(d => ({ id: d.id, ...data(d) })); schedule(); }, onErr));
  unsubs.push(onSnapshot(query(ref.sponsors(eid), orderBy('order')), s => { SPONSORS = s.docs.map(d => ({ id: d.id, ...data(d) })); schedule(); }, onErr));
}
let pending = false;
function schedule() {
  if (pending) return; pending = true;
  requestAnimationFrame(() => { pending = false; if (tab === 'settings' && draft) return; render(); });
}
setInterval(() => { if (tab === 'regs' || tab === 'overview') render(); }, 60e3);

function render() {
  if (!EV || !C) return;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ({ overview: renderOverview, regs: renderRegs, orders: renderOrders, shirts: renderShirts, sponsors: renderSponsors, settings: renderSettings, team: renderTeam })[tab]();
}

// ── คำนวณ ────────────────────────────────────────────
const now = () => Date.now();
const isOverdue = r => r.status === 'pending' && deadlineMs(EV, r) > 0 && deadlineMs(EV, r) < now();
const reserveQueue = () => REGS.filter(r => r.status === 'reserve').sort((a, b) => a.seq - b.seq);
const seatsUsed = () => (C.pending || 0) + (C.confirmed || 0);
function actualCounts() {
  const n = s => REGS.filter(r => r.status === s).length;
  return { pending: n('pending') + n('slip'), confirmed: n('confirmed'), reserve: n('reserve') };
}
const fullName = r => `${r.firstName || ''} ${r.lastName || ''}`.trim();
const tel = p => `<a href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${esc(p)}</a>`;

// ── ภาพรวม ───────────────────────────────────────────
function renderOverview() {
  const a = actualCounts();
  const slip = REGS.filter(r => r.status === 'slip').length;
  const oSlip = ORDERS.filter(o => o.status === 'slip').length;
  const over = REGS.filter(isOverdue);
  const free = EV.quota - seatsUsed();
  const q = reserveQueue();
  const drift = a.pending !== C.pending || a.confirmed !== C.confirmed || a.reserve !== C.reserve;
  const money = [...REGS, ...ORDERS].filter(x => x.status === 'confirmed').reduce((s, x) => s + (Number(x.total) || 0), 0);
  const link = publicLink();
  root.innerHTML = `
    <div class="admin-section">
      <div class="admin-title">${esc(EV.name)}</div>
      <div class="toggle-row">
        <label class="switch-row"><input type="checkbox" data-toggle="registrationOpen" ${EV.registrationOpen ? 'checked' : ''}><span>เปิดรับสมัคร</span></label>
        <label class="switch-row"><input type="checkbox" data-toggle="shirtOrderOpen" ${EV.shirtOrderOpen ? 'checked' : ''}><span>เปิดสั่งเสื้อ</span></label>
      </div>
      <div class="link-row"><input readonly value="${esc(link)}" id="pub-link"><button class="cfg-upload-btn" id="copy-link">คัดลอกลิงก์</button><a class="cfg-upload-btn" href="${esc(link)}" target="_blank">เปิด</a></div>
      ${SITE.activeEvent !== EID ? `<button class="link-btn" id="set-active">★ ตั้งเป็นงานหลัก (ลิงก์ไม่ต้องมี ?e=)</button>` : '<div class="muted-sm">★ งานหลัก</div>'}
    </div>
    ${slip ? `<div class="alert alert-blue" data-goto="regs:slip">📎 มีสลิปผู้สมัครรอตรวจ <strong>${slip}</strong> รายการ →</div>` : ''}
    ${oSlip ? `<div class="alert alert-blue" data-goto="orders:slip">👕 มีสลิปสั่งเสื้อรอตรวจ <strong>${oSlip}</strong> รายการ →</div>` : ''}
    ${over.length ? `<div class="alert alert-red" data-goto="regs:overdue">⏰ เกินกำหนดแนบสลิป <strong>${over.length}</strong> คน →</div>` : ''}
    ${free > 0 && q.length ? `<div class="alert alert-gold">🪑 ว่าง <strong>${free}</strong> ที่ · คิวสำรองถัดไป: <strong>${esc(fullName(q[0]))}</strong> ${tel(q[0].phone)}
       <button class="mini-btn" data-act="promote" data-id="${q[0].id}">เลื่อนขึ้น</button></div>` : ''}
    ${drift ? `<div class="alert alert-red">⚠️ ตัวนับที่นั่งไม่ตรงกับรายชื่อจริง <button class="mini-btn" id="fix-counters">ซ่อมตัวนับ</button></div>` : ''}
    <div class="kpi-grid">
      ${kpi('ที่นั่ง', `${seatsUsed()}/${EV.quota}`, 'var(--dark)')}
      ${kpi('ยืนยันแล้ว', C.confirmed, '#1D9E75')}
      ${kpi('รอแนบสลิป', REGS.filter(r => r.status === 'pending').length, '#854F0B')}
      ${kpi('รอตรวจสลิป', slip, '#185FA5')}
      ${kpi('ตัวสำรอง', C.reserve, '#5F5E5A')}
      ${kpi('ออเดอร์เสื้อ', ORDERS.filter(o => o.status !== 'cancelled').length, 'var(--gd)')}
      ${kpi('เสื้อทั้งหมด', shirtItems('active', 'all', 'all').length + ' ตัว', 'var(--red)')}
      ${kpi('ยอดยืนยันแล้ว', '฿' + money.toLocaleString(), '#1D9E75')}
    </div>`;
  root.querySelectorAll('[data-toggle]').forEach(el => el.onchange = async () => {
    await updateDoc(ref.event(EID), { [el.dataset.toggle]: el.checked });
    toast(el.checked ? 'เปิดแล้ว' : 'ปิดแล้ว');
  });
  $('copy-link').onclick = () => { navigator.clipboard?.writeText(link); toast('คัดลอกลิงก์แล้ว'); };
  if ($('set-active')) $('set-active').onclick = async () => { await setDoc(ref.site(), { activeEvent: EID }); SITE.activeEvent = EID; toast('ตั้งเป็นงานหลักแล้ว'); loadEvents(EID); };
  if ($('fix-counters')) $('fix-counters').onclick = fixCounters;
  root.querySelectorAll('[data-goto]').forEach(el => el.onclick = e => {
    if (e.target.closest('[data-act]')) return;
    const [t, f] = el.dataset.goto.split(':'); tab = t;
    if (t === 'regs') regFilter = f; else orderFilter = f;
    render();
  });
}
const kpi = (l, n, c) => `<div class="summ-card"><div class="summ-n" style="color:${c}">${n}</div><div class="summ-l">${l}</div></div>`;
function publicLink() {
  const base = location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
  return SITE.activeEvent === EID ? base : `${base}?e=${EID}`;
}
async function fixCounters() {
  const a = actualCounts();
  const maxSeq = REGS.reduce((m, r) => Math.max(m, r.seq || 0), C.regSeq || 0);
  const maxShirt = ORDERS.reduce((m, o) => Math.max(m, o.seq || 0), C.shirtSeq || 0);
  await updateDoc(ref.counters(EID), { ...a, regSeq: maxSeq, shirtSeq: maxShirt });
  toast('ซ่อมตัวนับแล้ว');
}

// ── ผู้สมัคร ─────────────────────────────────────────
const REG_FILTERS = [
  ['all', 'ทั้งหมด', r => r.status !== 'cancelled'],
  ['slip', 'รอตรวจสลิป', r => r.status === 'slip'],
  ['pending', 'รอแนบสลิป', r => r.status === 'pending'],
  ['overdue', 'เกินกำหนด', isOverdue],
  ['confirmed', 'ยืนยันแล้ว', r => r.status === 'confirmed'],
  ['reserve', 'ตัวสำรอง', r => r.status === 'reserve'],
  ['cancelled', 'ยกเลิก', r => r.status === 'cancelled']
];
function renderRegs() {
  if (!$('regs-list')) {
    root.innerHTML = `
      <div class="admin-toolbar">
        <input class="search-in" id="reg-q" placeholder="🔍 ค้นหา ชื่อ / เบอร์ / เลขสมัคร" value="${esc(regSearch)}">
        <button class="cfg-upload-btn" id="pre-open">+ เพิ่มล่วงหน้า</button>
      </div>
      <div class="sf-bar" id="reg-filters"></div>
      <div id="regs-list"></div>`;
    $('reg-q').oninput = e => { regSearch = e.target.value; renderRegs(); };
    $('pre-open').onclick = preRegModal;
  }
  $('reg-filters').innerHTML = REG_FILTERS.map(([k, l, f]) => `<button class="sf-btn${regFilter === k ? ' active' : ''}" data-f="${k}">${l} <span class="cnt">${REGS.filter(f).length}</span></button>`).join('');
  $('reg-filters').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { regFilter = b.dataset.f; renderRegs(); });
  const f = REG_FILTERS.find(x => x[0] === regFilter)[2];
  const qs = regSearch.trim().toLowerCase(), qd = normPhone(qs);
  let list = REGS.filter(f).filter(r => !qs || (fullName(r) + ' ' + (r.nickname || '') + ' ' + r.code).toLowerCase().includes(qs) || (qd.length >= 3 && normPhone(r.phone).includes(qd)));
  if (regFilter === 'reserve') list = list.sort((a, b) => a.seq - b.seq);
  const queue = reserveQueue().map(r => r.id);
  $('regs-list').innerHTML = list.length ? list.map(r => regCard(r, queue.indexOf(r.id))).join('') : '<div class="status-empty">ไม่มีรายการ</div>';
}
function regCard(r, qpos) {
  const calc = regTotal(EV, r), mismatch = !r.preReg && calc !== Number(r.total);
  const dl = deadlineMs(EV, r), left = dl - now();
  const extras = (r.extras || []).map((e, i) => `<div class="muted-sm">+ เสื้อเพิ่ม ${i + 1}: ${esc(shirtNameOf(EV, e.shirt))} / ${esc(e.size)}${e.name ? ' / ' + esc(e.name) : ''}${e.num ? ' / #' + esc(e.num) : ''}</div>`).join('');
  const acts = [];
  if (r.status === 'slip') acts.push(btn('confirm', r.id, '✓ ยืนยัน', 'ok'), btn('reject', r.id, 'สลิปไม่ผ่าน'));
  if (r.status === 'pending') acts.push(btn('confirm', r.id, '✓ รับเงินแล้ว', 'ok'), btn('extend', r.id, '⏱ ขยายเวลา'));
  if (r.status === 'reserve') acts.push(btn('promote', r.id, '⬆ เลื่อนขึ้นเป็นผู้สมัคร', qpos === 0 ? 'ok' : ''));
  if (r.status === 'cancelled') acts.push(btn('restore', r.id, '↺ กู้คืน'));
  if (r.status !== 'cancelled') acts.push(btn('cancel', r.id, 'ยกเลิก', 'danger'));
  acts.push(btn('edit', r.id, '✎ แก้ไข'));
  return `<div class="rcard ${r.status}${isOverdue(r) ? ' overdue' : ''}">
    <div class="rcard-top">
      <span class="reg-id-badge">${esc(r.code)}</span>
      <div class="status-badge ${STATUS[r.status]?.badge}">${STATUS[r.status]?.label}</div>
      ${qpos >= 0 ? `<span class="q-badge">คิวสำรองที่ ${qpos + 1}</span>` : ''}
      ${r.preReg ? '<span class="q-badge">ล่วงหน้า</span>' : ''}
      <span class="muted-sm" style="margin-left:auto">${fmtDate(r.createdAt)}</span>
    </div>
    <div class="rcard-body">
      <div class="rcard-main">
        <div class="reg-name">${esc(fullName(r))}${r.nickname ? ` <span class="muted-sm">(${esc(r.nickname)})</span>` : ''}${r.age ? ` <span class="muted-sm">· ${esc(r.age)} ปี${Number(r.age) < EV.youthAge ? ' · เยาวชน' : ''}</span>` : ''}</div>
        <div class="muted-sm">📞 ${tel(r.phone)}${r.platform ? ` · ${esc(r.platform)}: ${esc(r.platformId)}` : ''}${r.registeredBy ? ` · สมัครแทนโดย ${esc(r.registeredBy)}` : ''}</div>
        ${r.shirtSize ? `<div class="muted-sm">👕 ${esc(shirtNameOf(EV, r.shirt))} / ${esc(r.shirtSize)}${r.shirtName ? ' / ' + esc(r.shirtName) : ''}${r.shirtNumber ? ' / #' + esc(r.shirtNumber) : ''}</div>` : ''}
        ${extras}
        <div class="muted-sm">💰 ฿${Number(r.total).toLocaleString()}${mismatch ? ` <span class="warn-tag">ราคาที่ควรเป็น ฿${calc}</span>` : ''}</div>
        ${dl ? `<div class="countdown${left <= 0 ? ' over' : left < 3 * 3600e3 ? ' soon' : ''}">⏱ กำหนดแนบสลิป ${fmtDate(dl)} · ${fmtLeft(left)}${r.deadlineOverride ? ' (ขยายแล้ว)' : ''}</div>` : ''}
        ${r.note ? `<div class="note-line">📝 ${esc(r.note)}</div>` : ''}
      </div>
      ${r.slipUrl ? `<img class="slip-thumb" src="${esc(r.slipUrl)}" data-view="${esc(r.slipUrl)}" alt="สลิป" title="ดูสลิป">` : ''}
    </div>
    <div class="rcard-acts">${acts.join('')}</div>
  </div>`;
}
const btn = (act, id, label, cls = '') => `<button class="act-btn ${cls}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;

// ── เปลี่ยนสถานะผู้สมัคร (transaction คุมตัวนับที่นั่ง) ─────
async function setRegStatus(id, next, force = false) {
  return runTransaction(db, async tx => {
    const rS = await tx.get(ref.reg(EID, id));
    const cS = await tx.get(ref.counters(EID));
    const r = data(rS), c = data(cS), prev = r.status;
    if (prev === next) return;
    let nS = null;
    if (prev === 'cancelled') nS = await tx.get(ref.name(EID, r.nameKey));
    if (nS && nS.exists()) throw new Error('DUP');
    if (!HOLDS_SEAT(prev) && HOLDS_SEAT(next) && !force && (c.pending + c.confirmed) >= EV.quota) throw new Error('FULL');
    const cu = {}, kp = counterKey(prev), kn = counterKey(next);
    if (kp !== kn) {
      if (kp) cu[kp] = Math.max(0, (c[kp] || 0) - 1);
      if (kn) cu[kn] = (c[kn] || 0) + 1;
    }
    const upd = { status: next };
    if (next === 'pending' && (prev === 'reserve' || prev === 'cancelled'))
      upd.deadlineOverride = Timestamp.fromMillis(now() + (EV.slipHours || 24) * 3600e3);
    tx.update(ref.reg(EID, id), upd);
    if (Object.keys(cu).length) tx.update(ref.counters(EID), cu);
    if (next === 'cancelled') tx.delete(ref.name(EID, r.nameKey));
    if (prev === 'cancelled') tx.set(ref.name(EID, r.nameKey), { at: serverTimestamp() });
  });
}
async function changeStatus(id, next) {
  try { await setRegStatus(id, next); return true; }
  catch (e) {
    if (e.message === 'FULL') {
      if (confirm(`ที่นั่งเต็ม ${EV.quota} คนแล้ว — ต้องการเพิ่มเกินโควตาหรือไม่?`)) { await setRegStatus(id, next, true); return true; }
      return false;
    }
    if (e.message === 'DUP') { toast('มีคนชื่อนี้สมัครอยู่แล้ว กู้คืนไม่ได้', 4000); return false; }
    console.error(e); toast('เกิดข้อผิดพลาด: ' + e.message, 4000); return false;
  }
}
const findReg = id => REGS.find(r => r.id === id);
const ACTIONS = {
  async confirm(id) { if (await changeStatus(id, 'confirmed')) toast('ยืนยันแล้ว ✓'); },
  async reject(id) {
    if (!confirm('สลิปไม่ผ่าน → กลับเป็น "รอแนบสลิป" ?')) return;
    await updateDoc(ref.reg(EID, id), { status: 'pending' }); toast('ส่งกลับเป็นรอแนบสลิปแล้ว');
  },
  async cancel(id) {
    const r = findReg(id);
    if (!confirm(`ยกเลิกการสมัครของ ${fullName(r)} (${r.code}) ?`)) return;
    if (!await changeStatus(id, 'cancelled')) return;
    const q = reserveQueue().filter(x => x.id !== id);
    toast(HOLDS_SEAT(r.status) && q.length ? `ยกเลิกแล้ว — คิวสำรองถัดไป: ${fullName(q[0])} ${q[0].phone}` : 'ยกเลิกแล้ว', 5000);
  },
  async restore(id) {
    const next = seatsUsed() < EV.quota ? 'pending' : 'reserve';
    if (await changeStatus(id, next)) toast(next === 'pending' ? 'กู้คืนแล้ว (รอแนบสลิป)' : 'ที่นั่งเต็ม — กู้คืนเป็นตัวสำรอง');
  },
  async promote(id) {
    const r = findReg(id), q = reserveQueue();
    if (q[0] && q[0].id !== id && !confirm(`${fullName(r)} ไม่ใช่คิวแรก (คิวแรกคือ ${fullName(q[0])}) — เลื่อนขึ้นต่อหรือไม่?`)) return;
    if (await changeStatus(id, 'pending')) toast(`เลื่อน ${fullName(r)} แล้ว — มีเวลาแนบสลิป ${EV.slipHours || 24} ชม. อย่าลืมแจ้ง ${r.phone}`, 5000);
  },
  extend: id => extendModal(findReg(id)),
  edit: id => editModal(findReg(id)),
  async del(id) {
    const r = findReg(id);
    if (!confirm(`ลบ ${r.code} ${fullName(r)} ถาวร? (ถ้าแค่ไม่มาให้ใช้ "ยกเลิก")`)) return;
    const h = await phoneHash(EID, r.phone);
    await runTransaction(db, async tx => {
      const rS = await tx.get(ref.reg(EID, id)), cS = await tx.get(ref.counters(EID)), lS = await tx.get(ref.lookup(EID, h));
      const cur = data(rS), c = data(cS), k = counterKey(cur.status);
      if (k) tx.update(ref.counters(EID), { [k]: Math.max(0, (c[k] || 0) - 1) });
      if (cur.status !== 'cancelled') tx.delete(ref.name(EID, cur.nameKey));
      if (lS.exists()) tx.update(ref.lookup(EID, h), { refs: (data(lS).refs || []).filter(x => x !== 'r:' + id) });
      tx.delete(ref.reg(EID, id));
    });
    toast('ลบแล้ว'); closeModal();
  },
  // สั่งเสื้อ
  async oconfirm(id) { await updateDoc(ref.shirt(EID, id), { status: 'confirmed' }); toast('ยืนยันแล้ว ✓'); },
  async oreject(id) { if (confirm('สลิปไม่ผ่าน → กลับเป็น "รอแนบสลิป" ?')) { await updateDoc(ref.shirt(EID, id), { status: 'pending' }); toast('ส่งกลับแล้ว'); } },
  async ocancel(id) { if (confirm('ยกเลิกออเดอร์นี้?')) { await updateDoc(ref.shirt(EID, id), { status: 'cancelled' }); toast('ยกเลิกแล้ว'); } },
  async orestore(id) { await updateDoc(ref.shirt(EID, id), { status: 'pending' }); toast('กู้คืนแล้ว'); },
  async ohand(id) { const o = ORDERS.find(x => x.id === id); await updateDoc(ref.shirt(EID, id), { handedOver: !o.handedOver }); },
  async onote(id) {
    const o = ORDERS.find(x => x.id === id), n = prompt('หมายเหตุ / เลขพัสดุ', o.note || '');
    if (n !== null) await updateDoc(ref.shirt(EID, id), { note: n.trim() });
  },
  async odel(id) {
    const o = ORDERS.find(x => x.id === id);
    if (!confirm(`ลบออเดอร์ ${o.code} ถาวร?`)) return;
    const h = await phoneHash(EID, o.phone);
    await runTransaction(db, async tx => {
      const lS = await tx.get(ref.lookup(EID, h));
      if (lS.exists()) tx.update(ref.lookup(EID, h), { refs: (data(lS).refs || []).filter(x => x !== 's:' + id) });
      tx.delete(ref.shirt(EID, id));
    });
    toast('ลบแล้ว');
  },
  // ผู้สนับสนุน
  async spdel(id) { if (confirm('ลบผู้สนับสนุนนี้?')) { await deleteDoc(ref.sponsor(EID, id)); toast('ลบแล้ว'); } },
  async spup(id) { moveSponsor(id, -1); },
  async spdown(id) { moveSponsor(id, 1); }
};
root.addEventListener('click', async e => {
  const v = e.target.closest('[data-view]'); if (v) return viewImg(v.dataset.view);
  const b = e.target.closest('[data-act]'); if (!b || !ACTIONS[b.dataset.act]) return;
  b.disabled = true;
  try { await ACTIONS[b.dataset.act](b.dataset.id, b); }
  catch (err) { console.error(err); toast('เกิดข้อผิดพลาด: ' + (err.code || err.message), 4000); }
  finally { b.disabled = false; }
});

// ── Modal ────────────────────────────────────────────
let openModal = null;
function modal(html, bind) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'upload-modal-bg center';
  bg.innerHTML = `<div class="upload-modal wide">${html}<button class="upload-cancel-btn" data-close>ปิด</button></div>`;
  document.body.appendChild(bg);
  const m = { el: bg, close: () => bg.remove() };
  bg.onclick = e => { if (e.target === bg || e.target.closest('[data-close]')) m.close(); };
  bg.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || !ACTIONS[b.dataset.act]) return;
    try { await ACTIONS[b.dataset.act](b.dataset.id, b); } catch (err) { toast('เกิดข้อผิดพลาด: ' + err.message); }
  });
  openModal = m; bind && bind(m);
  return m;
}
const closeModal = () => { if (openModal) { openModal.close(); openModal = null; } };

function extendModal(r) {
  const cur = deadlineMs(EV, r);
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  modal(`<div class="upload-modal-title">ขยายเวลาแนบสลิป</div>
    <div class="upload-modal-sub">${esc(r.code)} · ${esc(fullName(r))}<br>กำหนดเดิม: <strong>${fmtDate(cur)}</strong> (${fmtLeft(cur - now())})</div>
    <div class="ext-grid">
      <button class="act-btn" data-h="12">+12 ชม.</button><button class="act-btn" data-h="24">+24 ชม.</button><button class="act-btn" data-h="48">+48 ชม.</button>
    </div>
    <div class="muted-sm" style="margin:.4rem 0 .8rem">นับต่อจากกำหนดเดิม (ถ้าเลยกำหนดไปแล้ว นับจากตอนนี้)</div>
    <div class="field"><label>หรือกำหนดวันเวลาเอง</label><input type="datetime-local" id="ext-at" value="${local(new Date(Math.max(cur, now()) + 24 * 3600e3))}"></div>
    <button class="upload-confirm-btn" id="ext-go">บันทึกวันเวลาที่กำหนดเอง</button>`, m => {
    const save = async t => {
      await updateDoc(ref.reg(EID, r.id), { deadlineOverride: Timestamp.fromMillis(t) });
      toast('ขยายเวลาถึง ' + fmtDate(t)); m.close();
    };
    m.el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => save(Math.max(cur, now()) + Number(b.dataset.h) * 3600e3));
    $('ext-go').onclick = () => { const t = new Date($('ext-at').value).getTime(); if (t > now()) save(t); else toast('ต้องเป็นเวลาในอนาคต'); };
  });
}

function preRegModal() {
  modal(`<div class="upload-modal-title">เพิ่มผู้สมัครล่วงหน้า</div>
    <div class="upload-modal-sub">จองที่นั่งให้ก่อน แล้วค่อยแก้ข้อมูลเสื้อทีหลังด้วยปุ่ม "แก้ไข"</div>
    <div class="add-form"><input id="pre-name" placeholder="ชื่อ นามสกุล"><input id="pre-phone" type="tel" placeholder="เบอร์โทร"></div>
    <div class="field"><label>ให้เวลาแนบสลิป (ชั่วโมง)</label><input id="pre-h" type="number" value="48"></div>
    <button class="upload-confirm-btn" id="pre-go">+ เพิ่ม 1 คน</button>
    <div class="muted-sm" style="margin-top:.75rem">นำเข้าหลายคน (ชื่อ,เบอร์ บรรทัดละคน)</div>
    <textarea class="bulk-area" id="pre-bulk" placeholder="สมชาย ใจดี,081-234-5678&#10;วิชัย มั่นคง,082-345-6789"></textarea>
    <button class="bulk-btn-sm" id="pre-bulk-go">นำเข้าหลายคน</button>`, m => {
    const hours = () => Number($('pre-h').value) || 48;
    $('pre-go').onclick = async () => {
      const n = $('pre-name').value.trim(), p = $('pre-phone').value.trim();
      if (!n || !validPhone(p)) return toast('กรุณาใส่ชื่อและเบอร์โทรให้ถูกต้อง');
      try { const s = await addPreReg(n, p, hours()); toast(`เพิ่ม ${n} แล้ว${s === 'reserve' ? ' (เป็นตัวสำรองเพราะเต็ม)' : ''}`); m.close(); }
      catch (e) { toast(e.message === 'DUP' ? 'ชื่อนี้สมัครแล้ว' : 'ผิดพลาด: ' + e.message, 4000); }
    };
    $('pre-bulk-go').onclick = async () => {
      const rows = $('pre-bulk').value.split('\n').map(l => l.split(',').map(s => s.trim())).filter(r => r[0]);
      let ok = 0; const fail = [];
      for (const [n, p] of rows) {
        try { if (!validPhone(p)) throw new Error('เบอร์ไม่ถูก'); await addPreReg(n, p, hours()); ok++; }
        catch (e) { fail.push(`${n} (${e.message === 'DUP' ? 'ซ้ำ' : e.message})`); }
      }
      toast(`เพิ่มแล้ว ${ok} คน${fail.length ? ' · ไม่สำเร็จ: ' + fail.join(', ') : ''}`, 6000);
      if (!fail.length) m.close();
    };
  });
}
async function addPreReg(full, phone, hours) {
  const [fn, ...rest] = full.split(/\s+/); const ln = rest.join(' ');
  const key = nameKey(fn, ln), h = await phoneHash(EID, phone);
  const rRef = doc(ref.regs(EID));
  return runTransaction(db, async tx => {
    const cS = await tx.get(ref.counters(EID)), nS = await tx.get(ref.name(EID, key)), lS = await tx.get(ref.lookup(EID, h));
    if (nS.exists()) throw new Error('DUP');
    const c = data(cS), seq = c.regSeq + 1;
    const status = (c.pending + c.confirmed) < EV.quota ? 'pending' : 'reserve';
    tx.set(rRef, {
      code: codeOf(EV.idPrefix, seq), seq, createdAt: serverTimestamp(),
      firstName: fn, lastName: ln, nameKey: key, phone, age: null, nickname: '', registeredBy: '',
      platform: '', platformId: '', shirt: 0, shirtSize: '', shirtName: '', shirtNumber: '', extras: [],
      total: Number(EV.entryFee) || 0, status, slipUrl: '', slipAt: null,
      deadlineOverride: status === 'pending' ? Timestamp.fromMillis(now() + hours * 3600e3) : null,
      preReg: true, note: 'สมัครล่วงหน้า (Admin)'
    });
    tx.update(ref.counters(EID), { regSeq: seq, [status]: (c[status] || 0) + 1, lastRegId: rRef.id });
    tx.set(ref.name(EID, key), { at: serverTimestamp() });
    tx.set(ref.lookup(EID, h), { refs: [...(lS.exists() ? data(lS).refs || [] : []), 'r:' + rRef.id] });
    return status;
  });
}

function editModal(r) {
  const sizeOpts = cur => ['', ...EV.sizes].map(s => `<option value="${esc(s)}"${cur === s ? ' selected' : ''}>${s || '-'}</option>`).join('');
  modal(`<div class="upload-modal-title">แก้ไข ${esc(r.code)}</div>
    <div class="frow"><div class="field"><label>ชื่อ</label><input id="e-fn" value="${esc(r.firstName)}"></div>
      <div class="field"><label>นามสกุล</label><input id="e-ln" value="${esc(r.lastName)}"></div></div>
    <div class="frow"><div class="field"><label>เบอร์โทร</label><input id="e-ph" value="${esc(r.phone)}"></div>
      <div class="field"><label>อายุ</label><input id="e-age" type="number" value="${esc(r.age ?? '')}"></div></div>
    <div class="frow"><div class="field"><label>ชื่อในงาน</label><input id="e-nick" value="${esc(r.nickname)}"></div>
      <div class="field"><label>สมัครแทนโดย</label><input id="e-by" value="${esc(r.registeredBy)}"></div></div>
    <div class="frow"><div class="field"><label>Platform</label><input id="e-pf" value="${esc(r.platform)}"></div>
      <div class="field"><label>ID</label><input id="e-pid" value="${esc(r.platformId)}"></div></div>
    <div class="frow"><div class="field"><label>แบบเสื้อ</label><select id="e-shirt">${EV.shirts.map((s, i) => `<option value="${i}"${Number(r.shirt) === i ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>ไซส์</label><select id="e-size">${sizeOpts(r.shirtSize)}</select></div></div>
    <div class="frow"><div class="field"><label>ชื่อหลังเสื้อ</label><input id="e-sn" value="${esc(r.shirtName)}"></div>
      <div class="field"><label>เบอร์เสื้อ</label><input id="e-num" value="${esc(r.shirtNumber)}"></div></div>
    <div class="frow"><div class="field"><label>ยอดชำระ (฿)</label><input id="e-total" type="number" value="${esc(r.total)}"></div>
      <div class="field"><label>&nbsp;</label><button class="cfg-upload-btn" id="e-calc" style="width:100%">คำนวณใหม่</button></div></div>
    <div class="field"><label>หมายเหตุ</label><input id="e-note" value="${esc(r.note)}"></div>
    ${(r.extras || []).length ? `<div class="muted-sm">เสื้อเพิ่ม ${r.extras.length} ตัว (แก้ไม่ได้ในหน้านี้)</div>` : ''}
    <button class="upload-confirm-btn" id="e-save">บันทึก</button>
    <button class="act-btn danger" data-act="del" data-id="${esc(r.id)}" style="width:100%;margin-bottom:.5rem">🗑 ลบถาวร</button>`, m => {
    $('e-calc').onclick = () => { $('e-total').value = regTotal(EV, { shirtSize: $('e-size').value, extras: r.extras }); };
    $('e-save').onclick = async () => {
      const fn = $('e-fn').value.trim(), ln = $('e-ln').value.trim(), ph = $('e-ph').value.trim();
      if (!fn || !validPhone(ph)) return toast('ชื่อ/เบอร์ไม่ถูกต้อง');
      const key = nameKey(fn, ln);
      const oldH = await phoneHash(EID, r.phone), newH = await phoneHash(EID, ph);
      const upd = {
        firstName: fn, lastName: ln, nameKey: key, phone: ph, age: Number($('e-age').value) || null,
        nickname: $('e-nick').value.trim(), registeredBy: $('e-by').value.trim(),
        platform: $('e-pf').value.trim(), platformId: $('e-pid').value.trim(),
        shirt: Number($('e-shirt').value), shirtSize: $('e-size').value, shirtName: $('e-sn').value.trim().toUpperCase(),
        shirtNumber: $('e-num').value.trim(), total: Number($('e-total').value) || 0, note: $('e-note').value.trim()
      };
      if (r.preReg && upd.shirtSize) upd.preReg = false;
      try {
        await runTransaction(db, async tx => {
          const rS = await tx.get(ref.reg(EID, r.id)); const cur = data(rS);
          const keyChanged = key !== cur.nameKey && cur.status !== 'cancelled';
          const nS = keyChanged ? await tx.get(ref.name(EID, key)) : null;
          const phoneChanged = oldH !== newH;
          const oS = phoneChanged ? await tx.get(ref.lookup(EID, oldH)) : null;
          const pS = phoneChanged ? await tx.get(ref.lookup(EID, newH)) : null;
          if (nS && nS.exists()) throw new Error('DUP');
          tx.update(ref.reg(EID, r.id), upd);
          if (keyChanged) { tx.delete(ref.name(EID, cur.nameKey)); tx.set(ref.name(EID, key), { at: serverTimestamp() }); }
          if (phoneChanged) {
            if (oS.exists()) tx.update(ref.lookup(EID, oldH), { refs: (data(oS).refs || []).filter(x => x !== 'r:' + r.id) });
            tx.set(ref.lookup(EID, newH), { refs: [...(pS.exists() ? data(pS).refs || [] : []), 'r:' + r.id] });
          }
        });
        toast('บันทึกแล้ว'); m.close();
      } catch (e) { toast(e.message === 'DUP' ? 'มีชื่อนี้สมัครอยู่แล้ว' : 'ผิดพลาด: ' + e.message, 4000); }
    };
  });
}

// ── สั่งเสื้อ ─────────────────────────────────────────
const ORDER_FILTERS = [
  ['all', 'ทั้งหมด', o => o.status !== 'cancelled'],
  ['slip', 'รอตรวจสลิป', o => o.status === 'slip'],
  ['pending', 'รอแนบสลิป', o => o.status === 'pending'],
  ['confirmed', 'ยืนยันแล้ว', o => o.status === 'confirmed'],
  ['ship', 'ต้องส่งพัสดุ', o => o.delivery === 'ship' && o.status === 'confirmed' && !o.handedOver],
  ['cancelled', 'ยกเลิก', o => o.status === 'cancelled']
];
function renderOrders() {
  if (!$('orders-list')) {
    root.innerHTML = `<div class="admin-toolbar"><input class="search-in" id="ord-q" placeholder="🔍 ค้นหา ชื่อ / เบอร์ / เลขออเดอร์" value="${esc(orderSearch)}"></div>
      <div class="sf-bar" id="ord-filters"></div><div id="orders-list"></div>`;
    $('ord-q').oninput = e => { orderSearch = e.target.value; renderOrders(); };
  }
  $('ord-filters').innerHTML = ORDER_FILTERS.map(([k, l, f]) => `<button class="sf-btn${orderFilter === k ? ' active' : ''}" data-f="${k}">${l} <span class="cnt">${ORDERS.filter(f).length}</span></button>`).join('');
  $('ord-filters').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { orderFilter = b.dataset.f; renderOrders(); });
  const f = ORDER_FILTERS.find(x => x[0] === orderFilter)[2];
  const qs = orderSearch.trim().toLowerCase(), qd = normPhone(qs);
  const list = ORDERS.filter(f).filter(o => !qs || (fullName(o) + ' ' + o.code).toLowerCase().includes(qs) || (qd.length >= 3 && normPhone(o.phone).includes(qd)));
  $('orders-list').innerHTML = list.length ? list.map(orderCard).join('') : '<div class="status-empty">ไม่มีรายการ</div>';
}
function orderCard(o) {
  const rd = (EV.shirtRounds || [])[o.round];
  const calc = orderTotal(EV, o), mismatch = calc !== Number(o.total);
  const acts = [];
  if (o.status === 'slip') acts.push(btn('oconfirm', o.id, '✓ ยืนยัน', 'ok'), btn('oreject', o.id, 'สลิปไม่ผ่าน'));
  if (o.status === 'pending') acts.push(btn('oconfirm', o.id, '✓ รับเงินแล้ว', 'ok'));
  if (o.status === 'confirmed') acts.push(btn('ohand', o.id, o.handedOver ? '↺ ยังไม่ได้ส่ง' : (o.delivery === 'ship' ? '📦 ส่งแล้ว' : '🤝 มอบเสื้อแล้ว'), o.handedOver ? '' : 'ok'));
  acts.push(btn('onote', o.id, '📝 หมายเหตุ'));
  acts.push(o.status === 'cancelled' ? btn('orestore', o.id, '↺ กู้คืน') : btn('ocancel', o.id, 'ยกเลิก', 'danger'));
  if (o.status === 'cancelled') acts.push(btn('odel', o.id, '🗑 ลบ', 'danger'));
  return `<div class="rcard ${o.status}">
    <div class="rcard-top"><span class="reg-id-badge">${esc(o.code)}</span>
      <div class="status-badge ${STATUS[o.status]?.badge}">${STATUS[o.status]?.label}</div>
      ${o.handedOver ? `<span class="q-badge ok">${o.delivery === 'ship' ? 'ส่งแล้ว' : 'มอบแล้ว'}</span>` : ''}
      <span class="muted-sm" style="margin-left:auto">${fmtDate(o.createdAt)}</span></div>
    <div class="rcard-body"><div class="rcard-main">
      <div class="reg-name">${esc(fullName(o))}</div>
      <div class="muted-sm">📞 ${tel(o.phone)} · ${esc(o.platform)}: ${esc(o.platformId)}</div>
      ${o.items.map((it, i) => `<div class="muted-sm">👕 ${i + 1}. ${esc(shirtNameOf(EV, it.shirt))} / ${esc(it.size)}${it.name ? ' / ' + esc(it.name) : ''}${it.num ? ' / #' + esc(it.num) : ''}</div>`).join('')}
      <div class="muted-sm">${rd ? esc(rd.label) + ' · ' : ''}${o.delivery === 'ship' ? `📦 ส่งพัสดุ: ${esc(o.address?.name)} · ${esc(o.address?.address)} · ${esc(o.address?.phone)}` : '🏟️ รับในงาน'}</div>
      <div class="muted-sm">💰 ฿${Number(o.total).toLocaleString()}${mismatch ? ` <span class="warn-tag">ราคาที่ควรเป็น ฿${calc}</span>` : ''}</div>
      ${o.note ? `<div class="note-line">📝 ${esc(o.note)}</div>` : ''}
    </div>${o.slipUrl ? `<img class="slip-thumb" src="${esc(o.slipUrl)}" data-view="${esc(o.slipUrl)}" alt="สลิป">` : ''}</div>
    <div class="rcard-acts">${acts.join('')}</div></div>`;
}

// ── สรุปเสื้อ ─────────────────────────────────────────
function shirtItems(status = shirtF.status, source = shirtF.source, round = shirtF.round) {
  const okStatus = s => status === 'confirmed' ? s === 'confirmed' : status === 'withReserve' ? s !== 'cancelled' : (s !== 'cancelled' && s !== 'reserve');
  const out = [];
  if (source !== 'orders' && (round === 'all' || round === 'reg')) {
    REGS.filter(r => okStatus(r.status) && r.shirtSize).forEach(r => {
      const base = { owner: fullName(r), phone: r.phone, code: r.code, status: r.status, source: 'ผู้สมัคร', round: 'ผู้สมัคร', delivery: 'รับในงาน' };
      out.push({ ...base, shirt: r.shirt, size: r.shirtSize, name: r.shirtName, num: r.shirtNumber, kind: 'เสื้อผู้สมัคร' });
      (r.extras || []).forEach(e => out.push({ ...base, shirt: e.shirt, size: e.size, name: e.name, num: e.num, kind: 'เสื้อเพิ่ม' }));
    });
  }
  if (source !== 'regs') {
    ORDERS.filter(o => okStatus(o.status) && (round === 'all' || String(o.round) === round)).forEach(o => {
      const rd = (EV.shirtRounds || [])[o.round];
      o.items.forEach(it => out.push({
        owner: fullName(o), phone: o.phone, code: o.code, status: o.status, source: 'สั่งเสื้อ', round: rd ? rd.label : '-',
        delivery: o.delivery === 'ship' ? 'ส่งพัสดุ' : 'รับในงาน', shirt: it.shirt, size: it.size, name: it.name, num: it.num, kind: 'สั่งเสื้อ'
      }));
    });
  }
  return out;
}
function matrix(items) {
  const sizes = [...EV.sizes];
  items.forEach(i => { if (!sizes.includes(i.size)) sizes.push(i.size); });
  const rows = EV.shirts.map((s, si) => ({ name: s.name, s, cells: sizes.map(sz => items.filter(i => Number(i.shirt) === si && i.size === sz).length) }));
  return { sizes, rows, colTotals: sizes.map((_, j) => rows.reduce((a, r) => a + r.cells[j], 0)) };
}
function renderShirts() {
  const items = shirtItems(), m = matrix(items);
  const rounds = EV.shirtRounds || [];
  const chip = (group, val, label) => `<button class="sf-btn${shirtF[group] === val ? ' active' : ''}" data-sf="${group}:${val}">${label}</button>`;
  root.innerHTML = `
    <div class="admin-section">
      <div class="admin-title">👕 สรุปจำนวนเสื้อ <span class="admin-badge">${items.length} ตัว</span></div>
      <div class="slabel">สถานะ</div>
      <div class="sf-bar">${chip('status', 'active', 'ทั้งหมด (ไม่รวมสำรอง/ยกเลิก)')}${chip('status', 'confirmed', 'ยืนยันแล้วเท่านั้น')}${chip('status', 'withReserve', 'รวมตัวสำรอง')}</div>
      <div class="slabel">ที่มา</div>
      <div class="sf-bar">${chip('source', 'all', 'ทั้งหมด')}${chip('source', 'regs', 'ผู้สมัคร + เสื้อเพิ่ม')}${chip('source', 'orders', 'สั่งเสื้ออย่างเดียว')}</div>
      ${rounds.length ? `<div class="slabel">รอบ</div><div class="sf-bar">${chip('round', 'all', 'ทุกรอบ')}${chip('round', 'reg', 'ผู้สมัคร')}${rounds.map((r, i) => chip('round', String(i), esc(r.label))).join('')}</div>` : ''}
      <div class="table-wrap"><table class="mx-table">
        <thead><tr><th>แบบ \\ ไซส์</th>${m.sizes.map(s => `<th>${esc(s)}</th>`).join('')}<th>รวม</th></tr></thead>
        <tbody>${m.rows.map(r => `<tr><th><span class="sw" style="background:${esc(r.s.c1)};border-color:${esc(r.s.c2)}"></span>${esc(r.name)}</th>${r.cells.map(n => `<td class="${n ? '' : 'zero'}">${n || '·'}</td>`).join('')}<td class="tot">${r.cells.reduce((a, b) => a + b, 0)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>รวม</th>${m.colTotals.map(n => `<td>${n}</td>`).join('')}<td class="tot">${items.length}</td></tr></tfoot>
      </table></div>
      <div class="muted-sm" style="margin-top:.5rem">มีชื่อหลังเสื้อ ${items.filter(i => i.name).length} ตัว · มีเบอร์ ${items.filter(i => i.num).length} ตัว</div>
      <button class="add-btn-sm" id="xls" style="margin-top:.75rem">⬇ ดาวน์โหลด Excel (สรุป + รายการเสื้อ + รายชื่อทั้งหมด)</button>
    </div>
    <div class="admin-section">
      <div class="admin-title">รายการเสื้อ (ตามตัวกรอง)</div>
      <div class="table-wrap"><table class="list-table"><thead><tr><th>แบบ</th><th>ไซส์</th><th>ชื่อหลัง</th><th>เบอร์</th><th>เจ้าของ</th><th>ที่มา</th></tr></thead>
      <tbody>${sortItems(items).map(i => `<tr><td>${esc(shirtNameOf(EV, i.shirt))}</td><td>${esc(i.size)}</td><td>${esc(i.name || '')}</td><td>${esc(i.num || '')}</td><td>${esc(i.owner)} <span class="muted-sm">${esc(i.code)}</span></td><td>${esc(i.kind)}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
  root.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { const [g, v] = b.dataset.sf.split(':'); shirtF[g] = v; renderShirts(); });
  $('xls').onclick = exportExcel;
}
const sortItems = items => [...items].sort((a, b) => (a.shirt - b.shirt) || (EV.sizes.indexOf(a.size) - EV.sizes.indexOf(b.size)) || String(a.name || '').localeCompare(String(b.name || '')));

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  return window.XLSX;
}
async function exportExcel() {
  let X;
  try { X = await loadXLSX(); } catch { return toast('โหลดตัวสร้าง Excel ไม่สำเร็จ'); }
  const items = shirtItems(), m = matrix(items);
  const wb = X.utils.book_new();
  const add = (name, rows, widths) => { const ws = X.utils.aoa_to_sheet(rows); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
  const label = { active: 'ทั้งหมด (ไม่รวมสำรอง/ยกเลิก)', confirmed: 'ยืนยันแล้วเท่านั้น', withReserve: 'รวมตัวสำรอง' }[shirtF.status];
  add('สรุปเสื้อ', [[EV.name], ['ตัวกรอง: ' + label], [],
    ['แบบ \\ ไซส์', ...m.sizes, 'รวม'],
    ...m.rows.map(r => [r.name, ...r.cells, r.cells.reduce((a, b) => a + b, 0)]),
    ['รวม', ...m.colTotals, items.length]], [18, ...m.sizes.map(() => 6), 8]);
  add('รายการเสื้อ', [['แบบ', 'ไซส์', 'ชื่อหลังเสื้อ', 'เบอร์', 'เจ้าของ', 'เบอร์โทร', 'เลขที่', 'ประเภท', 'รอบ', 'การรับ', 'สถานะ'],
    ...sortItems(items).map(i => [shirtNameOf(EV, i.shirt), i.size, i.name || '', i.num || '', i.owner, i.phone, i.code, i.kind, i.round, i.delivery, STATUS[i.status]?.label])],
    [16, 6, 14, 6, 22, 13, 11, 12, 10, 10, 12]);
  add('ผู้สมัคร', [['เลขที่', 'สมัครเมื่อ', 'ชื่อ', 'นามสกุล', 'ชื่อในงาน', 'อายุ', 'เบอร์โทร', 'สมัครแทนโดย', 'Platform', 'ID', 'แบบเสื้อ', 'ไซส์', 'ชื่อหลัง', 'เบอร์', 'เสื้อเพิ่ม', 'ยอด', 'สถานะ', 'ลิงก์สลิป', 'หมายเหตุ'],
    ...REGS.map(r => [r.code, fmtDate(r.createdAt), r.firstName, r.lastName, r.nickname, r.age ?? '', r.phone, r.registeredBy || '', r.platform, r.platformId,
      r.shirtSize ? shirtNameOf(EV, r.shirt) : '', r.shirtSize, r.shirtName, r.shirtNumber,
      (r.extras || []).map(e => `${shirtNameOf(EV, e.shirt)}/${e.size}/${e.name || '-'}/#${e.num || '-'}`).join(' | '),
      r.total, STATUS[r.status]?.label, r.slipUrl || '', r.note || ''])],
    [10, 14, 14, 14, 12, 5, 13, 14, 9, 14, 14, 6, 12, 6, 30, 7, 12, 30, 20]);
  add('สั่งเสื้อ', [['เลขที่', 'สั่งเมื่อ', 'ชื่อ', 'นามสกุล', 'เบอร์โทร', 'Platform', 'ID', 'รอบ', 'จำนวน', 'รายการ', 'การรับ', 'ที่อยู่จัดส่ง', 'ยอด', 'สถานะ', 'ส่ง/มอบแล้ว', 'ลิงก์สลิป', 'หมายเหตุ'],
    ...ORDERS.map(o => [o.code, fmtDate(o.createdAt), o.firstName, o.lastName, o.phone, o.platform, o.platformId, (EV.shirtRounds || [])[o.round]?.label || '',
      o.items.length, o.items.map(it => `${shirtNameOf(EV, it.shirt)}/${it.size}/${it.name || '-'}/#${it.num || '-'}`).join(' | '),
      o.delivery === 'ship' ? 'ส่งพัสดุ' : 'รับในงาน', o.address ? `${o.address.name} ${o.address.address} ${o.address.phone}` : '',
      o.total, STATUS[o.status]?.label, o.handedOver ? 'ใช่' : '', o.slipUrl || '', o.note || ''])],
    [11, 14, 14, 14, 13, 9, 14, 8, 6, 40, 9, 40, 7, 12, 8, 30, 20]);
  const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  X.writeFile(wb, `${EID}-${stamp}.xlsx`);
}

// ── ผู้สนับสนุน ───────────────────────────────────────
function renderSponsors() {
  root.innerHTML = `<div class="admin-section">
    <div class="admin-title">🏷️ ผู้สนับสนุน <span class="admin-badge">${SPONSORS.length} ราย</span></div>
    ${SPONSORS.map((s, i) => `<div class="sp-item">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" class="sp-logo" alt="">` : '<span style="font-size:18px">🏷️</span>'}
      <div class="sp-name">${esc(s.name)}</div>
      ${i > 0 ? btn('spup', s.id, '↑') : ''}${i < SPONSORS.length - 1 ? btn('spdown', s.id, '↓') : ''}
      <button class="sp-del" data-act="spdel" data-id="${esc(s.id)}">×</button></div>`).join('') || '<div class="muted-sm">ยังไม่มีผู้สนับสนุน</div>'}
    <div class="slabel" style="margin-top:1rem">เพิ่มผู้สนับสนุน</div>
    <div class="field"><label>ชื่อ <span class="req">*</span></label><input id="sp-name" placeholder="ชื่อบริษัท / แบรนด์"></div>
    <div class="field"><label>โลโก้</label>
      <div class="img-field"><input id="sp-logo" class="cfg-input" placeholder="วาง URL หรือกดอัปโหลด"><label class="cfg-upload-btn">📁 อัปโหลด<input type="file" accept="image/*" hidden id="sp-file"></label></div>
      <div id="sp-prev"></div></div>
    <button class="add-btn-sm" id="sp-add">+ เพิ่มผู้สนับสนุน</button></div>`;
  $('sp-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    toast('กำลังอัปโหลด...');
    try { $('sp-logo').value = await uploadImage(f, EID, 'sponsors'); $('sp-prev').innerHTML = `<img src="${esc($('sp-logo').value)}" class="cfg-prev" alt="">`; toast('อัปโหลดแล้ว'); }
    catch (err) { toast('อัปโหลดไม่สำเร็จ: ' + err.message); }
  };
  $('sp-add').onclick = async () => {
    const name = $('sp-name').value.trim(); if (!name) return toast('กรุณาใส่ชื่อ');
    const order = SPONSORS.reduce((m, s) => Math.max(m, s.order || 0), 0) + 1;
    await setDoc(doc(ref.sponsors(EID)), { name, logoUrl: driveUrl($('sp-logo').value), order, createdAt: serverTimestamp() });
    toast('เพิ่มแล้ว');
  };
}
async function moveSponsor(id, dir) {
  const i = SPONSORS.findIndex(s => s.id === id), j = i + dir;
  if (j < 0 || j >= SPONSORS.length) return;
  const a = SPONSORS[i], b = SPONSORS[j];
  await Promise.all([updateDoc(ref.sponsor(EID, a.id), { order: b.order }), updateDoc(ref.sponsor(EID, b.id), { order: a.order === b.order ? b.order + dir : a.order })]);
}

// ── ตั้งค่างาน ────────────────────────────────────────
const SETTING_KEYS = Object.keys(DEFAULT_EVENT);
function getPath(o, p) { return p.split('.').reduce((x, k) => x?.[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; }

function renderSettings() {
  if (!draft) draft = JSON.parse(JSON.stringify(Object.fromEntries(SETTING_KEYS.map(k => [k, EV[k] ?? DEFAULT_EVENT[k]]))));
  const D = draft;
  const txt = (p, label, ph = '', type = 'text') => `<div class="field"><label>${label}</label><input type="${type}" data-s="${p}" value="${esc(getPath(D, p) ?? '')}" placeholder="${esc(ph)}"></div>`;
  const num = (p, label) => txt(p, label, '', 'number');
  const chk = (p, label) => `<label class="switch-row"><input type="checkbox" data-s="${p}" ${getPath(D, p) ? 'checked' : ''}><span>${label}</span></label>`;
  const img = (p, label) => `<div class="field"><label>${label}</label><div class="img-field">
      <input class="cfg-input" data-s="${p}" data-img value="${esc(getPath(D, p) || '')}" placeholder="วาง URL (รองรับลิงก์ Google Drive) หรืออัปโหลด">
      <label class="cfg-upload-btn">📁<input type="file" accept="image/*" hidden data-up="${p}"></label></div>
      ${getPath(D, p) ? `<img src="${esc(getPath(D, p))}" class="cfg-prev" data-view="${esc(getPath(D, p))}" alt="">` : ''}</div>`;
  root.innerHTML = `
    <div class="save-bar"><span class="muted-sm">แก้ไขแล้วกดบันทึก — หน้าเว็บผู้สมัครจะอัปเดตทันที</span><button class="add-btn-sm" id="save-top" style="width:auto;padding:0 1.2rem">💾 บันทึก</button></div>
    <div class="admin-section"><div class="admin-title">การรับสมัคร</div>
      <div class="toggle-row">${chk('registrationOpen', 'เปิดรับสมัคร')}${chk('shirtOrderOpen', 'เปิดสั่งเสื้อ')}</div>
      <div class="frow">${num('quota', 'จำนวนที่รับ (คน)')}${num('slipHours', 'เวลาแนบสลิป (ชม.)')}</div>
      <div class="frow">${num('youthAge', 'เยาวชน = อายุต่ำกว่า')}${num('maxPerPhone', 'สมัครได้สูงสุดต่อเบอร์')}</div>
    </div>
    <div class="admin-section"><div class="admin-title">ข้อมูลงาน</div>
      ${txt('name', 'ชื่องาน (หัวเว็บ)')}
      <div class="frow">${txt('titleLine1', 'หัวข้อบรรทัด 1')}${txt('titleLine2', 'หัวข้อบรรทัด 2 (สีทอง)')}</div>
      <div class="frow">${txt('dateText', 'วันที่', 'เช่น 15 พฤศจิกายน 2026')}${txt('timeText', 'เวลา')}</div>
      ${txt('venue', 'สถานที่ (เต็ม)', 'สนาม ... · บุรีรัมย์')}
      <div class="frow">${txt('venueShort', 'สถานที่ (สั้น)')}${txt('organizer', 'ผู้จัด')}</div>
      <div class="field"><label>กำหนดการสำคัญ (บรรทัดละข้อ · ใช้ **ข้อความ** ทำตัวหนา)</label><textarea rows="5" data-lines="schedule">${esc((D.schedule || []).join('\n'))}</textarea></div>
    </div>
    <div class="admin-section"><div class="admin-title">ราคา & ไซส์</div>
      <div class="frow">${num('entryFee', 'ค่าสมัคร + เสื้อ 1 ตัว')}${num('shirtPrice', 'ราคาเสื้อ / ตัว')}</div>
      <div class="frow">${num('surcharge', 'บวกเพิ่มไซส์ใหญ่')}<div class="field"><label>ไซส์ที่บวกเพิ่ม (คั่นด้วย ,)</label><input data-csv="surchargeSizes" value="${esc(D.surchargeSizes.join(', '))}"></div></div>
      <div class="field"><label>ไซส์ทั้งหมด (คั่นด้วย ,)</label><input data-csv="sizes" value="${esc(D.sizes.join(', '))}"></div>
    </div>
    <div class="admin-section"><div class="admin-title">แบบเสื้อ</div>
      ${D.shirts.map((s, i) => `<div class="item-box">
        <div class="shirt-edit-head">${shirtSVG(s.c1, s.c2, 36, 36)}<strong>แบบที่ ${i + 1}</strong>${D.shirts.length > 1 ? `<button class="link-btn danger" data-rm="shirts:${i}">ลบแบบนี้</button>` : ''}</div>
        <div class="frow">${txt(`shirts.${i}.name`, 'ชื่อแบบ')}${txt(`shirts.${i}.desc`, 'คำอธิบาย')}</div>
        <div class="frow"><div class="field"><label>สีหลัก</label><input type="color" data-s="shirts.${i}.c1" value="${esc(s.c1)}"></div><div class="field"><label>สีขอบ</label><input type="color" data-s="shirts.${i}.c2" value="${esc(s.c2)}"></div></div>
        ${img(`shirts.${i}.img`, 'รูปเสื้อ')}</div>`).join('')}
      <button class="bulk-btn-sm" data-addrow="shirts">+ เพิ่มแบบเสื้อ</button>
      <div class="muted-sm" style="margin-top:.4rem">⚠️ ถ้ามีคนสั่งแล้ว อย่าลบหรือสลับลำดับแบบเสื้อ เพราะระบบจำเป็นลำดับ</div>
    </div>
    <div class="admin-section"><div class="admin-title">รอบสั่งเสื้อ</div>
      ${D.shirtRounds.map((r, i) => `<div class="item-box"><div class="frow">${txt(`shirtRounds.${i}.label`, 'ชื่อรอบ')}${txt(`shirtRounds.${i}.orderBy`, 'สั่งภายใน')}</div>
        <div class="img-field">${txt(`shirtRounds.${i}.receive`, 'ได้รับเมื่อ')}<button class="link-btn danger" data-rm="shirtRounds:${i}">ลบ</button></div></div>`).join('')}
      <button class="bulk-btn-sm" data-addrow="shirtRounds">+ เพิ่มรอบ</button>
    </div>
    <div class="admin-section"><div class="admin-title">การชำระเงิน</div>
      <div class="frow">${txt('bankName', 'ธนาคาร')}${txt('bankAccount', 'เลขบัญชี + ชื่อบัญชี')}</div>
      ${img('qrImg', 'QR ชำระเงิน')}
    </div>
    <div class="admin-section"><div class="admin-title">รูปภาพ</div>
      ${img('logoUrl', 'โลโก้')}${img('sizeChartImg', 'ตารางไซส์ (ว่าง = ใช้ตารางมาตรฐาน)')}
      ${img('modeImgCompete', 'รูปปุ่ม "สมัครร่วมงาน"')}${img('modeImgShirt', 'รูปปุ่ม "สั่งเสื้อ"')}
      <div class="slabel">รูปประกาศหน้าแรก</div>
      ${(D.announceImgs || []).map((_, i) => `<div class="img-field">${img(`announceImgs.${i}`, 'รูปที่ ' + (i + 1))}<button class="link-btn danger" data-rm="announceImgs:${i}">ลบ</button></div>`).join('')}
      <button class="bulk-btn-sm" data-addrow="announceImgs">+ เพิ่มรูปประกาศ</button>
    </div>
    <div class="admin-section"><div class="admin-title">กลุ่ม Line</div>
      ${txt('lineLink', 'ลิงก์ Open Chat')}${txt('linePassword', 'รหัสเข้ากลุ่ม')}${img('lineQrUrl', 'QR กลุ่ม Line')}
    </div>
    <div class="admin-section"><div class="admin-title">เลขที่เอกสาร</div>
      <div class="frow">${txt('idPrefix', 'นำหน้าเลขสมัคร')}${txt('shirtIdPrefix', 'นำหน้าเลขสั่งเสื้อ')}</div>
      <div class="muted-sm">เลขสมัครจะเป็น ${esc(D.idPrefix)}-001, -002 ... · รหัสงานนี้: <strong>${esc(EID)}</strong></div>
    </div>
    <button class="submit-btn" id="save-bottom">💾 บันทึกการตั้งค่า</button>`;

  const numKeys = ['quota', 'slipHours', 'youthAge', 'maxPerPhone', 'entryFee', 'shirtPrice', 'surcharge'];
  root.querySelectorAll('[data-s]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.type === 'color' ? 'change' : 'input', () => {
    const p = el.dataset.s;
    setPath(D, p, el.type === 'checkbox' ? el.checked : numKeys.includes(p) ? Number(el.value) : (el.dataset.img !== undefined ? driveUrl(el.value) : el.value));
  }));
  root.querySelectorAll('[data-img]').forEach(el => el.addEventListener('change', () => renderSettings()));
  root.querySelectorAll('[data-lines]').forEach(el => el.oninput = () => { D[el.dataset.lines] = el.value.split('\n').map(s => s.trim()).filter(Boolean); });
  root.querySelectorAll('[data-csv]').forEach(el => el.oninput = () => { D[el.dataset.csv] = el.value.split(',').map(s => s.trim()).filter(Boolean); });
  root.querySelectorAll('[data-up]').forEach(el => el.onchange = async () => {
    const f = el.files[0]; if (!f) return;
    toast('กำลังอัปโหลด...');
    try { setPath(D, el.dataset.up, await uploadImage(f, EID, 'images')); toast('อัปโหลดแล้ว — อย่าลืมกดบันทึก'); renderSettings(); }
    catch (err) { toast('อัปโหลดไม่สำเร็จ: ' + err.message, 4000); }
  });
  root.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    const [k, i] = b.dataset.rm.split(':');
    if (k === 'shirts' && !confirm('ลบแบบเสื้อนี้? (ถ้ามีคนสั่งแบบนี้แล้ว ข้อมูลจะเพี้ยน)')) return;
    D[k].splice(Number(i), 1); renderSettings();
  });
  root.querySelectorAll('[data-addrow]').forEach(b => b.onclick = () => {
    const k = b.dataset.addrow;
    D[k] = D[k] || [];
    D[k].push(k === 'shirts' ? { name: 'แบบใหม่', desc: '', c1: '#333333', c2: '#C9A84C', img: '' } : k === 'shirtRounds' ? { label: `รอบ ${D[k].length + 1}`, orderBy: '', receive: '' } : '');
    renderSettings();
  });
  const save = async () => {
    if (!(D.quota > 0)) return toast('จำนวนที่รับต้องมากกว่า 0');
    if (!D.sizes.length || !D.shirts.length) return toast('ต้องมีไซส์และแบบเสื้ออย่างน้อย 1');
    if (D.quota < seatsUsed() && !confirm(`ตอนนี้มีคนใช้ที่นั่ง ${seatsUsed()} คน มากกว่าโควตาใหม่ ${D.quota} — บันทึกต่อ?`)) return;
    D.announceImgs = (D.announceImgs || []).filter(Boolean);
    try { await updateDoc(ref.event(EID), D); toast('บันทึกแล้ว ✓'); draft = null; EVENTS = EVENTS.map(e => e.id === EID ? { ...e, name: D.name } : e); render(); }
    catch (e) { console.error(e); toast('บันทึกไม่สำเร็จ: ' + (e.code || e.message), 4000); }
  };
  $('save-top').onclick = save; $('save-bottom').onclick = save;
}

// ── ทีมงาน ───────────────────────────────────────────
async function renderTeam() {
  root.innerHTML = '<div class="loader">กำลังโหลด...</div>';
  let list = [];
  try { list = (await getDocs(ref.admins())).docs.map(d => ({ email: d.id, ...data(d) })); } catch (e) { console.error(e); }
  if (tab !== 'team') return;
  root.innerHTML = `<div class="admin-section"><div class="admin-title">👥 ทีมงานที่เข้าหน้า Admin ได้</div>
    ${list.map(a => `<div class="sp-item"><div class="sp-name">${esc(a.email)}${a.email === USER.email ? ' <span class="muted-sm">(คุณ)</span>' : ''}</div>
      ${a.email !== USER.email ? `<button class="sp-del" data-rmadmin="${esc(a.email)}">×</button>` : ''}</div>`).join('')}
    <div class="slabel" style="margin-top:1rem">เพิ่มทีมงาน (อีเมล Gmail)</div>
    <div class="img-field"><input class="cfg-input" id="adm-email" type="email" placeholder="name@gmail.com"><button class="cfg-upload-btn" id="adm-add">+ เพิ่ม</button></div>
    <div class="muted-sm" style="margin-top:.5rem">ทีมงานทุกคนทำได้ทุกอย่างในหน้านี้ รวมถึงเพิ่ม/ลบทีมงาน</div></div>`;
  $('adm-add').onclick = async () => {
    const e = $('adm-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast('อีเมลไม่ถูกต้อง');
    await setDoc(ref.admin(e), { addedBy: USER.email, at: serverTimestamp() });
    toast('เพิ่มแล้ว'); renderTeam();
  };
  root.querySelectorAll('[data-rmadmin]').forEach(b => b.onclick = async () => {
    if (!confirm(`ลบ ${b.dataset.rmadmin} ออกจากทีมงาน?`)) return;
    await deleteDoc(ref.admin(b.dataset.rmadmin)); toast('ลบแล้ว'); renderTeam();
  });
}
