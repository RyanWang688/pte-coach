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

  /* ---------- layout ---------- */
  PTE.nav = (active) => {
    const items = [['index.html', '今日'], ['read.html', '阅读学词'], ['review.html', '单词复习'], ['drill.html', '题型训练'], ['guide.html', '题型指南'], ['log.html', '复盘']];
    const el = document.createElement('header');
    el.className = 'top';
    el.innerHTML = '<a class="brand" href="index.html">PTE Coach</a><nav>' + items.map(([h, t]) => `<a href="${h}"${h === active ? ' class="on"' : ''}>${t}</a>`).join('') + '</nav>';
    document.body.prepend(el);
  };
  PTE.toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
})();
