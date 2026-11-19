/* PTE Coach — shared core: data, storage, spaced repetition, speech, scoring, time tracking */
(function () {
  const V = '1';
  const P = 'pte:';
  const PTE = (window.PTE = {});

  /* ---------- storage (localStorage, fails soft) ---------- */
  PTE.get = (k, d) => { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  PTE.set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} };

  PTE.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  PTE.addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- data ---------- */
  const cache = {};
  PTE.load = (path) => cache[path] || (cache[path] = fetch(path + '?v=' + V + '-' + Date.now().toString(36).slice(0, -3)).then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }));
  PTE.words = async () => {
    if (PTE._wmap) return PTE._wmap;
    const list = await PTE.load('data/words.json');
    PTE._wlist = list; PTE._wmap = {};
    list.forEach((x, i) => { x.i = i; PTE._wmap[x.w.toLowerCase()] = x; });
    return PTE._wmap;
  };
  PTE.currentDay = async () => {
    const idx = await PTE.load('data/days/index.json');
    const n = PTE.get('viewDay', null) || idx.current;
    const day = await PTE.load('data/days/day' + String(n).padStart(2, '0') + '.json');
    day.latest = idx.current;
    return day;
  };

  /* ---------- daily stats ---------- */
  PTE.stats = (date) => {
    const all = PTE.get('stats', {});
    return all[date || PTE.today()] || { mins: {}, newWords: [], review: { ok: 0, bad: 0, wrong: [] }, wfd: [], rs: [], ra: [], cloze: { ok: 0, bad: 0, wrong: [] }, mcq: { ok: 0, bad: 0 }, writing: [], done: [] };
  };
  PTE.saveStats = (s, date) => { const all = PTE.get('stats', {}); all[date || PTE.today()] = s; PTE.set('stats', all); };
  PTE.updateStats = (fn) => { const s = PTE.stats(); fn(s); PTE.saveStats(s); return s; };

  /* ---------- active time tracking per module ---------- */
  PTE.track = (module) => {
    let last = Date.now(), active = !document.hidden, idle = 0;
    const flush = () => {
      const now = Date.now();
      const name = typeof module === 'function' ? module() : module;
      if (active && idle < 120) PTE.updateStats(s => { s.mins[name] = Math.round(((s.mins[name] || 0) + (now - last) / 60000) * 100) / 100; });
      last = now;
    };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => addEventListener(e, () => { idle = 0; }, { passive: true }));
    setInterval(() => { idle += 15; flush(); }, 15000);
    document.addEventListener('visibilitychange', () => { flush(); active = !document.hidden; last = Date.now(); });
    addEventListener('pagehide', flush);
  };

  /* ---------- spaced repetition (Leitner, expanding intervals) ---------- */
  const GAPS = [0, 1, 2, 4, 7, 15, 30, 60]; // box -> days until next review
  PTE.srs = () => PTE.get('srs', {});
  PTE.learn = (word) => { // first exposure in reading
    const s = PTE.srs(); const k = word.toLowerCase();
    if (!s[k]) { s[k] = { box: 1, due: PTE.addDays(PTE.today(), 1), first: PTE.today(), ok: 0, bad: 0 }; PTE.set('srs', s); PTE.updateStats(st => { if (!st.newWords.includes(k)) st.newWords.push(k); }); }
  };
  PTE.grade = (word, correct) => {
    const s = PTE.srs(); const k = word.toLowerCase();
    const it = s[k] || { box: 1, first: PTE.today(), ok: 0, bad: 0 };
    if (correct) { it.box = Math.min(it.box + 1, GAPS.length - 1); it.ok++; } else { it.box = 1; it.bad++; }
    it.due = PTE.addDays(PTE.today(), correct ? GAPS[it.box] : 1);
    s[k] = it; PTE.set('srs', s);
    PTE.updateStats(st => { if (correct) st.review.ok++; else { st.review.bad++; if (!st.review.wrong.includes(k)) st.review.wrong.push(k); } });
  };
  PTE.due = () => { const s = PTE.srs(), t = PTE.today(); return Object.keys(s).filter(k => s[k].due <= t); };

  /* ---------- speech ---------- */
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)); };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  PTE.voices = () => voices;
  PTE.pickVoice = () => {
    const want = PTE.get('voice', '');
    return voices.find(v => v.name === want) || voices.find(v => /en[-_]AU/i.test(v.lang)) || voices.find(v => /en[-_]GB/i.test(v.lang)) || voices[0];
  };
  PTE.speak = (text, opts = {}) => new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = PTE.pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
    u.rate = opts.rate || PTE.get('rate', 0.95);
    u.onend = u.onerror = () => res();
    speechSynthesis.speak(u);
  });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  PTE.canRecognize = !!SR;
  PTE.listen = (maxMs, onPartial) => new Promise((res) => {
    if (!SR) return res(null);
    const r = new SR(); r.lang = 'en-AU'; r.continuous = true; r.interimResults = true;
    let finalText = '', timer, heard = 0;
    const silence = setInterval(() => { if (heard && Date.now() - heard > 2500) r.stop(); }, 300);
    r.onresult = (e) => {
      heard = Date.now();
      let interim = ''; finalText = '';
      for (let i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '; else interim += e.results[i][0].transcript; }
      onPartial && onPartial((finalText + interim).trim());
    };
    r.onerror = () => {};
    let interimLast = '';
    const origOnResult = r.onresult;
    r.onresult = (e) => { origOnResult(e); interimLast = ''; for (let i = 0; i < e.results.length; i++) if (!e.results[i].isFinal) interimLast += e.results[i][0].transcript; };
    r.onend = () => { clearTimeout(timer); clearInterval(silence); res((finalText + ' ' + interimLast).trim()); };
    r.start();
    timer = setTimeout(() => r.stop(), maxMs);
    PTE._stopListen = () => r.stop();
  });

  /* ---------- scoring helpers ---------- */
  PTE.tokens = (s) => (s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' -]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  // WFD style: one point per target word present in answer (each answer word used once), order-free
  PTE.wordScore = (target, answer) => {
    const t = PTE.tokens(target), pool = PTE.tokens(answer);
    const marks = t.map(w => { const j = pool.indexOf(w); if (j >= 0) { pool.splice(j, 1); return true; } return false; });
    return { score: marks.filter(Boolean).length, total: t.length, marks, words: (target.match(/\S+/g) || []) };
  };
  PTE.esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- icons (24px stroke set) ---------- */
  const I = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 7h7"/>',
    cards: '<rect x="3" y="7" width="13" height="14" rx="2.5"/><path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5V16"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-8M21 20H3"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke-linejoin="round"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>',
    vol: '<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    slow: '<path d="M3.5 18a9 9 0 1 1 17 0"/><path d="M12 14l-3.5-4"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
    head: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19.5 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-4.6-4-6.4-4.6-11.2C11.5 5.6 10 8.4 10 10.6 9 9.8 8.3 8.7 8.1 7.4 6.2 9.3 5 11.9 5 15.2 5 19.2 8 22 12 22z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    spark: '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>',
    coffee: '<path d="M4 8h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5v2.5M12 2.5v2.5"/>',
    flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    leaf: '<path d="M5 21c0-9 5-15 16-16-1 11-7 16-16 16z"/><path d="M5 21l8-8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  };
  PTE.icon = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;
  PTE.MOD = {
    guide: { n: '题型', ic: 'compass', c: '#7C5CFF' }, read: { n: '阅读学词', ic: 'book', c: '#3BA9FF' }, review: { n: '复习', ic: 'cards', c: '#FFB020' },
    speak: { n: '口语', ic: 'mic', c: '#FF6F91' }, break: { n: '休息', ic: 'coffee', c: '#21C38E' }, listen: { n: '听力', ic: 'head', c: '#14B8B0' },
    reading: { n: '阅读题', ic: 'eye', c: '#5B6CFF' }, write: { n: '写作', ic: 'pen', c: '#FF7A59' }, wrap: { n: '汇报', ic: 'flag', c: '#1B1A2E' },
  };

  /* ---------- layout ---------- */
  PTE.nav = (active) => {
    const items = [['index.html', '今日', 'home'], ['read.html', '阅读', 'book'], ['review.html', '复习', 'cards'], ['drill.html', '训练', 'target'], ['guide.html', '题型', 'compass'], ['log.html', '复盘', 'chart']];
    const el = document.createElement('header');
    el.className = 'appbar';
    el.innerHTML = '<a class="logo" href="index.html"><img src="assets/logo.svg" alt=""><span>PTE <b>Rise</b></span></a><nav class="tabbar">' + items.map(([h, t, ic]) => `<a href="${h}"${h === active ? ' class="on"' : ''}>${PTE.icon(ic)}<span>${t}</span></a>`).join('') + '</nav>';
    document.body.prepend(el);
    if (!document.querySelector('link[rel=icon]')) { const l = document.createElement('link'); l.rel = 'icon'; l.href = 'assets/logo.svg'; document.head.appendChild(l); }
  };
  PTE.toast = (msg) => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  PTE.ring = (pct, size = 64, stroke = 7, inner = '') => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<span style="position:relative;display:inline-grid;place-items:center;width:${size}px;height:${size}px"><svg class="ring" width="${size}" height="${size}"><circle class="bgc" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-width:${stroke}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-width:${stroke};stroke-dasharray:${c};stroke-dashoffset:${c}" data-off="${off}"/></svg><span style="position:absolute;font-weight:800;font-size:${size / 4.2}px">${inner}</span></span>`;
  };
  PTE.animateRings = (root = document) => requestAnimationFrame(() => setTimeout(() => root.querySelectorAll('.ring .fg[data-off]').forEach(c => { c.style.strokeDashoffset = c.dataset.off; }), 60));
  PTE.streak = () => { // consecutive days with >= 20 active minutes, counting today if already qualified
    const all = PTE.get('stats', {}); let n = 0, d = PTE.today();
    const ok = (k) => all[k] && Object.values(all[k].mins || {}).reduce((a, b) => a + b, 0) >= 20;
    if (!ok(d)) d = PTE.addDays(d, -1);
    while (ok(d)) { n++; d = PTE.addDays(d, -1); }
    return n;
  };
  PTE.confetti = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv);
    const ctx = cv.getContext('2d'); const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cols = ['#6C5CFF', '#FF6F91', '#FFC845', '#21C38E', '#3BA9FF', '#9B5CFF'];
    const ps = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - .5) * 120, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, c: cols[Math.random() * cols.length | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .3 }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.6); ctx.restore(); });
      if (++f < 150) requestAnimationFrame(tick); else cv.remove();
    })();
  };
  PTE.sheet = (html) => {
    const s = document.createElement('div'); s.className = 'scrim';
    s.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
    s.onclick = (e) => { if (e.target === s) s.remove(); };
    document.body.appendChild(s); return s;
  };
})();
