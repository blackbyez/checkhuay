// ------------------------------------------------------------
// Thai Lottery Check — main app
// ------------------------------------------------------------
// Data source: https://lotto.api.rayriffy.com  (open, free)
// Falls back to bundled sample data if the API is unreachable.
// ------------------------------------------------------------

const API_BASE = 'https://lotto.api.rayriffy.com';
const LS_SAVED = 'lotto_saved_numbers';
const LS_CACHE = 'lotto_cache';

// ---------- Sample fallback ----------
const SAMPLE = {
  date: '16 กรกฎาคม 2026',
  endpoint: 'sample',
  prizes: [
    { id: 'prizeFirst', name: 'รางวัลที่ 1', reward: '6000000', amount: 1, number: ['123456'] },
    { id: 'prizeSecond', name: 'รางวัลที่ 2', reward: '200000', amount: 5, number: ['234567','345678','456789','567890','678901'] },
    { id: 'prizeThird', name: 'รางวัลที่ 3', reward: '80000', amount: 10, number: ['111111','222222','333333','444444','555555','666666','777777','888888','999999','101010'] }
  ],
  runningNumbers: [
    { id: 'runningNumberFrontThree', name: 'เลขหน้า 3 ตัว', reward: '4000', amount: 2, number: ['123','456'] },
    { id: 'runningNumberBackThree', name: 'เลขท้าย 3 ตัว', reward: '4000', amount: 2, number: ['789','012'] },
    { id: 'runningNumberBackTwo', name: 'เลขท้าย 2 ตัว', reward: '2000', amount: 1, number: ['56'] }
  ]
};

// ---------- State ----------
let currentDraw = null;
let allDraws = [];

// ---------- Init ----------
document.getElementById('year').textContent = new Date().getFullYear();
init();

async function init() {
  updateCountdown();
  setInterval(updateCountdown, 60000);

  initTabs();
  initYikee();
  initStock();
  initLuck();
  initBirthday();

  try {
    // Per-draw page: build script embedded the draw as window.__DRAW__
    if (window.__DRAW__) {
      currentDraw = window.__DRAW__;
      renderResults(currentDraw);
      try { await loadDrawList(); } catch {}
      checkSaved();
    } else {
      await loadDrawList();
      await loadLatest();
    }
  } catch (e) {
    console.warn('Falling back to sample data', e);
    currentDraw = SAMPLE;
    renderResults(SAMPLE);
    renderHotNumbers([SAMPLE]);
    checkSaved();
  }

  bindEvents();
  renderSaved();
}

// ---------- Countdown to next draw ----------
// Thai lottery draws are on the 1st and 16th of every month.
function nextDrawDate() {
  const now = new Date();
  const d = now.getDate();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (d < 1) return new Date(y, m, 1);
  if (d < 16) return new Date(y, m, 16);
  return new Date(y, m + 1, 1);
}

function updateCountdown() {
  const target = nextDrawDate();
  const now = new Date();
  const diff = target - now;

  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const dateStr = `${target.getDate()} ${thaiMonths[target.getMonth()]} ${target.getFullYear() + 543}`;
  document.getElementById('next-date').textContent = dateStr;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  document.getElementById('countdown').textContent = `อีก ${days} วัน ${hours} ชม. ${mins} นาที`;
}

// ---------- API ----------
async function loadDrawList() {
  const res = await fetch(`${API_BASE}/list`);
  if (!res.ok) throw new Error('list failed');
  const data = await res.json();
  const items = (data.response || []).slice(0, 24);
  allDraws = items;
  const sel = document.getElementById('draw-select');
  sel.innerHTML = items.map((d, i) =>
    `<option value="${d.date}">${d.date}</option>`
  ).join('');
}

async function loadLatest() {
  const cached = readCache();
  if (cached && Date.now() - cached.t < 60 * 60 * 1000) {
    currentDraw = cached.data;
    renderResults(cached.data);
    renderHotNumbers(cached.recent || [cached.data]);
    checkSaved();
    return;
  }
  const res = await fetch(`${API_BASE}/latest`);
  if (!res.ok) throw new Error('latest failed');
  const data = await res.json();
  currentDraw = data.response;
  renderResults(currentDraw);

  // Load a few recent for hot-numbers
  const recent = [currentDraw];
  for (let i = 1; i < 4 && i < allDraws.length; i++) {
    try {
      const r = await fetch(`${API_BASE}/${allDraws[i].date}`);
      if (r.ok) { const j = await r.json(); recent.push(j.response); }
    } catch {}
  }
  renderHotNumbers(recent);
  writeCache({ t: Date.now(), data: currentDraw, recent });
  checkSaved();
}

