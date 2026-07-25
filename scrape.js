#!/usr/bin/env node
// ============================================================
// scrape.js — Fetch latest Thai lottery result from public sites,
//             merge into data/draws.json.
//
// Usage:
//   node scrape.js                # try all sources, keep first that works
//   node scrape.js --source=sanook
//   node scrape.js --debug        # save raw HTML to .cache/ for inspection
//
// Sources are best-effort; HTML structures change without notice.
// If none work today, add draws to data/draws.json manually.
// ============================================================

const fs = require('fs');
const path = require('path');

const DEBUG = process.argv.includes('--debug');
const ONLY_SOURCE = (process.argv.find(a => a.startsWith('--source=')) || '').split('=')[1] || null;
const DATA_FILE = path.join(__dirname, 'data', 'draws.json');
const CACHE_DIR = path.join(__dirname, '.cache');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ---- Sources ----
const SOURCES = {
  sanook: {
    name: 'Sanook',
    url:  'https://news.sanook.com/lotto/',
  },
  kapook: {
    name: 'Kapook',
    url:  'https://lotto.kapook.com/',
  },
  glo: {
    name: 'GLO (Official)',
    url:  'https://www.glo.or.th/',
  },
};

// ============================================================
// Helpers
// ============================================================
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function pad(n, w) { return String(n).padStart(w, '0'); }

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// Strip HTML tags but keep text + spaces
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Heuristic extractor — searches for labels then grabs following digit sequence.
function extractFromText(text) {
  const findAfter = (labelRe, digits, count = 1) => {
    const re = new RegExp(labelRe + '[^0-9]{0,80}?((?:\\d{' + digits + '}[^0-9]{0,10}){1,' + count + '})', 'g');
    const results = [];
    for (const m of text.matchAll(re)) {
      const nums = m[1].match(new RegExp('\\d{' + digits + '}', 'g')) || [];
      results.push(...nums);
    }
    return results;
  };

  const first  = (findAfter('รางวัลที่\\s*1', 6)[0]) || null;
  const front3 = [...new Set(findAfter('เลขหน้า\\s*3\\s*ตัว', 3, 3))].slice(0, 2);
  const back3  = [...new Set(findAfter('เลขท้าย\\s*3\\s*ตัว', 3, 3))].slice(0, 2);
  const back2  = (findAfter('เลขท้าย\\s*2\\s*ตัว', 2)[0]) || null;

  return { first, front3, back3, back2 };
}

// Best-effort date extractor
function extractDate(text) {
  const thaiMonths = { 'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12 };
  // e.g. "16 กรกฎาคม 2569" or "16 กรกฎาคม 2569"
  const re = new RegExp('(\\d{1,2})\\s*(' + Object.keys(thaiMonths).join('|') + ')\\s*(25\\d{2})');
  const m = text.match(re);
  if (m) return `${pad(m[1], 2)}/${pad(thaiMonths[m[2]], 2)}/${m[3]}`;
  // e.g. "16/07/2569"
  const m2 = text.match(/(\d{1,2})\/(\d{1,2})\/(25\d{2})/);
  if (m2) return `${pad(m2[1], 2)}/${pad(m2[2], 2)}/${m2[3]}`;
  return null;
}

function inferMostRecentDrawDate() {
  const now = new Date();
  let d = new Date(now);
  d.setHours(18, 0, 0, 0); // draws announce ~15-16, use 18 as cutoff
  if (now < d) d.setDate(d.getDate() - 1);
  // walk back until day = 1 or 16
  while (d.getDate() !== 1 && d.getDate() !== 16) d.setDate(d.getDate() - 1);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear() + 543}`;
}

function isValidDraw(d) {
  return d && /^\d{6}$/.test(d.first || '') && /^\d{2}$/.test(d.back2 || '');
}

// ============================================================
// Scrape one source
// ============================================================
async function scrapeSource(key) {
  const src = SOURCES[key];
  console.log(`\n[${key}] ${src.name} → ${src.url}`);

  let html;
  try {
    html = await fetchHtml(src.url);
    console.log(`  ✓ fetched ${(html.length / 1024).toFixed(0)}kb`);
  } catch (e) {
    console.log(`  ✗ fetch failed: ${e.message}`);
    return null;
  }

  if (DEBUG) {
    ensureDir(CACHE_DIR);
    const cachePath = path.join(CACHE_DIR, `${key}.html`);
    fs.writeFileSync(cachePath, html);
    console.log(`  💾 saved raw HTML → ${cachePath}`);
  }

  const text = stripHtml(html);
  const draw = extractFromText(text);
  const date = extractDate(text) || inferMostRecentDrawDate();

  console.log(`  parsed: date=${date} first=${draw.first || '—'} back2=${draw.back2 || '—'} front3=[${draw.front3.join(',')}] back3=[${draw.back3.join(',')}]`);

  if (!isValidDraw(draw)) {
    console.log(`  ✗ parse failed (missing required fields).  Re-run with --debug to save HTML for inspection.`);
    return null;
  }

  console.log(`  ✓ valid draw extracted`);
  return { date, ...draw };
}

// ============================================================
// Merge into data/draws.json (dedupe by date)
// ============================================================
function mergeDraw(newDraw) {
  ensureDir(path.dirname(DATA_FILE));
  let list = [];
  if (fs.existsSync(DATA_FILE)) {
    try { list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || []; } catch {}
  }
  const idx = list.findIndex(d => d && d.date === newDraw.date);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...newDraw };
    console.log(`\n✓ Updated existing draw for ${newDraw.date}`);
  } else {
    list.unshift(newDraw);
    console.log(`\n✓ Added new draw for ${newDraw.date}`);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2) + '\n');
  console.log(`  → wrote ${list.length} draws to ${DATA_FILE}`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  const keys = ONLY_SOURCE ? [ONLY_SOURCE] : Object.keys(SOURCES);
  if (ONLY_SOURCE && !SOURCES[ONLY_SOURCE]) {
    console.error(`Unknown source: ${ONLY_SOURCE}. Options: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(1);
  }

  for (const key of keys) {
    const draw = await scrapeSource(key);
    if (draw) {
      mergeDraw(draw);
      console.log(`\nNext: run "node build.js" to regenerate draw pages`);
      return;
    }
  }

  console.log('\n✗ No source succeeded.');
  console.log('  Options:');
  console.log('   • Re-run with --debug to save HTMLs, then inspect .cache/*.html');
  console.log('   • Add draws manually to data/draws.json (see data/draws.example.json)');
  process.exit(2);
}

main().catch(e => { console.error('scrape.js crashed:', e); process.exit(1); });
