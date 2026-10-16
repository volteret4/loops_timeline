(function () {
  const { FAMILIES, genres, chapters } = LOOPS;
  // Loops 1: 18 capítulos + 3 textos de apéndice; Loops 2: prólogo, 12 capítulos y epílogo.
  const BOOKS = { 1: { total: 21, inRange: (n) => n > 0 && n <= 21 }, 2: { total: 14, inRange: (n) => n >= 100 && n <= 113 } };
  const Y0 = 1885, Y1 = 2019, PX = 22;
  const ROW = 24, LANE_PAD = 26, BAR_H = 18;
  const NS = 'http://www.w3.org/2000/svg';

  const all = [...genres.values()];
  const byId = genres;
  // Hijos calculados a partir de las influencias declaradas.
  const children = new Map(all.map((g) => [g.id, []]));
  for (const g of all) for (const p of g.influences) {
    if (!byId.has(p)) { console.warn('Influencia desconocida', g.id, '←', p); continue; }
    children.get(p).push(g.id);
  }

  const state = { q: '', off: new Set(), view: 'timeline', chEss: false };
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const x = (y) => (y - Y0) * PX;
  const endOf = (g) => g.end ?? g.start + 8;
  const chapterName = (n) => {
    const c = chapters.find((c) => c.n === n);
    if (!c) return `Cap. ${n}`;
    if (c.label) return `${c.label} · ${c.title}`;
    return (n ? `Cap. ${n} · ` : '') + c.title;
  };

  function matches(g) {
    if (state.off.has(g.family)) return false;
    if (!state.q) return true;
    const hay = [g.name, ...g.aka, ...g.artists, ...g.labels, g.place || '', ...g.tracks.map((t) => t.a + ' ' + t.t)].join(' ').toLowerCase();
    return hay.includes(state.q);
  }

  // Cabecera de progreso
  const readOf = (b) => chapters.filter((c) => BOOKS[b].inRange(c.n)).length;
  const read = readOf(1) + readOf(2), TOTAL = BOOKS[1].total + BOOKS[2].total;
  const essentials = all.reduce((n, g) => n + g.tracks.filter((t) => t.ess).length, 0);
  $('#progress').innerHTML = `Loops 1: ${readOf(1)}/${BOOKS[1].total} · Loops 2: ${readOf(2)}/${BOOKS[2].total} capítulos leídos · ${all.length} géneros · ${all.reduce((n, g) => n + g.tracks.length, 0)} discos (${essentials} ★ esenciales)<div class="bar"><i style="width:${(read / TOTAL) * 100}%"></i></div>`;

  // Filtros de familia
  const famBox = $('#families');
  for (const [id, f] of Object.entries(FAMILIES)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.innerHTML = `<i style="background:${f.color}"></i>${f.name}`;
    b.onclick = () => { state.off.has(id) ? state.off.delete(id) : state.off.add(id); b.classList.toggle('off'); render(); };
    famBox.appendChild(b);
  }

  $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
  // En móvil la búsqueda y las familias van plegadas tras el botón «Filtros».
  const ctl = $('.controls');
  $('#ftoggle').onclick = () => {
    const on = ctl.classList.toggle('fopen');
    $('#ftoggle').setAttribute('aria-expanded', on);
    fitScrollers();
    if (on) $('#q').focus();
  };
  document.querySelectorAll('.views button').forEach((b) => b.onclick = () => {
    state.view = b.dataset.view;
    document.querySelectorAll('.views button').forEach((o) => o.classList.toggle('on', o === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === state.view));
  });
  $('#close').onclick = closePanel;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  // ---------- Timeline ----------
  const pos = new Map();
  function renderTimeline() {
    const svg = $('#svg');
    svg.innerHTML = '';
    pos.clear();
    const W = x(Y1) + 40;
    const axis = el('g', { class: 'axis' }, svg);
    const lanes = el('g', {}, svg);
    const links = el('g', { class: 'links' }, svg);
    const bars = el('g', {}, svg);
    const tags = el('g', { class: 'lane-tags' }, svg);
    const yearTags = el('g', { class: 'year-tags' }, svg);

    let y = 30;
    for (const [fid, fam] of Object.entries(FAMILIES)) {
      const items = all.filter((g) => g.family === fid && matches(g)).sort((a, b) => a.start - b.start);
      if (!items.length) continue;
      const rows = [];
      for (const g of items) {
        const tw = g.name.length * 6.6 + 10;
        const fits = tw < x(endOf(g)) - x(g.start);
        const reach = x(endOf(g)) + (fits ? 0 : tw) + 8;
        let r = rows.findIndex((end) => end < x(g.start));
        if (r < 0) { r = rows.length; rows.push(0); }
        rows[r] = reach;
        g._row = r;
      }
      const h = LANE_PAD + rows.length * ROW + 8;
      el('rect', { class: 'lane-bg', x: 0, y, width: W, height: h }, lanes);
      el('rect', { x: 0, y, width: 4, height: h, fill: fam.color }, lanes);
      const lbl = el('text', { class: 'lane-label', x: 12, y: y + 16 }, tags);
      lbl.textContent = fam.name;
      for (const g of items) {
        const gy = y + LANE_PAD + g._row * ROW;
        const gx = x(g.start), gw = Math.max(6, x(endOf(g)) - gx);
        pos.set(g.id, { x: gx, w: gw, y: gy + BAR_H / 2 });
        const node = el('g', { class: 'g', 'data-id': g.id }, bars);
        el('rect', { x: gx, y: gy, width: gw, height: BAR_H, fill: fam.color, 'fill-opacity': 0.85 }, node);
        const fits = g.name.length * 6.6 + 10 < gw;
        const t = el('text', { x: fits ? gx + 6 : gx + gw + 5, y: gy + 13 }, node);
        t.textContent = g.name;
        if (fits) t.setAttribute('style', 'fill:#111');
        const title = el('title', {}, node);
        title.textContent = `${g.name} (${g.start}–${g.end ?? '…'})`;
        node.addEventListener('mouseenter', () => highlight(g.id, links, bars));
        node.addEventListener('mouseleave', () => highlight(null, links, bars));
        node.addEventListener('click', (e) => { e.stopPropagation(); open(g.id); });
      }
      y += h + 6;
    }
    const H = y + 10;
    drawAxis(axis, yearTags, x, 1890, 2015, W, H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
  }

  // Rejilla de años + etiquetas en un grupo aparte que se mantiene fijo arriba al hacer scroll.
  function drawAxis(grid, tags, sx, from, to, W, H) {
    for (let yr = from; yr <= to; yr += 5) {
      const big = yr % 10 === 0;
      el('line', { x1: sx(yr), x2: sx(yr), y1: 20, y2: H, 'stroke-width': big ? 1 : 0.5, opacity: big ? 1 : 0.6 }, grid);
    }
    el('rect', { class: 'year-bg', x: 0, y: 0, width: W, height: 20 }, tags);
    for (let yr = Math.ceil(from / 10) * 10; yr <= to; yr += 10) {
      const t = el('text', { x: sx(yr) + 3, y: 14 }, tags);
      t.textContent = yr;
    }
  }
  // Mantiene fijas las etiquetas de familia (horizontal) y de años (vertical) de un scroller.
  function stickTags(sc) {
    const upd = () => {
      sc.querySelectorAll('.lane-tags').forEach((t) => t.setAttribute('transform', `translate(${sc.scrollLeft},0)`));
      sc.querySelectorAll('.year-tags').forEach((t) => t.setAttribute('transform', `translate(0,${sc.scrollTop})`));
    };
    sc.addEventListener('scroll', upd);
    return upd;
  }

  function curve(a, b) {
    const x1 = a.x + Math.min(a.w, Math.max(6, b.x - a.x)), y1 = a.y;
    const x2 = b.x, y2 = b.y;
    const dx = Math.max(30, Math.abs(x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  function highlight(id, links, bars) {
    links.innerHTML = '';
    bars.querySelectorAll('.g').forEach((n) => n.classList.remove('dim', 'hit'));
    if (!id) return;
    const g = byId.get(id), me = pos.get(id);
    const related = new Set([id, ...g.influences, ...children.get(id)]);
    bars.querySelectorAll('.g').forEach((n) => {
      if (!related.has(n.dataset.id)) n.classList.add('dim');
      if (n.dataset.id === id) n.classList.add('hit');
    });
    for (const p of g.influences) if (pos.has(p)) el('path', { d: curve(pos.get(p), me), class: 'in' }, links);
    for (const c of children.get(id)) if (pos.has(c)) el('path', { d: curve(me, pos.get(c)), stroke: FAMILIES[g.family].color }, links);
  }

  // ---------- Lista ----------
  function renderList() {
    const box = $('#list');
    box.innerHTML = '';
    const decades = new Map();
    for (const g of all.filter(matches).sort((a, b) => a.start - b.start)) {
      const d = g.start < 1950 ? 0 : Math.floor(g.start / 10) * 10;
      if (!decades.has(d)) decades.set(d, []);
      decades.get(d).push(g);
    }
    for (const [d, items] of decades) {
      box.insertAdjacentHTML('beforeend', `<h2>${d < 1950 ? 'Antes de 1950' : 'Años ' + String(d).slice(2)}</h2>`);
      const grid = document.createElement('div');
      grid.className = 'cards';
      for (const g of items) {
        const c = document.createElement('div');
        c.className = 'card';
        c.style.borderLeftColor = FAMILIES[g.family].color;
        c.innerHTML = `<h3>${esc(g.name)}</h3><div class="meta">${g.start}–${g.end ?? '…'}${g.place ? ' · ' + esc(g.place) : ''} · ${g.tracks.length} discos</div><p>${esc(g.desc || '')}</p>`;
        c.onclick = () => open(g.id);
        grid.appendChild(c);
      }
      box.appendChild(grid);
    }
    // Cuando se filtra desde la lista y se vuelve a timeline, mantener coherencia
    if (!decades.size) box.innerHTML = '<p class="hint">Nada coincide con la búsqueda.</p>';
  }

  // ---------- Ficha ----------
  function chipFor(id) {
    const g = byId.get(id);
    if (!g) return '';
    return `<button class="chip" data-go="${id}"><i style="background:${FAMILIES[g.family].color}"></i>${esc(g.name)}</button>`;
  }
  const REFS = window.LOOPS_REFS || {};
  const secName = (s) => s ? s.replace(/^\d+\.\s*/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'inicio del capítulo';
  const MAPA = window.LOOPS_MAPA || {};
  function mark(para, q) {
    const i = para.toLowerCase().replace(/’/g, "'").indexOf(q.toLowerCase().replace(/’/g, "'"));
    if (i < 0) return esc(para);
    return esc(para.slice(0, i)) + '<mark>' + esc(para.slice(i, i + q.length)) + '</mark>' + esc(para.slice(i + q.length));
  }
  function descHtml(g) {
    const defs = MAPA[g.id] || [];
    if (defs.length) return defs.map((m) => `<div class="desc book"><div class="src">Definición del libro · Loops ${m.book} · Mapa de estilos · ≈ pág. ${m.page}</div>${esc(m.text)}</div>`).join('');
    return `<div class="desc"><div class="src">Resumen a partir del libro</div>${esc(g.desc || '')}</div>`;
  }
  function refsHtml(g) {
    const refs = g.refs.map((r) => ({ ...r, loc: REFS[r.q] })).sort((a, b) => (a.loc ? a.loc.book * 1000 + a.loc.pct : 1e6) - (b.loc ? b.loc.book * 1000 + b.loc.pct : 1e6));
    const others = g.chapters.filter((c) => !g.refs.some((r) => r.ch === c));
    if (!refs.length && !others.length) return '';
    return `<h4>Pasajes del libro (${refs.length})</h4>${refs.map((r, i) => `<details class="ref"${i < 2 ? ' open' : ''}><summary class="where">${esc(chapterName(r.ch))}${r.loc ? ` · ${esc(secName(r.loc.sec))} · <b>≈ pág. ${r.loc.page}</b> <span>(${r.loc.pct}%)</span>` : ''}</summary><blockquote>${r.loc ? mark(r.loc.para, r.q) : esc(r.q)}</blockquote></details>`).join('')}
      ${others.length ? `<div class="tags">${others.map((c) => `<span>${esc(chapterName(c))}</span>`).join('')}</div>` : ''}
      <p class="fine">Páginas estimadas sobre el ePub (300 palabras/pág.); el ePub no incluye la paginación impresa.</p>`;
  }
  const YT = window.LOOPS_YT || {};
  function trackHtml(t, extra = '') {
    const v = YT[`${t.a}|${t.t}`];
    const search = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${t.a} ${t.t}`.replace(/\([^)]*\)/g, ''));
    const links = v
      ? `<button class="play" data-v="${esc(v.id)}" title="Reproducir aquí: ${esc(v.title)}">▶</button><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)} · ${esc(v.channel)}">↗</a>`
      : `<a href="${search}" target="_blank" rel="noopener" title="Buscar en YouTube">🔍</a>`;
    return `<li${t.ess ? ' class="ess" title="Discografía seleccionada del libro"' : ''}><span class="tt">${t.ess ? '<i class="star">★</i> ' : ''}<b>${esc(t.a)}</b> — ${esc(t.t)} ${t.y ? `<span class="y">(${t.y})</span>` : ''}${extra}</span><span class="act">${links}</span></li>`;
  }

  // Un único reproductor en toda la página: se abre bajo el disco pulsado y se cierra al volver a pulsarlo.
  function togglePlayer(b) {
    const li = b.closest('li');
    const prev = $('.player');
    const same = prev && prev.parentElement === li;
    if (prev) prev.remove();
    if (same) return;
    li.insertAdjacentHTML('beforeend', `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.v}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`);
  }

  // ---------- Discos, esenciales y por capítulo ----------
  // La búsqueda filtra por artista, título o nombre del género; los chips de familia, por género.
  function trackMatches(g, t) {
    if (state.off.has(g.family)) return false;
    return !state.q || `${t.a} ${t.t} ${g.name}`.toLowerCase().includes(state.q);
  }
  const byYear = (a, b) => (a.y || 9999) - (b.y || 9999) || a.a.localeCompare(b.a, 'es');
  const dot = (g) => `<i class="dot" style="background:${FAMILIES[g.family].color}"></i>`;
  const genreLink = (g) => `<button class="glink" data-go="${g.id}">${dot(g)}${esc(g.name)}</button>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function discGroups(box, groups, unit, tools = '') {
    const n = groups.reduce((s, gr) => s + gr.tracks.length, 0);
    const openAll = groups.length <= 12 || box.id === 'ess';
    box.innerHTML = `<div class="dbar"><span>${plural(n, 'disco', 'discos')} · ${plural(groups.length, unit[0], unit[1])}</span>${tools}<button data-fold="1">Desplegar todo</button><button data-fold="0">Plegar todo</button></div>`
      + (groups.length ? groups.map((gr) => `<details class="dgroup"${openAll ? ' open' : ''}><summary>${gr.head}<span class="n">${gr.tracks.length}</span></summary><ol class="tracks">${gr.tracks.map(gr.row).join('')}</ol></details>`).join('')
        : '<p class="hint">Nada coincide con la búsqueda.</p>');
  }
  function renderDiscs(id, onlyEss) {
    const groups = [];
    for (const g of all.slice().sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'es'))) {
      const tracks = g.tracks.filter((t) => (!onlyEss || t.ess) && trackMatches(g, t)).sort(byYear);
      if (tracks.length) groups.push({ head: `${dot(g)}<b>${esc(g.name)}</b><span class="yrs">${g.start}–${g.end ?? '…'}</span><button class="glink" data-go="${g.id}">ficha</button>`, tracks, row: (t) => trackHtml(t) });
    }
    discGroups($('#' + id), groups, ['género', 'géneros']);
  }
  function renderByChapter() {
    // Un mismo disco puede figurar en varios géneros: se agrupa por artista y título.
    const byCh = new Map();
    for (const g of all) for (const t of g.tracks) {
      if ((state.chEss && !t.ess) || !trackMatches(g, t)) continue;
      for (const ch of t.chs || []) {
        if (!byCh.has(ch)) byCh.set(ch, new Map());
        const k = `${t.a}|${t.t}`.toLowerCase();
        const m = byCh.get(ch);
        if (!m.has(k)) m.set(k, { ...t, genres: [] });
        m.get(k).genres.push(g);
      }
    }
    const groups = chapters.filter((c) => byCh.has(c.n)).map((c) => ({
      head: `<b>${esc(chapterName(c.n))}</b>`,
      tracks: [...byCh.get(c.n).values()].sort(byYear),
      row: (t) => trackHtml(t, `<span class="gl">${t.genres.map(genreLink).join('')}</span>`),
    }));
    discGroups($('#bych'), groups, ['capítulo', 'capítulos'], `<label><input type="checkbox" id="chess"${state.chEss ? ' checked' : ''}> Solo esenciales ★</label>`);
  }
  for (const box of document.querySelectorAll('.discs')) {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button, input');
      if (!b) return;
      if (b.matches('.play')) togglePlayer(b);
      else if (b.dataset.go) { e.preventDefault(); open(b.dataset.go); }
      else if (b.dataset.fold) box.querySelectorAll('details').forEach((d) => d.open = b.dataset.fold === '1');
      else if (b.id === 'chess') { state.chEss = b.checked; renderByChapter(); }
    });
  }

  function open(id) {
    const g = byId.get(id);
    const f = FAMILIES[g.family];
    const kids = children.get(id).slice().sort((a, b) => byId.get(a).start - byId.get(b).start);
    const tracks = g.tracks.slice().sort((a, b) => (a.y || 9999) - (b.y || 9999));
    $('#detail').innerHTML = `
      <h2>${esc(g.name)}</h2>
      ${g.aka.length ? `<div class="aka">También: ${g.aka.map(esc).join(', ')}</div>` : ''}
      <div class="facts">
        <span class="fam"><i style="background:${f.color}"></i>${f.name}</span>
        <span>${g.start}–${g.end ?? '…'}</span>
        ${g.place ? `<span>${esc(g.place)}</span>` : ''}
      </div>
      <button class="tofocus" data-focus="${id}">Ver su timeline individual</button>
      ${descHtml(g)}
      ${refsHtml(g)}
      ${g.influences.length ? `<h4>Viene de</h4><div class="links">${g.influences.map(chipFor).join('')}</div>` : ''}
      ${kids.length ? `<h4>Genera / influye en</h4><div class="links">${kids.map(chipFor).join('')}</div>` : ''}
      ${g.artists.length ? `<h4>Artistas clave</h4><div class="tags">${g.artists.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
      ${tracks.length ? `<h4>Discos y canciones mencionados (${tracks.length})</h4><ol class="tracks">${tracks.map(trackHtml).join('')}</ol>` : ''}
      ${g.labels.length ? `<h4>Sellos, clubes y lugares</h4><div class="tags">${g.labels.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
      ${g.notes.length ? `<h4>Resumen por capítulos</h4>${g.notes.map((n) => `<div class="note"><b>${esc(chapterName(n.ch))}</b>${esc(n.text)}</div>`).join('')}` : ''}
    `;
    $('#detail').querySelectorAll('[data-go]').forEach((b) => b.onclick = () => open(b.dataset.go));
    $('#detail').querySelector('[data-focus]').onclick = () => showFocus(id);
    $('#detail').querySelectorAll('.play').forEach((b) => b.onclick = () => togglePlayer(b));
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    $('#panel').scrollTop = 0;
    history.replaceState(null, '', '#' + id);
  }
  function closePanel() {
    $('#panel').classList.remove('open');
    $('#panel').setAttribute('aria-hidden', 'true');
    const inFocus = state.view === 'focus' && focus.root;
    history.replaceState(null, '', inFocus ? '#focus=' + focus.root : location.pathname);
  }


  // ---------- Timeline individual ----------
  // Un género raíz con sus influencias (padres) y lo que influye (hijos); el botón «+» de
  // cualquier género visible despliega también sus padres e hijos, sin quitar lo anterior.
  const focus = { root: null, open: new Set() };
  const parentsOf = (id) => byId.get(id).influences.filter((p) => byId.has(p));
  const relatives = (id) => [...parentsOf(id), ...children.get(id)];
  const nameKey = (g) => `${g.name} (${g.start}–${g.end ?? '…'})`;
  const byName = new Map(all.map((g) => [nameKey(g).toLowerCase(), g.id]));
  const dl = $('#focus-names');
  for (const g of all.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    const o = document.createElement('option');
    o.value = nameKey(g);
    dl.appendChild(o);
  }
  function pickFocus(id) {
    focus.root = id;
    focus.open = new Set([id]);
    $('#fq').value = nameKey(byId.get(id));
    renderFocus();
    history.replaceState(null, '', '#focus=' + id);
  }
  $('#fq').addEventListener('input', (e) => {
    const id = byName.get(e.target.value.trim().toLowerCase());
    if (id) pickFocus(id);
  });
  $('#fq').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    const hit = all.find((g) => g.name.toLowerCase() === q) || all.find((g) => g.name.toLowerCase().includes(q) || g.aka.some((a) => a.toLowerCase().includes(q)));
    if (hit) pickFocus(hit.id);
  });
  $('#freset').onclick = () => { if (focus.root) pickFocus(focus.root); };

  function renderFocus() {
    const svg = $('#fsvg');
    svg.innerHTML = '';
    const box = $('#fscroller');
    if (!focus.root) { svg.setAttribute('width', 0); svg.setAttribute('height', 0); $('#fhint').hidden = false; return; }
    $('#fhint').hidden = true;
    const shown = new Set();
    for (const id of focus.open) { shown.add(id); relatives(id).forEach((r) => shown.add(r)); }
    const items = [...shown].map((id) => byId.get(id)).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
    const from = Math.floor((Math.min(...items.map((g) => g.start)) - 4) / 10) * 10;
    const to = Math.ceil((Math.max(...items.map(endOf)) + 4) / 10) * 10;
    const fx = (yr) => (yr - from) * PX + 10;
    const BTN = 22;
    const rows = [];
    const lay = new Map();
    for (const g of items) {
      const gx = fx(g.start), gw = Math.max(6, fx(endOf(g)) - gx);
      const tw = g.name.length * 6.6 + 10;
      const fits = tw < gw;
      const textEnd = fits ? gx + gw : gx + gw + 5 + g.name.length * 6.1;
      const reach = textEnd + BTN + 10;
      let r = rows.findIndex((end) => end < gx - 4);
      if (r < 0) { r = rows.length; rows.push(0); }
      rows[r] = reach;
      lay.set(g.id, { gx, gw, fits, textEnd, row: r });
    }
    const W = Math.max(fx(to) + 40, ...rows.map((e) => e + 20));
    const H = 30 + rows.length * (ROW + 6) + 20;
    const grid = el('g', { class: 'axis' }, svg);
    const links = el('g', { class: 'links on' }, svg);
    const bars = el('g', {}, svg);
    const yearTags = el('g', { class: 'year-tags' }, svg);
    drawAxis(grid, yearTags, fx, from, to, W, H);
    const fpos = new Map();
    for (const g of items) {
      const L = lay.get(g.id);
      const gy = 30 + L.row * (ROW + 6);
      fpos.set(g.id, { x: L.gx, w: L.gw, y: gy + BAR_H / 2 });
      const fam = FAMILIES[g.family];
      const node = el('g', { class: 'g' + (g.id === focus.root ? ' root' : '') + (focus.open.has(g.id) ? ' expanded' : ''), 'data-id': g.id }, bars);
      el('rect', { x: L.gx, y: gy, width: L.gw, height: BAR_H, fill: fam.color, 'fill-opacity': 0.85 }, node);
      const t = el('text', { x: L.fits ? L.gx + 6 : L.gx + L.gw + 5, y: gy + 13 }, node);
      t.textContent = g.name;
      if (L.fits) t.setAttribute('style', 'fill:#111');
      el('title', {}, node).textContent = `${g.name} (${g.start}–${g.end ?? '…'}) · clic para abrir la ficha`;
      node.addEventListener('click', (e) => { e.stopPropagation(); open(g.id); });
      // Botón +/−: desplegar o plegar padres e hijos de este género.
      const more = relatives(g.id).filter((r) => !shown.has(r)).length;
      if (g.id !== focus.root && (more || focus.open.has(g.id))) {
        const isOpen = focus.open.has(g.id);
        const b = el('g', { class: 'fbtn', transform: `translate(${L.textEnd + 6},${gy})` }, bars);
        el('rect', { width: BTN, height: BAR_H, rx: 4 }, b);
        el('text', { x: BTN / 2, y: 13, 'text-anchor': 'middle' }, b).textContent = isOpen ? '−' : '+';
        el('title', {}, b).textContent = isOpen ? 'Plegar sus relaciones' : `Desplegar sus influencias y herederos (${more} nuevos)`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          isOpen ? focus.open.delete(g.id) : focus.open.add(g.id);
          renderFocus();
        });
      }
    }
    for (const g of items) for (const p of parentsOf(g.id)) {
      if (!fpos.has(p) || !(focus.open.has(p) || focus.open.has(g.id))) continue;
      el('path', { d: curve(fpos.get(p), fpos.get(g.id)), stroke: FAMILIES[byId.get(p).family].color }, links);
    }
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    stickFocus();
    const r = fpos.get(focus.root);
    if (r) box.scrollLeft = Math.max(0, r.x - box.clientWidth / 3);
  }
  const stickFocus = stickTags($('#fscroller'));
  $('#fsvg').addEventListener('click', (e) => { if (!e.target.closest('.g, .fbtn')) closePanel(); });
  function showFocus(id) {
    document.querySelector('.views button[data-view="focus"]').click();
    pickFocus(id);
  }
  const sc = $('#scroller');
  const stickMain = stickTags(sc);
  // Clic en una zona vacía del timeline: cerrar la ficha.
  $('#svg').addEventListener('click', (e) => { if (!e.target.closest('.g')) closePanel(); });
  // Cada scroller ocupa el alto restante de la ventana: así la página no hace scroll
  // y el eje de años (fijo dentro del scroller) siempre queda visible.
  function fitScrollers() {
    for (const el of document.querySelectorAll('.view.on .scroller')) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = Math.max(240, window.innerHeight - top - 8) + 'px';
    }
  }
  window.addEventListener('resize', fitScrollers);
  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', fitScrollers));
  function render() {
    $('#ftoggle').classList.toggle('active', !!state.q || state.off.size > 0);
    renderTimeline(); renderList(); renderDiscs('discs', false); renderDiscs('ess', true); renderByChapter(); stickMain(); fitScrollers(); }
  render();
  const hash = location.hash.slice(1);
  if (hash.startsWith('focus=') && byId.has(hash.slice(6))) showFocus(hash.slice(6));
  else if (byId.has(hash)) open(hash);
  // Arrancar la vista en 1940 aprox., donde empieza la densidad
  $('#scroller').scrollLeft = x(1940) - 40;
})();