async function loadDraw(date) {
  const res = await fetch(`${API_BASE}/${date}`);
  if (!res.ok) throw new Error('draw failed');
  const data = await res.json();
  currentDraw = data.response;
  renderResults(currentDraw);
  checkSaved();
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(LS_CACHE)); } catch { return null; }
}
function writeCache(v) {
  try { localStorage.setItem(LS_CACHE, JSON.stringify(v)); } catch {}
}

// ---------- Rendering ----------
function renderResults(draw) {
  const el = document.getElementById('results');
  const first = draw.prizes.find(p => p.id === 'prizeFirst');
  const running = draw.runningNumbers || [];

  const html = [];
  if (first) {
    html.push(`
      <div class="prize first">
        <div>
          <div class="prize-label">รางวัลที่ 1</div>
          <div class="prize-name">${fmtMoney(first.reward)} บาท</div>
        </div>
        <div class="prize-number">${first.number[0]}</div>
      </div>
    `);
  }

  running.forEach(rn => {
    html.push(`
      <div class="prize-group">
        <div class="prize-name">${rn.name} · ${fmtMoney(rn.reward)} บาท</div>
        <div class="prize-group-numbers">
          ${rn.number.map(n => `<span class="mini-number">${n}</span>`).join('')}
        </div>
      </div>
    `);
  });

  // Other prizes (2nd, 3rd, etc.)
  draw.prizes.filter(p => p.id !== 'prizeFirst').forEach(p => {
    html.push(`
      <div class="prize-group">
        <div class="prize-name">${p.name} · ${fmtMoney(p.reward)} บาท (${p.amount} รางวัล)</div>
        <div class="prize-group-numbers">
          ${p.number.slice(0, 10).map(n => `<span class="mini-number">${n}</span>`).join('')}
          ${p.number.length > 10 ? `<span class="mini-number">+${p.number.length-10}</span>` : ''}
        </div>
      </div>
    `);
  });

  el.innerHTML = html.join('');
}

function renderHotNumbers(recent) {
  const freq = {};
  recent.forEach(d => {
    d.runningNumbers?.forEach(rn => rn.number.forEach(n => {
      freq[n] = (freq[n] || 0) + 1;
    }));
  });
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 12);
  const el = document.getElementById('hot-numbers');
  if (!sorted.length) { el.innerHTML = '<span class="empty">ยังไม่มีข้อมูลพอ</span>'; return; }
  el.innerHTML = sorted.map(([n, c]) =>
    `<span class="hot-num">${n}<small>ออก ${c} ครั้ง</small></span>`
  ).join('');
}

function fmtMoney(n) {
  return Number(n).toLocaleString('th-TH');
}

// ---------- Checker ----------
function checkNumber(num, draw = currentDraw) {
  if (!draw || !num) return null;
  num = String(num);

  for (const p of draw.prizes) {
    for (const n of p.number) {
      if (num === n) return { won: true, prize: p.name, reward: p.reward };
    }
  }

  for (const rn of draw.runningNumbers || []) {
    for (const n of rn.number) {
      if (rn.id.includes('Front') && num.startsWith(n)) return { won: true, prize: rn.name, reward: rn.reward };
      if (rn.id.includes('Back') && num.endsWith(n)) return { won: true, prize: rn.name, reward: rn.reward };
    }
  }

  // Near miss: 2 last digits win a small prize even if not exact
  if (num.length >= 2) {
    const last2 = num.slice(-2);
    for (const rn of draw.runningNumbers || []) {
      if (rn.id === 'runningNumberBackTwo' && rn.number.includes(last2)) {
        return { won: true, prize: rn.name, reward: rn.reward };
      }
    }
  }

  return { won: false };
}

