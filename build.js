#!/usr/bin/env node
// ============================================================
// build.js — Generate static SEO pages from index.html template
//
//   node build.js                # build using default DOMAIN
//   DOMAIN=https://mysite.com node build.js
//   node build.js --no-fetch     # skip API calls, only build tab pages
//
// Outputs to ./dist
// ============================================================

const fs = require('fs');
const path = require('path');

const DOMAIN = (process.env.DOMAIN || 'https://checkhuay.com').replace(/\/$/, '');
const API_BASE = 'https://lotto.api.rayriffy.com';
const SKIP_FETCH = process.argv.includes('--no-fetch');
const MAX_DRAW_PAGES = 60; // last ~2.5 years
const MEDIANET_CID = process.env.MEDIANET_CID || ''; // e.g. "8CU1234567"

const ADSENSE_LOADER_HTML = MEDIANET_CID
  ? `<script src="//contextual.media.net/nmedianet.js?cid=${MEDIANET_CID}" async></script>`
  : '';

const SRC = __dirname;
const DIST = path.join(SRC, 'dist');

// ---- Static assets to copy verbatim ----
const STATIC_ASSETS = [
  'app.js', 'style.css', 'manifest.json', 'robots.txt',
  'og-image.svg', 'og-image.png',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

// ---- Tab route definitions (must match app.js TAB_META) ----
const TABS = {
  gov:   { path: '/',           title: 'เช็คหวย - ตรวจหวยรัฐบาล งวดล่าสุด หวยยี่กี หวยหุ้น เลขเด็ด',      desc: 'ตรวจหวยรัฐบาลงวดล่าสุด ย้อนหลัง หวยยี่กี หวยหุ้น เลขเด็ดสำนักดัง สถิติหวย บันทึกเลขให้เช็คอัตโนมัติ อัพเดตทุกวัน' },
  luck:  { path: '/lek-ded/',   title: 'เลขเด็ดงวดนี้ เลขเด็ดสำนักดัง คำนวณเลขวันเกิด | เช็คหวย',        desc: 'เลขเด็ดสำนักดังทั้ง 10 สำนัก งวดล่าสุด คำนวณเลขนำโชคจากวันเกิด เลขเด็ดวันนี้ อัพเดตทุกงวด' },
  stats: { path: '/sathiti/',   title: 'สถิติหวย เลขออกบ่อย เลขนานแล้วไม่ออก | เช็คหวย',                desc: 'สถิติหวยย้อนหลัง 12 งวด เลขท้าย 2 ตัวออกบ่อยที่สุด เลขที่นานแล้วไม่ออก รางวัลที่ 1 ย้อนหลัง' },
  yikee: { path: '/yikee/',     title: 'หวยยี่กี 88 รอบ ผลสด อัพเดตทุก 15 นาที | เช็คหวย',              desc: 'ผลหวยยี่กีแบบเรียลไทม์ 88 รอบต่อวัน 3 ตัวบน 2 ตัวล่าง นับถอยหลังรอบถัดไป' },
  stock: { path: '/hun/',       title: 'หวยหุ้น หุ้นไทย ต่างประเทศ นิเคอิ ฮั่งเส็ง ดาวโจนส์ | เช็คหวย', desc: 'ผลหวยหุ้นไทย 4 รอบ และหวยหุ้นต่างประเทศ 14 ตลาด นิเคอิ ฮั่งเส็ง ไต้หวัน เกาหลี ดาวโจนส์' },
};

// ============================================================
// Helpers
// ============================================================
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyStatics() {
  STATIC_ASSETS.forEach(name => {
    const src = path.join(SRC, name);
    if (!fs.existsSync(src)) { console.warn(`  skip (missing): ${name}`); return; }
    copyFile(src, path.join(DIST, name));
    console.log(`  ✓ ${name}`);
  });
}

function readTemplate() {
  return fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
}

// Slug for a draw date like "16 กรกฎาคม 2569" or "16/07/2569" → "16-07-2569"
function drawSlug(date) {
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const parts = date.split(/[\/\s]/).filter(Boolean);
  if (parts.length !== 3) return null;
  let [d, m, y] = parts;
  if (isNaN(m)) {
    const idx = thaiMonths.indexOf(m);
    if (idx < 0) return null;
    m = String(idx + 1);
  }
  return `${d.padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

function drawHumanDate(date) { return date; }

// ============================================================
// Template rewriting
// ============================================================
function rewritePage(tpl, { title, desc, canonical, initialTab, drawInject, extraJson }) {
  let html = tpl;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(desc)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(desc)}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(desc)}$2`);

  // Replace DOMAIN in absolute URLs pointing to og-image, icons, manifest
  html = html.replace(/https:\/\/checkhuay\.com/g, DOMAIN);

  // Set initial tab on body
  html = html.replace(/<body>/, `<body data-initial-tab="${initialTab}">`);

  // Inject pre-rendered results HTML for the gov tab if provided
  if (drawInject) {
    html = html.replace(
      /(<div id="results" class="results">)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1${drawInject.html}$2`
    );
    // Also inject window.__DRAW__ before app.js loads
    html = html.replace(
      /<script src="app\.js"><\/script>/,
      `<script>window.__DRAW__=${JSON.stringify(drawInject.data)};</script>\n  <script src="app.js"></script>`
    );
  }

  // Extra JSON-LD (e.g. NewsArticle for a specific draw)
  if (extraJson) {
    html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(extraJson)}</script>\n</head>`);
  }

  // AdSense loader (injected only when ADSENSE_CLIENT env is set)
  html = html.replace('<!--ADSENSE_LOADER-->', ADSENSE_LOADER_HTML);

  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// ============================================================
// Render results HTML server-side (mirror app.js renderResults)
// ============================================================
function fmtMoney(n) { return Number(n).toLocaleString('th-TH'); }

function renderResultsHTML(draw) {
  const parts = [];
  const first = draw.prizes?.find(p => p.id === 'prizeFirst');
  if (first) {
    parts.push(`
      <div class="prize first">
        <div>
          <div class="prize-label">รางวัลที่ 1</div>
          <div class="prize-name">${fmtMoney(first.reward)} บาท</div>
        </div>
        <div class="prize-number">${first.number[0]}</div>
      </div>`);
  }
  (draw.runningNumbers || []).forEach(rn => {
    parts.push(`
      <div class="prize-group">
        <div class="prize-name">${escapeHtml(rn.name)} · ${fmtMoney(rn.reward)} บาท</div>
        <div class="prize-group-numbers">
          ${rn.number.map(n => `<span class="mini-number">${escapeHtml(n)}</span>`).join('')}
        </div>
      </div>`);
  });
  (draw.prizes || []).filter(p => p.id !== 'prizeFirst').forEach(p => {
    parts.push(`
      <div class="prize-group">
        <div class="prize-name">${escapeHtml(p.name)} · ${fmtMoney(p.reward)} บาท (${p.amount} รางวัล)</div>
        <div class="prize-group-numbers">
          ${p.number.slice(0, 10).map(n => `<span class="mini-number">${escapeHtml(n)}</span>`).join('')}
          ${p.number.length > 10 ? `<span class="mini-number">+${p.number.length - 10}</span>` : ''}
        </div>
      </div>`);
  });
  return parts.join('\n');
}

// ============================================================
// API
// ============================================================
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } catch (e) {
    const cause = e.cause?.code || e.cause?.message || e.code || e.message;
    throw new Error(`${cause} — ${url}`);
  }
}

