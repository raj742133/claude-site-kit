#!/usr/bin/env node
// Builds the website's icon browser from the pack that ships with the kit, so the page always shows exactly what works offline:
//   node tools/make-icon-gallery.mjs
// Writes site/icons/index.html (every icon, grouped, with search and click-to-copy) and the small preview between the
// <!-- icons:preview:start/end --> markers in site/index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'skill/sitewright/templates/icons/lucide.json'), 'utf8'));
const have = new Set(Object.keys(pack.icons));

const CATEGORIES = [
  ['Interface', 'plus minus x check check-check search filter sliders-horizontal settings cog menu ellipsis refresh-cw rotate-ccw undo-2 redo-2 save copy trash-2 pencil pen-line square-pen scissors paperclip link external-link eye eye-off power plug'],
  ['Arrows', 'arrow-right arrow-left arrow-up arrow-down arrow-up-right chevron-right chevron-down'],
  ['Status and feedback', 'circle-check circle-x circle-alert triangle-alert info circle-help ban bell bell-ring flag bookmark star heart thumbs-up smile sparkles wand-sparkles badge-check award trophy crown'],
  ['Devices and tech', 'smartphone tablet laptop monitor wifi signal bluetooth battery zap cpu server hard-drive database terminal code git-branch bug cloud cloud-upload cloud-download qr-code scan-line scan-barcode barcode'],
  ['Commerce and delivery', 'shopping-cart shopping-bag store credit-card wallet receipt banknote coins tag tags percent gift package package-check package-open box boxes truck handshake'],
  ['Food and drink', 'coffee utensils cake-slice pizza wine beer wheat apple carrot fish egg milk'],
  ['People and security', 'user users user-check user-plus user-round id-card key-round lock lock-open shield shield-check fingerprint'],
  ['Communication and media', 'mail message-circle message-square phone send share-2 mic video camera image images music'],
  ['Files and data', 'file file-text file-check folder folder-open archive download upload clipboard-list clipboard-check list-checks list layers layout-grid layout-dashboard table newspaper book-open'],
  ['Charts and time', 'chart-bar chart-line chart-pie trending-up trending-down activity gauge target calendar calendar-check clock timer hourglass history'],
  ['Places and travel', 'house map-pin map compass navigation globe building-2 factory warehouse hospital car bike plane ship tree-pine mountain'],
  ['Work, health and nature', 'briefcase graduation-cap scale gavel stethoscope pill dumbbell hammer wrench ruler pocket-knife palette brush paintbrush shirt lightbulb puzzle rocket sun moon droplet flame leaf sprout'],
].map(([title, names]) => ({ title, slug: title.toLowerCase().replace(/[^a-z]+/g, '-'), icons: names.split(/\s+/).filter((n) => have.has(n)) }));
const placed = new Set(CATEGORIES.flatMap((c) => c.icons));
const rest = [...have].filter((n) => !placed.has(n)).sort();
if (rest.length) CATEGORIES.push({ title: 'More', slug: 'more', icons: rest });

const svg = (name, size = 24) => `<svg class="ic" viewBox="0 0 ${pack.width} ${pack.height}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${pack.icons[name].body}</svg>`;
const total = have.size;
const count = CATEGORIES.reduce((n, c) => n + c.icons.length, 0);
if (count !== total) throw new Error(`categories hold ${count} icons, the pack has ${total}`);

const cards = CATEGORIES.map((c) => `
    <section class="ic-cat" id="${c.slug}" data-cat="${c.slug}">
      <h2>${c.title} <span>${c.icons.length}</span></h2>
      <ul class="ic-grid">
${c.icons.map((n) => `        <li data-name="${n}"><button type="button" class="ic-card" data-id="lucide:${n}" aria-label="Copy lucide:${n}">${svg(n)}<span>${n}</span></button></li>`).join('\n')}
      </ul>
    </section>`).join('\n');