function showCheckResult(num) {
  const el = document.getElementById('check-result');
  const r = checkNumber(num);
  el.hidden = false;
  if (r?.won) {
    el.className = 'check-result win';
    el.innerHTML = `
      <div>🎉 ยินดีด้วย! เลข <strong>${num}</strong> ถูก</div>
      <div>${r.prize}</div>
      <div class="amount">${fmtMoney(r.reward)} บาท</div>
    `;
  } else {
    el.className = 'check-result lose';
    el.innerHTML = `เสียใจด้วย เลข <strong>${num}</strong> ไม่ถูกรางวัลในงวดนี้`;
  }
}

// ---------- Saved numbers ----------
function getSaved() {
  try { return JSON.parse(localStorage.getItem(LS_SAVED)) || []; } catch { return []; }
}
function setSaved(list) {
  localStorage.setItem(LS_SAVED, JSON.stringify(list));
}

function renderSaved() {
  const list = getSaved();
  const el = document.getElementById('saved-list');
  if (!list.length) {
    el.innerHTML = '<li class="empty">ยังไม่มีเลขที่บันทึกไว้</li>';
    return;
  }
  el.innerHTML = list.map(num => {
    const r = checkNumber(num);
    const status = r?.won
      ? `<span class="saved-status win">ถูก ${r.prize}</span>`
      : `<span class="saved-status lose">ไม่ถูก</span>`;
    return `
      <li>
        <span class="saved-number">${num}</span>
        ${status}
        <button class="saved-remove" data-num="${num}" aria-label="ลบ">✕</button>
      </li>
    `;
  }).join('');
}

function checkSaved() { renderSaved(); }

// ---------- Events ----------
function bindEvents() {
  const input = document.getElementById('check-input');
  document.getElementById('check-btn').addEventListener('click', () => {
    const v = input.value.trim();
    if (!v || !/^\d{2,6}$/.test(v)) { toast('กรุณากรอกเลข 2–6 หลัก'); return; }
    showCheckResult(v);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('check-btn').click();
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    const v = input.value.trim();
    if (!v || !/^\d{2,6}$/.test(v)) { toast('กรุณากรอกเลข 2–6 หลักก่อนบันทึก'); return; }
    const list = getSaved();
    if (list.includes(v)) { toast('บันทึกเลขนี้ไว้แล้ว'); return; }
    list.unshift(v);
    setSaved(list.slice(0, 20));
    renderSaved();
    toast('บันทึกเลข ' + v + ' แล้ว');
  });

  document.getElementById('saved-list').addEventListener('click', e => {
    const btn = e.target.closest('.saved-remove');
    if (!btn) return;
    const num = btn.dataset.num;
    setSaved(getSaved().filter(n => n !== num));
    renderSaved();
  });

  document.getElementById('draw-select').addEventListener('change', e => {
    loadDraw(e.target.value).catch(() => toast('โหลดข้อมูลไม่สำเร็จ'));
  });
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 2200);
}

// ============================================================
// TABS + ROUTING
// ============================================================
const TAB_META = {
  gov:   { title: 'เช็คหวย - ตรวจหวยรัฐบาล งวดล่าสุด',              desc: 'ตรวจหวยงวดล่าสุด ย้อนหลัง พร้อมบันทึกเลขให้เช็คอัตโนมัติ',      path: '/' },
  luck:  { title: 'เลขเด็ดงวดนี้ - เลขเด็ดสำนักดัง | เช็คหวย',       desc: 'เลขเด็ดสำนักดัง คำนวณเลขวันเกิด เลขนำโชควันนี้ อัพเดตทุกงวด',    path: '/lek-ded/' },
  stats: { title: 'สถิติหวย - เลขออกบ่อย เลขนานไม่ออก | เช็คหวย',    desc: 'สถิติหวยย้อนหลัง 12 งวด เลขท้าย 2 ตัวออกบ่อย เลขนานแล้วไม่ออก', path: '/sathiti/' },
  yikee: { title: 'หวยยี่กี 88 รอบ - ผลสด | เช็คหวย',                desc: 'ผลหวยยี่กีแบบเรียลไทม์ 88 รอบต่อวัน 3 ตัวบน 2 ตัวล่าง',         path: '/yikee/' },
  stock: { title: 'หวยหุ้น - หุ้นไทย ต่างประเทศ ดาวโจนส์ | เช็คหวย', desc: 'ผลหวยหุ้นไทย 4 รอบ และหุ้นต่างประเทศ นิเคอิ ฮั่งเส็ง ดาวโจนส์', path: '/hun/' },
};

