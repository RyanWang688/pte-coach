/* Word lookup popover: list words (Chinese) or any word via Free Dictionary API (real audio) */
(function () {
  const PTE = window.PTE;
  let pop;
  const close = () => { if (pop) { pop.remove(); pop = null; } speechSynthesis && speechSynthesis.cancel(); };
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  PTE.lemma = async (raw) => {
    const map = await PTE.words();
    const w = raw.toLowerCase().replace(/[^a-z'-]/g, '').replace(/'s$/, '');
    if (map[w]) return map[w];
    const tries = [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ly$/, ''), w.replace(/ally$/, ''), w.replace(/ation$/, 'e'), w.replace(/ation$/, ''), w.replace(/ment$/, ''), w.replace(/([a-z])\1ed$/, '$1'), w.replace(/([a-z])\1ing$/, '$1')];
    for (const t of tries) if (t.length > 2 && map[t]) return map[t];
    return null;
  };

  const shadowBtn = (sentence) => PTE.canRecognize ? `<button class="icon" data-shadow="${PTE.esc(sentence)}">🎙 跟读</button>` : '';

  function wire(root) {
    root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => PTE.speak(b.dataset.say, { rate: b.dataset.rate ? +b.dataset.rate : undefined }));
    root.querySelectorAll('[data-audio]').forEach(b => b.onclick = () => new Audio(b.dataset.audio).play());
    root.querySelectorAll('[data-shadow]').forEach(b => b.onclick = async () => {
      const out = root.querySelector('.shadow-out');
      out.innerHTML = '<span class="mute">正在听…读完后停顿一下即可</span>';
      b.disabled = true;
      const said = await PTE.listen(12000, t => out.innerHTML = '<span class="mute">' + PTE.esc(t) + '</span>');
      b.disabled = false;
      if (said == null) return;
      const r = PTE.wordScore(b.dataset.shadow, said);
      out.innerHTML = '<div class="diff">' + r.words.map((w, i) => `<span class="${r.marks[i] ? 'm' : 'x'}">${PTE.esc(w)}</span>`).join(' ') + `</div><div class="small mute">识别到 ${r.score}/${r.total} 个词。标红的词没被识别出来，可能是发音不清或吞音，再听一遍示范后重读。</div>`;
    });
    const add = root.querySelector('[data-add]');
    if (add) add.onclick = () => { PTE.learn(add.dataset.add); add.textContent = '✓ 已加入复习'; add.disabled = true; };
  }

  PTE.lookup = async (raw) => {
    close();
    pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML = '<button class="x" aria-label="关闭">×</button><div class="mute">查询中…</div>';
    document.body.appendChild(pop);
    pop.querySelector('.x').onclick = close;
    const me = pop;
    const hit = await PTE.lemma(raw);
    if (me !== pop) return;
    const inSrs = hit && PTE.srs()[hit.w.toLowerCase()];
    if (hit) {
      pop.innerHTML = `<button class="x" aria-label="关闭">×</button>
        <div class="row"><span class="hw">${PTE.esc(hit.w)}</span><span class="mute">/${PTE.esc(hit.p)}/</span>
        <button class="icon" data-say="${PTE.esc(hit.w)}">🔊</button><button class="icon" data-say="${PTE.esc(hit.w)}" data-rate="0.6">🐢</button>
        <span class="pill">${hit.s === 'A' ? '学术词 AWL' : 'PTE 话题词'} #${hit.i + 1}</span></div>
        <div style="margin:8px 0">${PTE.esc(hit.t).replace(/；(?=[a-z]+\. )/g, '<br>')}</div>
        <div class="card" style="margin:8px 0"><div>${PTE.esc(hit.e)}</div><div class="mute small">${PTE.esc(hit.c)}</div>
        <div class="row" style="margin-top:6px"><button class="icon" data-say="${PTE.esc(hit.e)}">🔊 例句</button><button class="icon" data-say="${PTE.esc(hit.e)}" data-rate="0.7">🐢 慢速</button>${shadowBtn(hit.e)}</div>
        <div class="shadow-out" style="margin-top:6px"></div></div>
        <div class="row"><button data-add="${PTE.esc(hit.w)}" ${inSrs ? 'disabled' : ''}>${inSrs ? '✓ 已在复习队列' : '+ 加入复习'}</button>
        <a class="btn" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(hit.w)}&lang=en">有道详解 ↗</a></div>`;
      pop.querySelector('.x').onclick = close; wire(pop); return;
    }
    const word = raw.toLowerCase().replace(/[^a-z'-]/g, '');
    let data = null;
    try { const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word)); if (r.ok) data = await r.json(); } catch (e) {}
    if (me !== pop) return;
    let html = `<button class="x" aria-label="关闭">×</button><div class="row"><span class="hw">${PTE.esc(word)}</span>`;
    let def = '', ex = '';
    if (data && data[0]) {
      const e = data[0];
      const ph = (e.phonetics || []).filter(p => p.audio);
      const au = ph.find(p => /-(au|uk)\.mp3/.test(p.audio)) || ph[0];
      const txt = e.phonetic || ((e.phonetics || []).find(p => p.text) || {}).text || '';
      html += `<span class="mute">${PTE.esc(txt)}</span>` + (au ? `<button class="icon" data-audio="${PTE.esc(au.audio)}">🔊 真人</button>` : '') + `<button class="icon" data-say="${PTE.esc(word)}">🔊</button></div>`;
      html += '<div style="margin-top:8px">';
      e.meanings.slice(0, 3).forEach(m => {
        html += `<div><b>${PTE.esc(m.partOfSpeech)}</b></div><ol style="margin:4px 0 8px;padding-left:20px">`;
        m.definitions.slice(0, 2).forEach(d => {
          if (!def) def = m.partOfSpeech + '. ' + d.definition;
          if (!ex && d.example) ex = d.example;
          html += `<li>${PTE.esc(d.definition)}${d.example ? `<div class="mute small">e.g. ${PTE.esc(d.example)} <button class="icon" data-say="${PTE.esc(d.example)}">🔊</button></div>` : ''}</li>`;
        });
        html += '</ol>';
      });
      html += '</div>';
      if (ex) html += `<div class="row">${shadowBtn(ex)}</div><div class="shadow-out"></div>`;
    } else {
      html += `<button class="icon" data-say="${PTE.esc(word)}">🔊</button></div><p class="mute">词典里没查到（可能是专有名词或变形）。</p>`;
    }
    html += `<div class="row" style="margin-top:8px"><button data-addc="1">+ 加入我的生词</button><a class="btn" target="_blank" rel="noopener" href="https://www.youdao.com/result?word=${encodeURIComponent(word)}&lang=en">有道中文释义 ↗</a></div>`;
    pop.innerHTML = html;
    pop.querySelector('.x').onclick = close; wire(pop);
    pop.querySelector('[data-addc]').onclick = (ev) => {
      const c = PTE.get('custom', {}); c[word] = { def: def || '(见有道)', ex, at: PTE.today() }; PTE.set('custom', c);
      PTE.learn(word); ev.target.textContent = '✓ 已加入'; ev.target.disabled = true;
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