const chips = ['<button type="button" class="ic-chip on" data-cat="all">All <span>' + total + '</span></button>', ...CATEGORIES.map((c) => `<button type="button" class="ic-chip" data-cat="${c.slug}">${c.title} <span>${c.icons.length}</span></button>`)].join('\n        ');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icons · Sitewright</title>
<meta name="description" content="The ${total} icons that ship with Sitewright and work with no network, by category, with the whole Iconify library (200,000+ open icons) behind them.">
<meta name="theme-color" content="#f3f5fa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0e16" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="https://sitewright-skill.vercel.app/icons/">
<link rel="icon" href="../assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="../style.css">
<script>try{var t=localStorage.getItem('sitewright-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="../" aria-label="Sitewright home">
      <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5.5 L40 14.75 V33.25 L24 42.5 L8 33.25 V14.75 Z" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="24" r="6.5" fill="var(--signal)"/></svg>
      Sitewright
    </a>
    <nav id="nav" aria-label="Main">
      <a href="../">Home</a>
      <a href="../#effects">Effects</a>
      <a href="./" aria-current="page">Icons</a>
      <a class="btn gh" href="https://github.com/raj742133/sitewright" rel="noopener">GitHub</a>
    </nav>
    <button class="icon-btn" id="theme" type="button" aria-label="Switch colour theme" title="Switch colour theme">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>
    </button>
  </div>
</header>

<main id="main" class="wrap ic-page">
  <div class="sec-head">
    <span class="eyebrow">Icons</span>
    <h1>${total} icons that work with no network.</h1>
    <p>These ship inside Sitewright, so a site can have icons without asking anyone for them. Click one to copy its name, then put it in your config (<code>"icon": "coffee"</code>) or let <code>icons: auto</code> pick. Behind them is the whole <a href="https://iconify.design" rel="noopener">Iconify</a> library, 200,000+ open icons in 150+ sets, which you reach by naming a set: <code>tabler:home</code>, <code>mdi:account</code>.</p>
  </div>

  <div class="ic-sets" aria-label="Icon sets">
    <div><b>${total}</b><span>in the kit, offline</span></div>
    <div><b>1,866</b><span>Lucide, the default set</span></div>
    <div><b>6,220</b><span>Tabler</span></div>
    <div><b>1,402</b><span>Font Awesome 6 Solid (credit required)</span></div>
    <div><b>200,000+</b><span>across 150+ sets, through Iconify</span></div>
  </div>

  <div class="ic-tools">
    <label class="ic-search"><span class="sr">Search icons</span>
      <input id="ic-q" type="search" placeholder="Search ${total} icons, e.g. truck, lock, chart" autocomplete="off">
    </label>
    <div class="ic-chips" role="group" aria-label="Categories">
        ${chips}
    </div>
  </div>
  <p class="ic-note" id="ic-note" role="status" aria-live="polite">Click an icon to copy its id.</p>
${cards}
  <p class="ic-empty" id="ic-empty" hidden>No icon matches that. Try a shorter word, or search the full library with <code>node scaffold.mjs --list-icons &lt;word&gt;</code>.</p>

  <div class="ic-how card-like">
    <h2>Using them</h2>
<pre tabindex="0" aria-label="Commands for using icons"><code>node scaffold.mjs --config site.json --out ./my-site --icons auto
node scaffold.mjs --list-icons coffee                                 # search the full library
node scaffold.mjs --apply-icons ./my-site --icon stats.0=package      # change one later, in a second</code></pre>
    <p class="muted">Lucide is ISC licensed (with some icons derived from Feather, MIT); the licence text is written into every site that uses them. Other sets keep their own licences, which the generator records and checks. <a href="https://github.com/raj742133/sitewright/blob/main/skill/sitewright/reference/icons.md" rel="noopener">Full guide</a>.</p>
  </div>
</main>

<footer>
  <div class="wrap foot">
    <div><b style="color:var(--ink)">Sitewright</b> &middot; a Claude Code skill &middot; MIT licence<br>Icons: <a href="https://lucide.dev" rel="noopener">Lucide</a> (ISC) through <a href="https://iconify.design" rel="noopener">Iconify</a>; found with <a href="https://github.com/better-auth/better-icons" rel="noopener">better-icons</a>.</div>
    <nav aria-label="Footer">
      <a href="../">Home</a>
      <a href="https://github.com/raj742133/sitewright" rel="noopener">GitHub</a>
    </nav>
  </div>
</footer>

<script>
(function () {
  var root = document.documentElement, KEY = 'sitewright-theme';
  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
  });
  var q = document.getElementById('ic-q'), note = document.getElementById('ic-note'), empty = document.getElementById('ic-empty');
  var cats = [].slice.call(document.querySelectorAll('.ic-cat')), chips = [].slice.call(document.querySelectorAll('.ic-chip')), cat = 'all';
  function apply() {
    var words = q.value.toLowerCase().split(/[\\s,-]+/).filter(Boolean), shown = 0;
    cats.forEach(function (c) {
      var inCat = cat === 'all' || c.dataset.cat === cat, n = 0;
      [].forEach.call(c.querySelectorAll('li'), function (li) {
        var ok = inCat && words.every(function (w) { return li.dataset.name.indexOf(w) > -1; });
        li.hidden = !ok; if (ok) n++;
      });
      c.hidden = n === 0; shown += n;
    });
    empty.hidden = shown !== 0;
    note.textContent = shown + (shown === 1 ? ' icon' : ' icons') + (words.length || cat !== 'all' ? ' match' : '') + '. Click one to copy its id.';
  }
  q.addEventListener('input', apply);
  chips.forEach(function (b) { b.addEventListener('click', function () { cat = b.dataset.cat; chips.forEach(function (x) { x.classList.toggle('on', x === b); }); apply(); }); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ic-card'); if (!b) return;
    var id = b.dataset.id;
    function done() { note.textContent = 'Copied ' + id; b.classList.add('copied'); setTimeout(function () { b.classList.remove('copied'); }, 900); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(done, function () { note.textContent = id; });
    else note.textContent = id;
  });
})();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'site/icons'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'site/icons/index.html'), page);