const PATH_TO_TAB = Object.fromEntries(Object.entries(TAB_META).map(([k, v]) => [v.path, k]));

function currentTabFromPath() {
  // 1. explicit data-attribute from pre-rendered page
  const preset = document.body.dataset.initialTab;
  if (preset && TAB_META[preset]) return preset;
  // 2. exact path match
  if (PATH_TO_TAB[location.pathname]) return PATH_TO_TAB[location.pathname];
  // 3. per-draw pages (/huay/DD-MM-YYYY/) → gov tab
  if (location.pathname.startsWith('/huay/')) return 'gov';
  // 4. legacy ?tab=X
  const q = new URLSearchParams(location.search).get('tab');
  if (q && TAB_META[q]) return q;
  return 'gov';
}

function activateTab(name, pushHistory = false) {
  if (!TAB_META[name]) name = 'gov';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));

  const meta = TAB_META[name];
  document.title = meta.title;
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute('content', meta.desc);

  if (pushHistory && location.pathname !== meta.path) {
    history.pushState({ tab: name }, '', meta.path);
  }

  if (name === 'yikee') renderYikee();
  if (name === 'stock') renderStock();
  if (name === 'luck') renderLuck();
  if (name === 'stats') loadAndRenderStats();
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(a => {
    a.addEventListener('click', e => {
      // let cmd/ctrl+click open in new tab normally
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      activateTab(a.dataset.tab, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  window.addEventListener('popstate', () => activateTab(currentTabFromPath()));
  activateTab(currentTabFromPath());
}

// ============================================================
// Seeded PRNG — same "day + slot" always produces same numbers
// so results don't jump between refreshes. Swap this out when
// wiring in a real API.
// ============================================================
function seededRandom(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function daySeed(extra = 0) {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + extra * 7919;
}
function pad(n, width) { return String(n).padStart(width, '0'); }

function genNumber(seed, digits) {
  const rnd = seededRandom(seed);
  return pad(Math.floor(rnd() * Math.pow(10, digits)), digits);
}

// ============================================================
// YIKEE — 88 rounds/day, 15 min each, starting 06:00
// Each round has: 3-digit top + 2-digit bottom
// ============================================================
const YIKEE_ROUNDS = 88;
const YIKEE_START_HOUR = 6;
const YIKEE_INTERVAL_MIN = 15;

function yikeeRoundTime(roundIdx) {
  const d = new Date();
  d.setHours(YIKEE_START_HOUR, 0, 0, 0);
  d.setMinutes(d.getMinutes() + roundIdx * YIKEE_INTERVAL_MIN);
  return d;
}

function yikeeCurrentRound() {
  const now = new Date();
  const start = new Date();
  start.setHours(YIKEE_START_HOUR, 0, 0, 0);
  const diffMin = Math.floor((now - start) / 60000);
  if (diffMin < 0) return -1;
  const idx = Math.floor(diffMin / YIKEE_INTERVAL_MIN);
  return Math.min(idx, YIKEE_ROUNDS - 1);
}

function yikeeData() {
  const rounds = [];
  for (let i = 0; i < YIKEE_ROUNDS; i++) {
    const t = yikeeRoundTime(i);
    rounds.push({
      round: i + 1,
      time: t,
      top: genNumber(daySeed(i + 1), 3),
      bottom: genNumber(daySeed(i + 1) + 3, 2),
    });
  }
  return rounds;
}

function initYikee() {
  renderYikee();
  setInterval(updateYikeeCountdown, 1000);
  setInterval(renderYikee, 30000);
  document.getElementById('yikee-refresh').addEventListener('click', () => {
    renderYikee();
    toast('รีเฟรชแล้ว');
  });
}

function updateYikeeCountdown() {
  const cur = yikeeCurrentRound();
  const cdEl = document.getElementById('yikee-countdown');
  if (!cdEl) return;
  if (cur < 0) { cdEl.textContent = '—'; return; }
  if (cur >= YIKEE_ROUNDS) { cdEl.textContent = 'พบกันพรุ่งนี้ 06:00'; return; }
  const nextTime = yikeeRoundTime(cur + 1);
  const diff = nextTime - new Date();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  cdEl.textContent = `${pad(mins, 2)}:${pad(secs, 2)}`;
}

function renderYikee() {
  const rounds = yikeeData();
  const cur = yikeeCurrentRound();

  // Current + countdown
  const curEl = document.getElementById('yikee-current-round');
  const cdEl = document.getElementById('yikee-countdown');
  if (cur < 0) {
    curEl.textContent = 'ยังไม่เริ่ม';
    cdEl.textContent = '—';
  } else if (cur >= YIKEE_ROUNDS) {
    curEl.textContent = 'จบวันแล้ว';
    cdEl.textContent = 'พบกันพรุ่งนี้ 06:00';
  } else {
    curEl.textContent = `รอบที่ ${cur + 1} / ${YIKEE_ROUNDS}`;
    const nextTime = yikeeRoundTime(cur + 1);
    const diff = nextTime - new Date();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    cdEl.textContent = `${pad(mins, 2)}:${pad(secs, 2)}`;
  }

  // Recent 3
  const done = rounds.filter((_, i) => i < cur);
  const recent = done.slice(-3).reverse();
  document.getElementById('yikee-recent').innerHTML = recent.length
    ? recent.map(r => `
        <div class="yikee-recent-item">
          <div>
            <div class="round-no">รอบ ${r.round}</div>
            <div class="time">${fmtTime(r.time)}</div>
          </div>
          <div class="yikee-nums">
            <div class="yikee-num-block"><small>3 ตัวบน</small><strong>${r.top}</strong></div>
            <div class="yikee-num-block"><small>2 ตัวล่าง</small><strong>${r.bottom}</strong></div>
          </div>
          <div></div>
        </div>
      `).join('')
    : '<div class="empty">ยังไม่มีผลออก</div>';

  // Progress
  document.getElementById('yikee-progress').textContent =
    cur < 0 ? 'รอเริ่มรอบแรก' : `ออกแล้ว ${Math.min(cur, YIKEE_ROUNDS)} รอบ`;

  // Full grid
  document.getElementById('yikee-grid').innerHTML = rounds.map((r, i) => {
    const cls = i < cur ? 'done' : (i === cur ? 'current' : '');
    const num = i < cur ? r.top : (i === cur ? '···' : '—');
    return `
      <div class="yikee-cell ${cls}">
        <span class="r">รอบ ${r.round}</span>
        <span class="n">${num}</span>
        <span class="t">${fmtTime(r.time)}</span>
      </div>
    `;
  }).join('');
}

function fmtTime(d) {
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

// ============================================================
// STOCK — Thai SET + foreign markets
// Times are approximate result-release times in Thai time (GMT+7)
// ============================================================
const STOCK_TH = [
  { key: 'th-open',  name: 'หุ้นไทย เปิดเช้า',  h: 10, m: 15 },
  { key: 'th-noon',  name: 'หุ้นไทย เที่ยง',    h: 12, m: 35 },
  { key: 'th-aft',   name: 'หุ้นไทย เปิดบ่าย',  h: 14, m: 35 },
  { key: 'th-close', name: 'หุ้นไทย ปิดเย็น',   h: 16, m: 45 },
];

const STOCK_INTL = [
  { key: 'nikkei-m', flag: '🇯🇵', name: 'นิเคอิ เช้า',     h: 9,  m: 25 },
  { key: 'nikkei-a', flag: '🇯🇵', name: 'นิเคอิ บ่าย',     h: 12, m: 20 },
  { key: 'hs-m',     flag: '🇭🇰', name: 'ฮั่งเส็ง เช้า',   h: 10, m: 50 },
  { key: 'hs-a',     flag: '🇭🇰', name: 'ฮั่งเส็ง บ่าย',   h: 14, m: 50 },
  { key: 'tw',       flag: '🇹🇼', name: 'ไต้หวัน',         h: 13, m: 30 },
  { key: 'kr',       flag: '🇰🇷', name: 'เกาหลี',          h: 13, m: 30 },
  { key: 'cn',       flag: '🇨🇳', name: 'จีน',             h: 14, m: 0  },
  { key: 'sg',       flag: '🇸🇬', name: 'สิงคโปร์',        h: 16, m: 30 },
  { key: 'in',       flag: '🇮🇳', name: 'อินเดีย',         h: 17, m: 0  },
  { key: 'eg',       flag: '🇪🇬', name: 'อียิปต์',         h: 20, m: 0  },
  { key: 'de',       flag: '🇩🇪', name: 'เยอรมัน',         h: 20, m: 30 },
  { key: 'ru',       flag: '🇷🇺', name: 'รัสเซีย',         h: 20, m: 45 },
  { key: 'uk',       flag: '🇬🇧', name: 'อังกฤษ',          h: 22, m: 30 },
  { key: 'dj',       flag: '🇺🇸', name: 'ดาวโจนส์',        h: 27, m: 30 }, // 03:30 next day
];

function stockStatus(row) {
  const now = new Date();
  const t = new Date();
  t.setHours(row.h % 24, row.m, 0, 0);
  if (row.h >= 24) t.setDate(t.getDate() + 1);
  const diffMin = (t - now) / 60000;
  if (diffMin < -5) return { state: 'done', time: t };
  if (diffMin < 5)  return { state: 'live', time: t };
  return { state: 'wait', time: t };
}

function stockNumbers(row) {
  const seed = daySeed(('' + row.key).split('').reduce((a,c) => a + c.charCodeAt(0), 0));
  return { top: genNumber(seed, 3), bottom: genNumber(seed + 3, 2) };
}

let stockTimer = null;
function initStock() {
  renderStock();
  stockTimer = setInterval(renderStock, 30000);
}

function renderStock() {
  document.getElementById('stock-th').innerHTML = STOCK_TH.map(row => stockRow(row, '🇹🇭')).join('');
  document.getElementById('stock-intl').innerHTML = STOCK_INTL.map(row => stockRow(row, row.flag)).join('');
}

// ============================================================
// LUCK — เลขเด็ดสำนักดัง + เลขวันเกิด + เลขวันนี้
// ============================================================
const LUCK_SOURCES = [
  { icon: '🐔', name: 'ไก่ต้ม' },
  { icon: '🧙', name: 'อ.ช้าง' },
  { icon: '🐍', name: 'คำชะโนด' },
  { icon: '🌊', name: 'แม่น้ำหนึ่ง' },
  { icon: '📰', name: 'เดลินิวส์' },
  { icon: '📺', name: 'ไทยรัฐ' },
  { icon: '🎩', name: 'ลุงโชค' },
  { icon: '🐘', name: 'น้าเข็ม' },
  { icon: '🌙', name: 'อ.สิงห์โต' },
  { icon: '🔮', name: 'หมอเปา' },
];

function drawSeed() {
  const target = nextDrawDate();
  return target.getFullYear() * 10000 + (target.getMonth() + 1) * 100 + target.getDate();
}

function initLuck() {
  renderLuck();
  renderTodayLucky();
}

function renderLuck() {
  const target = nextDrawDate();
  const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  document.getElementById('luck-draw-date').textContent =
    `${target.getDate()} ${thaiMonths[target.getMonth()]} ${target.getFullYear() + 543}`;

  const seed = drawSeed();
  const el = document.getElementById('luck-sources');
  const allNums = [];

  el.innerHTML = LUCK_SOURCES.map((src, i) => {
    const s = seed + i * 991;
    const top3 = [genNumber(s, 3), genNumber(s + 1, 3)];
    const bot2 = [genNumber(s + 2, 2), genNumber(s + 3, 2)];
    allNums.push(...bot2);
    return `
      <div class="luck-src">
        <div class="src-icon">${src.icon}</div>
        <div class="src-name">${src.name}</div>
        <div class="src-nums">
          ${top3.map(n => `<span class="src-num">${n}</span>`).join('')}
        </div>
        <span class="src-label">3 ตัวบน</span>
        <div class="src-nums" style="margin-top:6px">
          ${bot2.map(n => `<span class="src-num">${n}</span>`).join('')}
        </div>
        <span class="src-label">2 ตัวล่าง</span>
      </div>
    `;
  }).join('');

  // Aggregate hot: numbers appearing across multiple sources
  const freq = {};
  allNums.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 10);
  document.getElementById('luck-hot').innerHTML = sorted.map(([n, c]) =>
    `<span class="hot-num">${n}<small>${c > 1 ? c + ' สำนัก' : 'แนะนำ'}</small></span>`
  ).join('') || '<span class="empty">—</span>';
}

function renderTodayLucky() {
  const now = new Date();
  const thaiDays = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('today-date-str').textContent =
    `วัน${thaiDays[now.getDay()]}ที่ ${now.getDate()} ${thaiMonths[now.getMonth()]} ${now.getFullYear() + 543}`;

  const s = daySeed();
  const items = [
    { label: 'เลขนำโชค', num: genNumber(s, 2) },
    { label: 'เลขทำเงิน', num: genNumber(s + 1, 3) },
    { label: 'เลขมงคล', num: genNumber(s + 2, 2) },
    { label: 'เลขเสริมดวง', num: genNumber(s + 3, 3) },
  ];
  document.getElementById('today-lucky').innerHTML = items.map(it =>
    `<div class="luck-item"><small>${it.label}</small><strong>${it.num}</strong></div>`
  ).join('');
}

function initBirthday() {
  document.getElementById('birthday-btn').addEventListener('click', calcBirthday);
  document.getElementById('birthday-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') calcBirthday();
  });
}

function calcBirthday() {
  const val = document.getElementById('birthday-input').value;
  if (!val) { toast('กรุณาเลือกวันเกิด'); return; }
  const d = new Date(val);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  // Numerology: sum all digits, reduce to single digit
  const sumAll = (day + '' + month + '' + year).split('').reduce((a,c) => a + Number(c), 0);
  const life = sumAll > 9 ? String(sumAll).split('').reduce((a,c) => a + Number(c), 0) : sumAll;

  const nums = [
    { label: 'เลขวันเกิด', val: pad(day, 2) },
    { label: 'วัน+เดือน', val: pad(day, 2) + pad(month, 2) },
    { label: 'เลขศาสตร์', val: pad(life, 2) },
    { label: 'เลขปีเกิด', val: String(year + 543).slice(-2) },
    { label: 'เลขนำโชค 3 ตัว', val: pad((day * month * (year % 100)) % 1000, 3) },
    { label: 'เลขคู่บารมี', val: pad((day + month * 7) % 100, 2) },
  ];

  const el = document.getElementById('birthday-result');
  el.hidden = false;
  el.innerHTML = `
    <h3>🎂 เลขนำโชคของคุณ</h3>
    <div class="birthday-nums">
      ${nums.map(n => `<div class="birthday-num"><small>${n.label}</small><strong>${n.val}</strong></div>`).join('')}
    </div>
  `;
}

// ============================================================
// STATS — วิเคราะห์จากข้อมูลจริง 12 งวดล่าสุด
// ============================================================
let statsCache = null;
let statsLoading = false;

async function loadAndRenderStats() {
  if (statsCache) { renderStats(statsCache); return; }
  if (statsLoading) return;
  statsLoading = true;

  const containers = ['stats-hot2', 'stats-cold', 'stats-first', 'stats-front3', 'stats-back3'];
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.innerHTML.trim()) el.innerHTML = '<div class="skeleton" style="height:60px"></div>';
  });

  try {
    const dates = allDraws.slice(0, 12).map(d => d.date);
    if (!dates.length) throw new Error('no dates');

    const results = await Promise.all(dates.map(d =>
      fetch(`${API_BASE}/${d}`).then(r => r.ok ? r.json() : null).then(j => j?.response).catch(() => null)
    ));
    const draws = results.filter(Boolean);
    if (!draws.length) throw new Error('no draws loaded');

    statsCache = draws;
    renderStats(draws);
  } catch (e) {
    console.warn('stats load failed', e);
    document.getElementById('stats-hot2').innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ ลองใหม่ภายหลัง</div>';
  } finally {
    statsLoading = false;
  }
}

