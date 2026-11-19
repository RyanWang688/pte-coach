/* Word drawer: list words (Chinese) or any word via Free Dictionary API (real audio).
   Desktop: right-side drawer. Phone: bottom sheet. Closes with the 关闭 button, Esc, or a click outside. */
(function () {
  const PTE = window.PTE;
  let pop, scrim;
  const close = () => {
    if (pop) { pop.remove(); pop = null; }
    if (scrim) { scrim.remove(); scrim = null; }
    window.speechSynthesis && speechSynthesis.cancel();
  };
  PTE.closeLookup = close;
  addEventListener('keydown', e => {
    if (!pop) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    // while the drawer is open, page shortcuts (Space = play, arrows = sentence) must not fire behind it
    else if ([' ', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key) && !e.target.closest('input,textarea,select,button,a')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  const ic = (n) => PTE.icon(n);
  const esc = (s) => PTE.esc(s == null ? '' : s);

  PTE.lemma = async (raw) => {
    const map = await PTE.words();
    const w = raw.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z'-]/g, '').replace(/'s$/, '');
    if (map[w]) return map[w];
    const tries = [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ly$/, ''), w.replace(/ally$/, ''), w.replace(/ation$/, 'e'), w.replace(/ation$/, ''), w.replace(/ment$/, ''), w.replace(/([a-z])\1ed$/, '$1'), w.replace(/([a-z])\1ing$/, '$1')];
    for (const t of tries) if (t.length > 2 && map[t]) return map[t];
    return null;
  };

  const shell = (tag) => `<div class="pop-head"><div class="grow">${tag}</div><button class="pop-close" data-close aria-label="关闭">${ic('x')} 关闭 <kbd>Esc</kbd></button></div><div class="pop-body"></div><div class="pop-foot"></div>`;
  const exRow = (en, cn) => `<div class="ex"><div class="grow"><div>${esc(en)}</div>${cn ? `<div class="small mute" style="margin-top:4px">${esc(cn)}</div>` : ''}</div><button class="round ghost" data-say="${esc(en)}" aria-label="朗读例句" title="朗读例句">${ic('vol')}</button></div>`;
  const shadow = (s) => PTE.canRecognize ? `<button class="sm" data-shadow="${esc(s)}">${ic('mic')} 跟读这句</button><div class="shadow-out"></div>` : '';

  function wire(root) {
    root.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => PTE.speak(b.dataset.say, { rate: b.dataset.rate ? +b.dataset.rate : undefined }));
    root.querySelectorAll('[data-audio]').forEach(b => b.onclick = () => new Audio(b.dataset.audio).play().catch(() => PTE.speak(b.dataset.word)));
    root.querySelectorAll('[data-shadow]').forEach(b => b.onclick = async () => {
      const out = b.nextElementSibling;
      out.innerHTML = `<span class="chip" style="background:var(--badbg);color:var(--bad);margin-top:8px">${ic('mic')} 正在听…读完停顿一下</span>`;
      b.disabled = true;
      const said = await PTE.listen(12000, t => out.innerHTML = '<div class="mute small" style="margin-top:8px">' + esc(t) + '</div>');
      b.disabled = false;
      if (said == null) return;
      const r = PTE.wordScore(b.dataset.shadow, said);
      out.innerHTML = '<div class="diff" style="margin-top:8px">' + r.words.map((w, i) => `<span class="${r.marks[i] ? 'm' : 'x'}">${esc(w)}</span>`).join(' ') + `</div><div class="small ${r.score === r.total ? 'ok' : 'mute'}">${r.score === r.total ? '每个词都识别到了' : `识别到 ${r.score}/${r.total} 个词，红色的词先听示范再读一遍`}</div>`;
    });
    const add = root.querySelector('[data-add]');
    if (add) add.onclick = async () => { add.disabled = true; await PTE.collect(add.dataset.add, 'lookup'); add.innerHTML = ic('check') + ' 已在生词本'; };
  }

  PTE.lookup = async (raw) => {
    close();
    PTE.pausePlayer && PTE.pausePlayer(); // never let article audio and the word's audio fight
    if (PTE._stopListen) PTE._stopListen();
    scrim = document.createElement('div'); scrim.className = 'popscrim'; scrim.onclick = close;
    pop = document.createElement('aside'); pop.className = 'pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '查词');
    pop.innerHTML = shell('<span class="chip">查询中…</span>');
    document.body.append(scrim, pop);
    wire(pop);
    const me = pop;
    const body = () => pop.querySelector('.pop-body'), foot = () => pop.querySelector('.pop-foot');
    const hit = await PTE.lemma(raw);
    if (me !== pop) return;
    if (hit) {
      const inSrs = (PTE.srs()[hit.w.toLowerCase()] || {}).star;
      pop.innerHTML = shell(`<span class="chip" style="background:var(--pri-soft);color:var(--pri)">${hit.s === 'A' ? '学术词 AWL' : 'PTE 话题词'} · #${hit.i + 1}</span>`);
      body().innerHTML = `<div class="hw">${esc(hit.w)}</div><div class="ipa">/${esc(hit.p)}/</div>
        <div class="say"><button class="pri sm" data-say="${esc(hit.w)}">${ic('vol')} 发音</button><button class="sm" data-say="${esc(hit.w)}" data-rate="0.6">${ic('slow')} 慢速</button></div>
        <div class="sect">释义</div><div class="mean">${esc(hit.t).replace(/；(?=[a-z]+\. )/g, '<br>')}</div>
        <div class="sect">例句</div>${exRow(hit.e, hit.c)}<button class="sm ghost" data-say="${esc(hit.e)}" data-rate="0.7">${ic('slow')} 慢速听例句</button> ${shadow(hit.e)}`;
      foot().innerHTML = `<button class="pri" data-add="${esc(hit.w)}" ${inSrs ? 'disabled' : ''}>${inSrs ? ic('check') + ' 已在生词本' : ic('plus') + ' 加入生词本'}</button><a class="btn ghost" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(hit.w)}&lang=en">有道详解 ${ic('ext')}</a>`;
      wire(pop); PTE.speak(hit.w); return;
    }
    const word = raw.toLowerCase().replace(/[^a-z'-]/g, '');
    let data = null;
    try { const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word)); if (r.ok) data = await r.json(); } catch (e) {}
    if (me !== pop) return;
    pop.innerHTML = shell(`<span class="chip">${ic('globe')} 词表外单词 · 英英释义</span>`);
    let html = `<div class="hw">${esc(word)}</div>`;
    let exFirst = '';
    if (data && data[0]) {
      const e = data[0];
      const ph = (e.phonetics || []).filter(p => p.audio);
      const au = ph.find(p => /-(au|uk)\.mp3/.test(p.audio)) || ph[0];
      const txt = e.phonetic || ((e.phonetics || []).find(p => p.text) || {}).text || '';
      if (txt) html += `<div class="ipa">${esc(txt)}</div>`;
      html += `<div class="say">${au ? `<button class="pri sm" data-audio="${esc(au.audio)}" data-word="${esc(word)}">${ic('vol')} 真人发音</button>` : ''}<button class="sm${au ? '' : ' pri'}" data-say="${esc(word)}">${ic('vol')} AI 发音</button></div>`;
      e.meanings.slice(0, 3).forEach(m => {
        html += `<div class="pos"><span class="chip">${esc(m.partOfSpeech)}</span>`;
        m.definitions.slice(0, 2).forEach(d => {
          if (!exFirst && d.example) exFirst = d.example;
          html += `<div class="def">${esc(d.definition)}</div>` + (d.example ? exRow(d.example) : '');
        });
        html += '</div>';
      });
      if (exFirst) html += `<div style="margin-top:8px">${shadow(exFirst)}</div>`;
    } else {
      html += `<div class="say"><button class="pri sm" data-say="${esc(word)}">${ic('vol')} 发音</button></div><p class="mute small">词典里没查到，可能是专有名词、人名或变形。可以点下面的有道查中文。</p>`;
    }
    body().innerHTML = html;
    foot().innerHTML = `<button class="pri" data-addc="1">${ic('plus')} 加入生词本</button><a class="btn ghost" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(word)}&lang=en">有道中文释义 ${ic('ext')}</a>`;
    wire(pop);
    if (!data) PTE.speak(word);
    pop.querySelector('[data-addc]').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      await PTE.collect(word, 'lookup'); b.innerHTML = ic('check') + ' 已在生词本';
    };
  };

  // make every word in an element clickable
  PTE.clickable = (el) => {
    if (!el) return;
    const walk = (node) => {
      if (node.nodeType === 3) {
        if (!/[A-Za-z]/.test(node.textContent)) return;
        const frag = document.createDocumentFragment();
        node.textContent.split(/([A-Za-z][A-Za-z'’-]*)/).forEach((part, i) => {
          if (i % 2) { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s); }
          else if (part) frag.appendChild(document.createTextNode(part));
        });
        node.replaceWith(frag);
      } else if (node.nodeType === 1 && !node.classList.contains('tw') && !/^(BUTTON|INPUT|TEXTAREA|SELECT|svg)$/i.test(node.tagName)) {
        [...node.childNodes].forEach(walk);
      }
    };
    walk(el);
    if (el.dataset.clickable) return; el.dataset.clickable = 1;
    el.addEventListener('click', e => { const t = e.target.closest('.w,.tw'); if (t) PTE.lookup(t.dataset.lemma || t.textContent); });
  };
})();
