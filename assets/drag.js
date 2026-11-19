/* Drag any word (or long-press on touch) into the floating wordbook dock */
(function () {
  const PTE = window.PTE;
  const SEL = '.w, .tw, .diff span, [data-word]';
  if (location.pathname.endsWith('words.html')) { PTE.updateDock = () => {}; return; }

  const dock = document.createElement('a');
  dock.className = 'dock'; dock.href = 'words.html'; dock.setAttribute('aria-label', '生词本');
  dock.innerHTML = PTE.icon('cards') + '<span class="badge hidden"></span><span class="dlabel">松手加入生词本</span>';
  document.body.appendChild(dock);

  PTE.updateDock = (bump) => {
    const s = PTE.srs(); const t = PTE.today();
    const starred = Object.keys(s).filter(k => s[k].star);
    const due = starred.filter(k => s[k].due <= t).length;
    const b = dock.querySelector('.badge');
    b.textContent = due || starred.length; b.classList.toggle('hidden', !starred.length); b.classList.toggle('due', !!due);
    if (bump) { dock.classList.remove('bump'); void dock.offsetWidth; dock.classList.add('bump'); }
  };
  PTE.updateDock();

  // first-time hint
  if (!PTE.get('dragHint', 0) && document.querySelector('.article, .diff')) {
    setTimeout(() => {
      const h = document.createElement('div'); h.className = 'coachmark';
      h.innerHTML = `<b>${PTE.icon('spark')} 小技巧</b><br>遇到生词，<b>拖动</b>它（手机上<b>长按</b>再拖）到这里，就能收进生词本，之后按记忆曲线换着题型考你。<br><button class="sm pri" style="margin-top:8px">知道了</button>`;
      document.body.appendChild(h); h.querySelector('button').onclick = () => { h.remove(); PTE.set('dragHint', 1); };
    }, 1200);
  }

  let st = null, ghost = null, dragging = false, suppress = false;
  const wordOf = (el) => (el.dataset.word || el.dataset.lemma || el.textContent || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  const over = (x, y) => { const r = dock.getBoundingClientRect(); return x > r.left - 40 && x < r.right + 40 && y > r.top - 40 && y < r.bottom + 40; };

  function begin(e) {
    dragging = true;
    ghost = document.createElement('div'); ghost.className = 'dragchip'; ghost.textContent = st.word;
    document.body.appendChild(ghost); move(e.clientX, e.clientY);
    document.body.classList.add('dragging'); dock.classList.add('open');
    st.el.classList.add('picked');
    if (navigator.vibrate) navigator.vibrate(12);
    window.getSelection && getSelection().removeAllRanges();
  }
  function move(x, y) { if (!ghost) return; ghost.style.transform = `translate(${x}px,${y}px)`; dock.classList.toggle('hot', over(x, y)); }
  function end(e, cancel) {
    clearTimeout(st && st.timer);
    if (dragging) {
      const hit = !cancel && over(e.clientX, e.clientY);
      const g = ghost; ghost = null;
      if (hit) { g.classList.add('drop'); PTE.collect(st.word, location.pathname.split('/').pop()); setTimeout(() => g.remove(), 300); }
      else g.remove();
      document.body.classList.remove('dragging'); dock.classList.remove('open', 'hot');
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
