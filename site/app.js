/* Sitewright website: theme toggle, mobile menu, reveal-on-scroll, steps, gallery tabs, install tabs, copy buttons. No dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- theme ---- */
  var themeBtn = $('#theme');
  function isDark() { return root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function paintTheme() {
    themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.innerHTML = isDark()
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';
  }
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('sitewright-theme', next); } catch (e) { /* private mode */ }
    paintTheme();
  });
  paintTheme();

  /* ---- mobile menu ---- */
  var menu = $('#menu'), nav = $('#nav');
  function closeMenu() { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ---- reveal on scroll ---- */
  var reveals = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
    // never leave anything hidden if the observer misbehaves
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('in'); }); }, 4500);
  }

  /* ---- steps + terminal ---- */
  var steps = $$('.step'), panes = $$('.term .pane');
  function showStep(i) {
    steps.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    panes.forEach(function (p, k) { p.classList.toggle('on', k === i); });
  }
  steps.forEach(function (s, i) { s.addEventListener('click', function () { stopAuto(); showStep(i); }); });
  var auto = null, cur = 0;
  function stopAuto() { if (auto) { clearInterval(auto); auto = null; } }
  if (!reduced && 'IntersectionObserver' in window) {
    var termIO = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !auto) { auto = setInterval(function () { cur = (cur + 1) % steps.length; showStep(cur); }, 4200); }
      else if (!en[0].isIntersecting) { stopAuto(); }
    }, { threshold: 0.5 });
    termIO.observe($('.term'));
    $$('.step, .term').forEach(function (el) { el.addEventListener('pointerenter', stopAuto); });
  }

  /* ---- gallery ---- */
  var A = 'assets/shots/';
  var BRANDS = [
    { id: 'coffee', name: 'Bean & Barrel', tag: 'Small-batch coffee, roasted to order.', colors: ['#7a4a21', '#e8a33d'], url: 'beanandbarrel.example',
      mods: ['landing', 'signin', 'dashboard', 'connect', 'mfa', 'publishing'], main: 'coffee/landing-hero', side: 'coffee/dashboard', phone: 'coffee/dashboard-mobile',
      alt: ['coffee roaster landing page', 'orders dashboard', 'orders dashboard on a phone'] },
    { id: 'legal', name: 'Halden Legal', tag: 'Straight answers on property law. Matters, fees, stages, documents.', colors: ['#1b2a4a', '#c9a227'], url: 'halden.example',
      mods: ['landing', 'signin', 'dashboard', 'connect'], main: 'legal/landing-hero', side: 'legal/dashboard', phone: 'legal/dashboard-mobile',
      alt: ['law firm landing page', 'matters dashboard', 'matters dashboard on a phone'] },
    { id: 'yellow', name: 'Sunny Side Bakery', tag: 'Fresh bread before breakfast. A near-white brand colour, kept readable.', colors: ['#ffe600', '#fff3a0'], url: 'sunnyside.example',
      mods: ['landing', 'signin', 'dashboard'], main: 'yellow/landing-hero', side: 'yellow/dashboard', phone: 'yellow/dashboard-mobile',
      alt: ['bakery landing page', 'bakes dashboard', 'bakes dashboard on a phone'] },
    { id: 'studio', name: 'Pixel Studio', tag: 'Design for small teams. Landing page plus MFA-protected team area.', colors: ['#6d28d9', '#22d3ee'], url: 'pixelstudio.example',
      mods: ['landing', 'mfa'], main: 'studio/landing-hero', side: 'studio/admin-home', phone: 'studio/landing-mobile',
      alt: ['design studio landing page', 'team area with accounts and activity log', 'landing page on a phone'] },
    { id: 'orbit', name: 'Orbit Labs', tag: 'Just the landing page. No database, no sign-in.', colors: ['#5b21b6', '#06b6d4'], url: 'orbit.example',
      mods: ['landing'], main: 'landingonly/landing-hero', side: 'landingonly/landing-story', phone: 'landingonly/landing-mobile',
      alt: ['landing page', 'landing page story section', 'landing page on a phone'] }
  ];
  var tabs = $('#brand-tabs');
  BRANDS.forEach(function (b, i) {
    var t = document.createElement('button');
    t.className = 'tab'; t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    t.style.setProperty('--c', b.colors[0] === '#ffe600' ? '#c9b100' : b.colors[0]);
    t.innerHTML = '<i></i>' + b.name.replace('&', '&amp;');
    t.addEventListener('click', function () { show(i); });
    tabs.appendChild(t);
  });
  var imgMain = $('#g-main'), imgSide = $('#g-side'), imgPhone = $('#g-phone');
  function show(i) {
    var b = BRANDS[i];
    $$('.tab', tabs).forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    imgMain.src = A + b.main + '.jpg'; imgMain.alt = 'Generated ' + b.alt[0];
    imgSide.src = A + b.side + '.jpg'; imgSide.alt = 'Generated ' + b.alt[1];
    imgPhone.src = A + b.phone + '.jpg'; imgPhone.alt = 'Generated ' + b.alt[2];
    $('#g-url').textContent = b.url + ' — generated by Sitewright';
    $('#g-name').textContent = b.name;
    $('#g-tag').textContent = b.tag;
    $('#g-modules').innerHTML = b.mods.map(function (m) { return '<span>' + m + '</span>'; }).join('');
    $('#g-sw').innerHTML = '<b style="background:' + b.colors[0] + '"></b><b style="background:' + b.colors[1] + '"></b>' + b.colors[0] + ' / ' + b.colors[1];
  }
  show(0);

  /* ---- install tabs ---- */
  var osBtns = $$('.os-tabs button');
  var guess = /Win/i.test(navigator.platform || navigator.userAgent) ? 'win' : 'mac';
  function showOs(id) {
    osBtns.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.os === id ? 'true' : 'false'); });
    $$('.panel').forEach(function (p) { p.classList.toggle('on', p.dataset.panel === id); });
  }
  osBtns.forEach(function (b) { b.addEventListener('click', function () { showOs(b.dataset.os); }); });
  showOs(guess);

  /* ---- copy buttons ---- */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Select & copy'; }
        document.body.removeChild(ta);
      }
    });
  });
})();
