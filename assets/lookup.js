/* Word lookup popover: list words (Chinese) or any word via Free Dictionary API (real audio) */
(function () {
  const PTE = window.PTE;
  let pop;
  const close = () => { if (pop) { pop.remove(); pop = null; } window.speechSynthesis && speechSynthesis.cancel(); };
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  const ic = (n) => PTE.icon(n);

  PTE.lemma = async (raw) => {
    const map = await PTE.words();
    const w = raw.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z'-]/g, '').replace(/'s$/, '');
    if (map[w]) return map[w];
    const tries = [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ly$/, ''), w.replace(/ally$/, ''), w.replace(/ation$/, 'e'), w.replace(/ation$/, ''), w.replace(/ment$/, ''), w.replace(/([a-z])\1ed$/, '$1'), w.replace(/([a-z])\1ing$/, '$1')];
    for (const t of tries) if (t.length > 2 && map[t]) return map[t];
    return null;
  };

  const shadowBtn = (s) => PTE.canRecognize ? `<button class="sm" data-shadow="${PTE.esc(s)}">${ic('mic')} 跟读</button>` : '';

  function wire(root) {
    root.querySelector('.x').onclick = close;
    root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => PTE.speak(b.dataset.say, { rate: b.dataset.rate ? +b.dataset.rate : undefined }));
    root.querySelectorAll('[data-audio]').forEach(b => b.onclick = () => new Audio(b.dataset.audio).play());
    root.querySelectorAll('[data-shadow]').forEach(b => b.onclick = async () => {
      const out = root.querySelector('.shadow-out');
      out.innerHTML = `<span class="chip" style="background:var(--badbg);color:var(--bad)">${ic('mic')} 正在听…读完停顿一下</span>`;
      b.disabled = true;
      const said = await PTE.listen(12000, t => out.innerHTML = '<span class="mute">' + PTE.esc(t) + '</span>');
      b.disabled = false;
      if (said == null) return;
      const r = PTE.wordScore(b.dataset.shadow, said);
      out.innerHTML = '<div class="diff" style="margin-top:8px">' + r.words.map((w, i) => `<span class="${r.marks[i] ? 'm' : 'x'}">${PTE.esc(w)}</span>`).join(' ') + `</div><div class="small ${r.score === r.total ? 'ok' : 'mute'}">${r.score === r.total ? '完美！每个词都识别到了' : `识别到 ${r.score}/${r.total} 个词，红色的词再听一遍示范后重读`}</div>`;
      if (r.score === r.total) PTE.confetti();
    });
    const add = root.querySelector('[data-add]');
    if (add) add.onclick = async () => { add.disabled = true; await PTE.collect(add.dataset.add, 'lookup'); add.innerHTML = ic('check') + ' 已在生词本'; };
  }

  PTE.lookup = async (raw) => {
    close();
    pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML = `<button class="x" aria-label="关闭">${ic('x')}</button><div class="mute">查询中…</div>`;
    document.body.appendChild(pop);
    pop.querySelector('.x').onclick = close;
    const me = pop;
    const hit = await PTE.lemma(raw);
    if (me !== pop) return;
    if (hit) {
      const inSrs = (PTE.srs()[hit.w.toLowerCase()] || {}).star;
      pop.innerHTML = `<button class="x" aria-label="关闭">${ic('x')}</button>
        <span class="chip" style="background:${hit.s === 'A' ? '#E7ECF4' : '#E4EEF5'};color:${hit.s === 'A' ? '#2E4A7A' : '#3F6E9C'}">${hit.s === 'A' ? '学术词 AWL' : 'PTE 话题词'} #${hit.i + 1}</span>
        <div class="row" style="margin-top:6px"><span class="hw">${PTE.esc(hit.w)}</span><span class="mute">/${PTE.esc(hit.p)}/</span></div>
        <div class="row" style="margin:6px 0"><button class="pri sm" data-say="${PTE.esc(hit.w)}">${ic('vol')} 发音</button><button class="sm" data-say="${PTE.esc(hit.w)}" data-rate="0.6">${ic('slow')} 慢速</button></div>
        <div style="font-weight:600">${PTE.esc(hit.t).replace(/；(?=[a-z]+\. )/g, '<br>')}</div>
        <div class="ex"><div style="font-weight:600">${PTE.esc(hit.e)}</div><div class="mute small">${PTE.esc(hit.c)}</div>
          <div class="row" style="margin-top:10px"><button class="sm" data-say="${PTE.esc(hit.e)}">${ic('vol')} 例句</button><button class="sm" data-say="${PTE.esc(hit.e)}" data-rate="0.7">${ic('slow')}</button>${shadowBtn(hit.e)}</div>
          <div class="shadow-out"></div></div>
        <div class="row"><button class="sm" data-add="${PTE.esc(hit.w)}" ${inSrs ? 'disabled' : ''}>${inSrs ? ic('check') + ' 已在生词本' : ic('plus') + ' 加入生词本'}</button>
        <a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(hit.w)}&lang=en">有道详解 ${ic('ext')}</a></div>`;
      wire(pop); PTE.speak(hit.w); return;
    }
    const word = raw.toLowerCase().replace(/[^a-z'-]/g, '');
    let data = null;
    try { const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word)); if (r.ok) data = await r.json(); } catch (e) {}
    if (me !== pop) return;
    let html = `<button class="x" aria-label="关闭">${ic('x')}</button><span class="chip">${ic('globe')} 词表外单词</span><div class="row" style="margin-top:6px"><span class="hw">${PTE.esc(word)}</span>`;
    let def = '', ex = '';
    if (data && data[0]) {
      const e = data[0];
      const ph = (e.phonetics || []).filter(p => p.audio);
      const au = ph.find(p => /-(au|uk)\.mp3/.test(p.audio)) || ph[0];
      const txt = e.phonetic || ((e.phonetics || []).find(p => p.text) || {}).text || '';
      html += `<span class="mute">${PTE.esc(txt)}</span></div><div class="row" style="margin:6px 0">` + (au ? `<button class="pri sm" data-audio="${PTE.esc(au.audio)}">${ic('vol')} 真人发音</button>` : '') + `<button class="sm" data-say="${PTE.esc(word)}">${ic('vol')} 合成</button></div>`;
      e.meanings.slice(0, 3).forEach(m => {
        html += `<div style="margin-top:8px"><span class="chip">${PTE.esc(m.partOfSpeech)}</span></div>`;
        m.definitions.slice(0, 2).forEach(d => {
          if (!def) def = m.partOfSpeech + '. ' + d.definition;
          if (!ex && d.example) ex = d.example;
          html += `<div style="margin:6px 0 0 4px">${PTE.esc(d.definition)}</div>` + (d.example ? `<div class="ex small"><i>${PTE.esc(d.example)}</i> <button class="sm round" data-say="${PTE.esc(d.example)}" aria-label="朗读">${ic('vol')}</button></div>` : '');
        });
      });
      if (ex) html += `<div class="row">${shadowBtn(ex)}</div><div class="shadow-out"></div>`;
    } else {
      html += `</div><div class="row" style="margin:6px 0"><button class="sm" data-say="${PTE.esc(word)}">${ic('vol')} 发音</button></div><p class="mute small">词典里没查到，可能是专有名词或变形。</p>`;
    }
    html += `<div class="row" style="margin-top:12px"><button class="sm" data-addc="1">${ic('plus')} 加入生词本</button><a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(word)}&lang=en">中文释义 ${ic('ext')}</a></div>`;
    pop.innerHTML = html;
    wire(pop);
    if (!data) PTE.speak(word);
    pop.querySelector('[data-addc]').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      await PTE.collect(word, 'lookup'); b.innerHTML = ic('check') + ' 已在生词本';
    };
  };

  // make every word in an element clickable
  PTE.clickable = (el) => {
    const walk = (node) => {
      if (node.nodeType === 3) {
        if (!/[A-Za-z]/.test(node.textContent)) return;
        const frag = document.createDocumentFragment();
        node.textContent.split(/([A-Za-z][A-Za-z'’-]*)/).forEach((part, i) => {
          if (i % 2) { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s); }
          else if (part) frag.appendChild(document.createTextNode(part));
        });
        node.replaceWith(frag);
      } else if (node.nodeType === 1 && !node.classList.contains('tw') && !/^(BUTTON|INPUT|TEXTAREA)$/.test(node.tagName)) {
        [...node.childNodes].forEach(walk);
      }
    };
    walk(el);
    el.addEventListener('click', e => { const t = e.target.closest('.w,.tw'); if (t) PTE.lookup(t.dataset.lemma || t.textContent); });
  };
})();