// the preview on the home page: a strip of icons and the categories, with a link to the full page
const sample = ['coffee', 'truck', 'package', 'credit-card', 'chart-line', 'users', 'lock', 'smartphone', 'qr-code', 'calendar', 'mail', 'map-pin', 'shield-check', 'rocket', 'house', 'camera', 'file-text', 'bell', 'search', 'star', 'heart', 'wifi', 'stethoscope', 'scale', 'dumbbell', 'palette', 'graduation-cap', 'utensils'].filter((n) => have.has(n));
const preview = `<!-- icons:preview:start (generated by tools/make-icon-gallery.mjs) -->
    <div class="ic-preview reveal">
      <div class="ic-preview-head"><div><h3>${total} icons ship with it, in ${CATEGORIES.length} groups</h3><p class="muted">${CATEGORIES.map((c) => c.title).join(', ')}. Behind them: Lucide's ${'1,866'}, Tabler's 6,220, and the rest of Iconify's 200,000+.</p></div>
        <a class="btn primary" href="icons/">Browse all ${total} icons</a></div>
      <ul class="ic-strip" aria-label="A sample of the icons">
${sample.map((n) => `        <li title="${n}">${svg(n, 26)}</li>`).join('\n')}
      </ul>
    </div>
    <!-- icons:preview:end -->`;
let home = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
if (home.includes('<!-- icons:preview:start')) home = home.replace(/<!-- icons:preview:start[\s\S]*?<!-- icons:preview:end -->/, preview);
else {
  const anchor = '    <div class="fx-live reveal">';
  if (!home.includes(anchor)) throw new Error('anchor for the preview not found in site/index.html');
  home = home.replace(anchor, preview + '\n\n' + anchor);
}
fs.writeFileSync(path.join(ROOT, 'site/index.html'), home);
console.log(`wrote site/icons/index.html (${total} icons in ${CATEGORIES.length} groups; ${CATEGORIES.map((c) => `${c.title} ${c.icons.length}`).join(', ')}) and the home page preview`);
