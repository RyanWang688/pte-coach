/* Drag any word (or long-press on touch) into the wordbook.
   Desktop: drop on the sidebar「生词本」item. Mobile: floating dock. */
(function () {
  const PTE = window.PTE;
  const SEL = '.w, .tw, .diff span, [data-word]';
  const onWords = location.pathname.endsWith('words.html');
  const desk = () => matchMedia('(min-width:1024px)').matches;
  const side = () => document.querySelector('.tabbar [data-drop]');

  const dock = document.createElement('a');
  dock.className = 'dock'; dock.href = 'words.html'; dock.setAttribute('aria-label', '生词本');
  dock.innerHTML = PTE.icon('cards') + '<span class="badge hidden"></span><span class="dlabel">松手加入生词本</span>';
  if (!onWords) document.body.appendChild(dock);
  const target = () => (desk() || onWords) ? side() : dock;

  PTE.updateDock = (bump) => {
    const s = PTE.srs(); const t = PTE.today();
    const starred = Object.keys(s).filter(k => s[k].star);
    const due = PTE.due().length;
    const n = due || starred.length;
    [dock.querySelector('.badge'), document.querySelector('.tabbar .nbadge')].forEach(b => {
      if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); b.classList.toggle('due', !!due);
    });
    const tg = target();
    if (bump && tg) { tg.classList.remove('bump'); void tg.offsetWidth; tg.classList.add('bump'); }
  };
  PTE.updateDock();

  // first-time hint
  if (!PTE.get('dragHint', 0)) {
    setTimeout(() => {
      if (!document.querySelector('.article, .diff')) return;
      const h = document.createElement('div'); h.className = 'coachmark';
      h.innerHTML = `<b>${PTE.icon('spark')} 收藏生词</b><br>遇到不认识的词，<b>按住拖动</b>到${desk() ? '左侧的「生词本」' : '右下角的生词本按钮'}${desk() ? '' : '（手机上先长按）'}。之后会按记忆曲线换不同题型考你。<div style="margin-top:10px"><button class="sm acc">知道了</button></div>`;
      document.body.appendChild(h); h.querySelector('button').onclick = () => { h.remove(); PTE.set('dragHint', 1); };
    }, 1200);
  }

  let st = null, ghost = null, dragging = false, suppress = false;
  const wordOf = (el) => (el.dataset.word || el.dataset.lemma || el.textContent || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  const over = (x, y) => { const tg = target(); if (!tg) return false; const r = tg.getBoundingClientRect(); const m = desk() ? 12 : 40; return x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m; };

  function begin(e) {
    dragging = true;
    ghost = document.createElement('div'); ghost.className = 'dragchip'; ghost.textContent = st.word;
    document.body.appendChild(ghost); move(e.clientX, e.clientY);
    document.body.classList.add('dragging'); dock.classList.add('open');
    const s = side(); if (s) s.classList.add('droptarget');
    st.el.classList.add('picked');
    if (navigator.vibrate) navigator.vibrate(12);
    window.getSelection && getSelection().removeAllRanges();
  }
  function move(x, y) { if (!ghost) return; ghost.style.transform = `translate(${x}px,${y}px)`; const tg = target(); if (tg) tg.classList.toggle('hot', over(x, y)); }
  function end(e, cancel) {
    clearTimeout(st && st.timer);
    if (dragging) {
      const hit = !cancel && over(e.clientX, e.clientY);
      const g = ghost; ghost = null;
      if (hit) { g.classList.add('drop'); PTE.collect(st.word, location.pathname.split('/').pop()); setTimeout(() => g.remove(), 300); }
      else g.remove();
      document.body.classList.remove('dragging'); dock.classList.remove('open', 'hot');
      const s = side(); if (s) s.classList.remove('droptarget', 'hot');
      st.el.classList.remove('picked');
      suppress = true; setTimeout(() => suppress = false, 50);
    }
    dragging = false; st = null;
  }

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(SEL);
    if (!el || e.button > 0 || e.target.closest('input,textarea,button')) return;
    const word = wordOf(el); if (!/^[A-Za-z][A-Za-z'’-]+$/.test(word)) return;
    st = { el, word, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    if (st.touch) st.timer = setTimeout(() => { if (st) begin(e); }, 300);
  });
  document.addEventListener('pointermove', (e) => {
    if (!st) return;
    const d = Math.hypot(e.clientX - st.x, e.clientY - st.y);
    if (!dragging) {
      if (st.touch) { if (d > 10) { clearTimeout(st.timer); st = null; } return; }
      if (d > 6) begin(e); else return;
    }
    e.preventDefault(); move(e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', (e) => st && end(e));
  document.addEventListener('pointercancel', (e) => st && end(e, true));
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest(SEL)) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest(SEL)) e.preventDefault(); });
})();
