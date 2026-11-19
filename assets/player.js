/* Sentence-level article player: seekable progress, tap a sentence to start there, karaoke highlight */
(function () {
  const PTE = window.PTE;
  const ic = (n) => PTE.icon(n);
  let current = null; // only one player speaks at a time

  PTE.player = (host, sentEls) => {
    const n = sentEls.length;
    const state = { i: 0, playing: false, token: 0, rate: PTE.get('prate', 1) };
    const bar = document.createElement('div');
    bar.className = 'player';
    bar.innerHTML = `<button class="round pri" data-a="play" aria-label="播放">${ic('play')}</button>
      <button class="round ghost" data-a="prev" aria-label="上一句">${ic('arrow').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button>
      <div class="grow" style="min-width:0"><input type="range" min="0" max="${n - 1}" value="0" step="1" aria-label="进度"><div class="small mute pmeta"><span data-pos>第 1 / ${n} 句</span><span data-hint>点句首 ▶ 从那句读 · 点单词查释义（自动暂停）</span></div></div>
      <button class="round ghost" data-a="next" aria-label="下一句">${ic('arrow')}</button>
      <button class="sm ghost" data-a="rate">${state.rate}×</button>
      <button class="round ghost" data-a="voice" aria-label="选择声音">${ic('gear')}</button>`;
    host.prepend(bar);
    const range = bar.querySelector('input'), pos = bar.querySelector('[data-pos]'), playBtn = bar.querySelector('[data-a=play]');

    const paint = () => {
      sentEls.forEach((el, j) => { el.classList.toggle('speaking', state.playing && j === state.i); el.classList.toggle('heard', j < state.i); });
      range.value = state.i; range.style.setProperty('--p', (n > 1 ? state.i / (n - 1) * 100 : 0) + '%');
      pos.textContent = `第 ${state.i + 1} / ${n} 句`;
      playBtn.innerHTML = state.playing ? ic('stop') : ic('play');
      bar.classList.toggle('on', state.playing);
      host.classList.toggle('listening', state.playing);
    };
    const speakFrom = async (i) => {
      if (current && current !== api) current.pause();
      current = api;
      state.i = Math.max(0, Math.min(n - 1, i)); state.playing = true; const tk = ++state.token; paint();
      const el = sentEls[state.i];
      const r = el.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight - 140) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await PTE.speak(el.textContent.trim(), { rate: state.rate });
      if (tk !== state.token || !state.playing) return;
      if (state.i < n - 1) { await new Promise(r => setTimeout(r, /[.!?]["”]?$/.test(el.textContent.trim()) && el.dataset.pend ? 650 : 280)); if (tk === state.token && state.playing) speakFrom(state.i + 1); }
      else { state.playing = false; state.i = 0; paint(); PTE.toast('读完啦'); }
    };
    const pause = () => { state.playing = false; state.token++; speechSynthesis.cancel(); paint(); };
    const api = { pause, play: speakFrom, state, bar };
    PTE.pausePlayer = () => { if (current && current.state.playing) current.pause(); };

    playBtn.onclick = () => state.playing ? pause() : speakFrom(state.i);
    bar.querySelector('[data-a=prev]').onclick = () => state.playing ? speakFrom(state.i - 1) : (state.i = Math.max(0, state.i - 1), paint());
    bar.querySelector('[data-a=next]').onclick = () => state.playing ? speakFrom(state.i + 1) : (state.i = Math.min(n - 1, state.i + 1), paint());
    bar.querySelector('[data-a=rate]').onclick = (e) => {
      const R = [0.8, 0.9, 1, 1.1, 1.25]; state.rate = R[(R.indexOf(state.rate) + 1) % R.length] || 1; PTE.set('prate', state.rate);
      e.currentTarget.textContent = state.rate + '×'; if (state.playing) speakFrom(state.i);
    };
    bar.querySelector('[data-a=voice]').onclick = () => { pause(); PTE.voiceSheet(); };
    range.oninput = () => { state.i = +range.value; if (state.playing) { state.token++; speechSynthesis.cancel(); } paint(); };
    range.onchange = () => { if (bar.classList.contains('on') || state.playing) speakFrom(+range.value); };
    // Clear split of intents: a word = look it up (player pauses); the ▶ before a sentence, or
    // the gaps between words, = read from that sentence.
    sentEls.forEach((el, j) => {
      const b = document.createElement('button');
      b.className = 'sjump'; b.type = 'button'; b.title = '从这句开始读'; b.setAttribute('aria-label', '从这句开始读'); b.innerHTML = ic('play');
      b.onclick = (e) => { e.stopPropagation(); speakFrom(j); };
      el.prepend(b);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.w,.tw,.sjump')) return; // word clicks go to the lookup drawer
        e.stopPropagation(); speakFrom(j);
      });
    });
    addEventListener('pagehide', pause);
    paint();
    return api;
  };

  // split marked paragraph text into sentences (keeps {{…}} markers intact)
  PTE.sentences = (para) => para.split(/(?<=[.!?]["”]?)\s+(?=["“]?[A-Z])/);
})();