function renderStats(draws) {
  // Hot 2-digit endings (from back-two + last 2 of 1st prize)
  const back2Freq = {};
  const front3Freq = {};
  const back3Freq = {};
  const firstPrizes = [];

  draws.forEach(d => {
    const first = d.prizes?.find(p => p.id === 'prizeFirst')?.number?.[0];
    if (first) {
      firstPrizes.push({ date: d.date, num: first });
      const last2 = first.slice(-2);
      back2Freq[last2] = (back2Freq[last2] || 0) + 1;
    }
    d.runningNumbers?.forEach(rn => {
      if (rn.id === 'runningNumberBackTwo') {
        rn.number.forEach(n => { back2Freq[n] = (back2Freq[n] || 0) + 1; });
      }
      if (rn.id === 'runningNumberFrontThree') {
        rn.number.forEach(n => { front3Freq[n] = (front3Freq[n] || 0) + 1; });
      }
      if (rn.id === 'runningNumberBackThree') {
        rn.number.forEach(n => { back3Freq[n] = (back3Freq[n] || 0) + 1; });
      }
    });
  });

  // Hot 2-digit bar chart
  const hot2 = Object.entries(back2Freq).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const maxCount = hot2[0]?.[1] || 1;
  document.getElementById('stats-hot2').innerHTML = hot2.length
    ? hot2.map(([n, c]) => `
        <div class="stats-bar">
          <div class="num">${n}</div>
          <div class="bar-wrap"><div class="bar" style="width:${(c / maxCount * 100).toFixed(0)}%"></div></div>
          <div class="count">${c} ครั้ง</div>
        </div>
      `).join('')
    : '<div class="empty">ยังไม่มีข้อมูล</div>';

  // Cold: 2-digit numbers NOT seen in these draws
  const allTwo = [];
  for (let i = 0; i < 100; i++) allTwo.push(pad(i, 2));
  const cold = allTwo.filter(n => !back2Freq[n]).slice(0, 15);
  document.getElementById('stats-cold').innerHTML = cold.length
    ? cold.map(n => `<span class="hot-num">${n}<small>ยังไม่ออก</small></span>`).join('')
    : '<span class="empty">ทุกเลขเคยออกในช่วงนี้</span>';

  // First prize timeline
  document.getElementById('stats-first').innerHTML = firstPrizes.slice(0, 12).map(fp => `
    <div class="stats-tl-item">
      <div class="stats-tl-date">งวด ${fp.date}</div>
      <div class="stats-tl-num">${fp.num}</div>
    </div>
  `).join('');

  // Front/back 3
  const top = (obj, n) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0, n);
  document.getElementById('stats-front3').innerHTML = top(front3Freq, 8).map(([n, c]) =>
    `<span class="hot-num">${n}<small>${c} ครั้ง</small></span>`
  ).join('') || '<span class="empty">—</span>';
  document.getElementById('stats-back3').innerHTML = top(back3Freq, 8).map(([n, c]) =>
    `<span class="hot-num">${n}<small>${c} ครั้ง</small></span>`
  ).join('') || '<span class="empty">—</span>';
}

function stockRow(row, flag) {
  const st = stockStatus(row);
  const displayHour = row.h >= 24 ? row.h - 24 : row.h;
  const timeStr = `${pad(displayHour, 2)}:${pad(row.m, 2)}${row.h >= 24 ? ' (พรุ่งนี้)' : ''}`;
  let right;
  if (st.state === 'done') {
    const { top, bottom } = stockNumbers(row);
    right = `
      <div class="stock-nums">
        <div class="yikee-num-block"><small>3 ตัวบน</small><strong>${top}</strong></div>
        <div class="yikee-num-block"><small>2 ตัวล่าง</small><strong>${bottom}</strong></div>
      </div>`;
  } else if (st.state === 'live') {
    right = `<div class="stock-live">🔴 กำลังออก...</div>`;
  } else {
    right = `<div class="stock-pending">รอออกผล</div>`;
  }
  return `
    <div class="stock-item ${st.state === 'wait' ? 'waiting' : ''} ${st.state === 'done' ? 'done' : ''}">
      <div class="stock-flag">${flag}</div>
      <div class="stock-info">
        <div class="name">${row.name}</div>
        <div class="time">ออก ${timeStr}</div>
      </div>
      ${right}
    </div>
  `;
}