async function fetchDrawList() {
  const j = await fetchJson(`${API_BASE}/list`);
  return (j.response || []).slice(0, MAX_DRAW_PAGES);
}

async function fetchDraw(date) {
  const j = await fetchJson(`${API_BASE}/${date}`);
  return j.response;
}

// ---- Local data loader (data/draws.json) ----
function loadLocalDraws() {
  const p = path.join(SRC, 'data', 'draws.json');
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(d => d && !d._comment_only)
      .map(expandDraw);
  } catch (e) {
    console.warn(`  ⚠ invalid data/draws.json: ${e.message}`);
    return [];
  }
}

// Auto-detect simple vs full format; return full format used by renderer
function expandDraw(d) {
  if (d.prizes && Array.isArray(d.prizes)) return d; // already full format
  if (!d.date || !d.first) return null;
  return {
    date: d.date,
    endpoint: 'local',
    prizes: [
      { id: 'prizeFirst',  name: 'รางวัลที่ 1', reward: '6000000', amount: 1,  number: [d.first] },
      ...(d.near1 ? [{ id: 'prizeNear1', name: 'รางวัลข้างเคียงรางวัลที่ 1', reward: '100000', amount: 2, number: d.near1 }] : []),
      ...(d.second ? [{ id: 'prizeSecond', name: 'รางวัลที่ 2', reward: '200000', amount: 5,  number: d.second }] : []),
      ...(d.third  ? [{ id: 'prizeThird',  name: 'รางวัลที่ 3', reward: '80000',  amount: 10, number: d.third  }] : []),
      ...(d.fourth ? [{ id: 'prizeFourth', name: 'รางวัลที่ 4', reward: '40000',  amount: 50, number: d.fourth }] : []),
      ...(d.fifth  ? [{ id: 'prizeFifth',  name: 'รางวัลที่ 5', reward: '20000',  amount: 100, number: d.fifth }] : []),
    ],
    runningNumbers: [
      { id: 'runningNumberFrontThree', name: 'เลขหน้า 3 ตัว', reward: '4000', amount: 2, number: d.front3 || [] },
      { id: 'runningNumberBackThree',  name: 'เลขท้าย 3 ตัว', reward: '4000', amount: 2, number: d.back3  || [] },
      { id: 'runningNumberBackTwo',    name: 'เลขท้าย 2 ตัว', reward: '2000', amount: 1, number: d.back2 ? [d.back2] : [] },
    ],
  };
}

// ============================================================
// Build steps
// ============================================================
function buildTabPage(tpl, tab) {
  const meta = TABS[tab];
  const canonical = DOMAIN + meta.path;
  const html = rewritePage(tpl, { title: meta.title, desc: meta.desc, canonical, initialTab: tab });
  const outPath = tab === 'gov'
    ? path.join(DIST, 'index.html')
    : path.join(DIST, meta.path.replace(/^\/|\/$/g, ''), 'index.html');
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, html);
  console.log(`  ✓ ${meta.path}`);
}

function buildDrawPage(tpl, draw) {
  const slug = drawSlug(draw.date);
  if (!slug) { console.warn(`  skip (bad date): ${draw.date}`); return null; }

  const path_ = `/huay/${slug}/`;
  const canonical = DOMAIN + path_;
  const first = draw.prizes?.find(p => p.id === 'prizeFirst')?.number?.[0] || '';
  const back2 = draw.runningNumbers?.find(r => r.id === 'runningNumberBackTwo')?.number?.[0] || '';

  const title = `ตรวจหวย ${draw.date} - รางวัลที่ 1 ${first} เลขท้าย 2 ตัว ${back2} | เช็คหวย`;
  const desc = `ผลหวยรัฐบาล งวดวันที่ ${draw.date} รางวัลที่ 1 ${first} เลขท้าย 2 ตัว ${back2} พร้อมเลขท้าย 3 ตัว เลขหน้า 3 ตัว รางวัลที่ 2-5`;

  const extraJson = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: desc,
    datePublished: draw.date,
    author: { '@type': 'Organization', name: 'เช็คหวย' },
    publisher: { '@type': 'Organization', name: 'เช็คหวย', logo: { '@type': 'ImageObject', url: `${DOMAIN}/icon-512.png` } },
    mainEntityOfPage: canonical,
  };

  const drawInject = { html: renderResultsHTML(draw), data: draw };
  const html = rewritePage(tpl, { title, desc, canonical, initialTab: 'gov', drawInject, extraJson });

  const outPath = path.join(DIST, 'huay', slug, 'index.html');
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, html);
  return { slug, path: path_, date: draw.date };
}

function buildSitemap(drawUrls) {
  const now = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: DOMAIN + '/',          changefreq: 'daily',  priority: '1.0' },
    { loc: DOMAIN + '/lek-ded/',  changefreq: 'daily',  priority: '0.9' },
    { loc: DOMAIN + '/sathiti/',  changefreq: 'weekly', priority: '0.8' },
    { loc: DOMAIN + '/yikee/',    changefreq: 'hourly', priority: '0.9' },
    { loc: DOMAIN + '/hun/',      changefreq: 'hourly', priority: '0.9' },
    { loc: DOMAIN + '/about/',    changefreq: 'yearly', priority: '0.3' },
    { loc: DOMAIN + '/privacy/',  changefreq: 'yearly', priority: '0.3' },
    { loc: DOMAIN + '/terms/',    changefreq: 'yearly', priority: '0.3' },
    ...drawUrls.map(u => ({ loc: DOMAIN + u.path, changefreq: 'monthly', priority: '0.7' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);
  console.log(`  ✓ sitemap.xml (${urls.length} URLs)`);
}

// ---- Content pages (about, privacy, terms) ----
function buildContentPage(fragmentPath) {
  const raw = fs.readFileSync(fragmentPath, 'utf8');
  const meta = {};
  const commentMatch = raw.match(/<!--\s*([\s\S]*?)\s*-->/);
  if (commentMatch) {
    commentMatch[1].split('\n').forEach(line => {
      const m = line.match(/^\s*(\w+):\s*(.+)\s*$/);
      if (m) meta[m[1]] = m[2].trim();
    });
  }
  if (!meta.slug || !meta.title) throw new Error(`missing slug/title in ${fragmentPath}`);
  const body = raw.replace(/<!--[\s\S]*?-->/, '').trim();
  const canonical = `${DOMAIN}/${meta.slug}/`;
  const fullTitle = `${meta.title} | เช็คหวย`;
  const desc = meta.desc || meta.title;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#b91c1c" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta name="robots" content="index, follow" />
  <meta name="google-site-verification" content="OMA5NpiOj1ypcJwtqmkka_8lsfV5Hp5cScdHf46J_ak" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="th_TH" />
  <meta property="og:site_name" content="เช็คหวย" />
  <meta property="og:title" content="${escapeHtml(fullTitle)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${DOMAIN}/og-image.png" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🎯%3C/text%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=Kanit:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
  ${ADSENSE_LOADER_HTML}
</head>
<body>
  <header class="hero">
    <div class="brand">
      <a href="/" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <span class="logo">🎯</span>
        <div>
          <h1 style="font-size:22px">เช็คหวย</h1>
          <p class="tag">รัฐบาล · ยี่กี · หวยหุ้น</p>
        </div>
      </a>
    </div>
  </header>
  <main>
    <article class="content-page">
      ${body}
    </article>
  </main>
  <footer>
    <nav class="footer-links">
      <a href="/">หน้าแรก</a>
      <a href="/about/">เกี่ยวกับเรา</a>
      <a href="/privacy/">นโยบายความเป็นส่วนตัว</a>
      <a href="/terms/">ข้อกำหนดการใช้งาน</a>
      <a href="mailto:contact@checkhuay.com">ติดต่อ</a>
    </nav>
    <p class="tiny">© ${new Date().getFullYear()} เช็คหวย</p>
  </footer>
</body>
</html>`;

  const outPath = path.join(DIST, meta.slug, 'index.html');
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, html);
  console.log(`  ✓ /${meta.slug}/`);
}

function buildContentPages() {
  const dir = path.join(SRC, 'pages');
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
    buildContentPage(path.join(dir, f));
  });
}

function buildRobots() {
  const content = `User-agent: *
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST, 'robots.txt'), content);
  console.log(`  ✓ robots.txt`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log(`Building for DOMAIN=${DOMAIN}`);
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
  ensureDir(DIST);

  console.log('\n[1/4] Copying static assets...');
  copyStatics();

  const tpl = readTemplate();

  console.log('\n[2/4] Building tab pages + content pages...');
  Object.keys(TABS).forEach(tab => buildTabPage(tpl, tab));
  buildContentPages();
  if (MEDIANET_CID) console.log(`  ✓ Media.net loader injected (cid=${MEDIANET_CID})`);
  else console.log(`  ℹ Media.net loader NOT injected (set MEDIANET_CID env to enable)`);

  let drawUrls = [];
  const localDraws = loadLocalDraws();

  if (localDraws.length > 0) {
    console.log(`\n[3/4] Building per-draw pages from data/draws.json (${localDraws.length} draws)...`);
    drawUrls = localDraws.map(d => buildDrawPage(tpl, d)).filter(Boolean);
    console.log(`  ✓ ${drawUrls.length} draw pages`);
  } else if (!SKIP_FETCH) {
    console.log('\n[3/4] data/draws.json is empty — falling back to API fetch...');
    try {
      const list = await fetchDrawList();
      console.log(`  found ${list.length} draws — fetching details...`);
      const draws = [];
      const CONCURRENCY = 6;
      for (let i = 0; i < list.length; i += CONCURRENCY) {
        const batch = list.slice(i, i + CONCURRENCY);
        const batchDraws = await Promise.all(batch.map(d => fetchDraw(d.date).catch(e => { console.warn(`  skip ${d.date}: ${e.message}`); return null; })));
        draws.push(...batchDraws.filter(Boolean));
        process.stdout.write(`\r  progress: ${draws.length}/${list.length}`);
      }
      console.log('');
      drawUrls = draws.map(d => buildDrawPage(tpl, d)).filter(Boolean);
      console.log(`  ✓ ${drawUrls.length} draw pages`);
    } catch (e) {
      console.warn(`  ⚠ API fetch failed: ${e.message}`);
      console.warn(`  → Try running: node scrape.js   (or add draws to data/draws.json manually)`);
    }
  } else {
    console.log('\n[3/4] Skipping API fetch (--no-fetch)');
  }

  console.log('\n[4/4] Sitemap + robots...');
  buildSitemap(drawUrls);
  buildRobots();

  console.log(`\n✓ Done. Output: ${DIST}`);
  console.log(`  Deploy the ./dist folder to Netlify / Vercel / GitHub Pages / any static host.`);
}

main().catch(e => { console.error(e); process.exit(1); });
