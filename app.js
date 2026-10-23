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

  const state = { q: '', off: new Set(), view: 'timeline', ess: false, by: 'escena' };
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
  // Clic fuera de la ficha lateral: cerrarla. Va en la fase de captura, antes de que el clic, si es
  // en otra escena o disco, abra su ficha.
  document.addEventListener('click', (e) => {
    if ($('#panel').classList.contains('open') && !e.target.closest('#panel')) closePanel();
  }, true);

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
  // Los dos libros en PDF (generados desde los ePub por tools/pdfpages.py): cada cita enlaza a su página.
  const PDF = { 1: 'Loops_1_Javier_Blanquez.pdf', 2: 'Loops_2_Javier_Blanquez.pdf' };
  const pageLink = (loc) => loc.pdf
    ? `<a class="pg" href="${encodeURI(PDF[loc.book])}#page=${loc.pdf}" target="_blank" rel="noopener" title="Abrir Loops ${loc.book} en PDF por esta página">pág. ${loc.pdf}</a>`
    : `≈ pág. ${loc.page}`;
  const secName = (s) => s ? s.replace(/^\d+\.\s*/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'inicio del capítulo';
  const MAPA = window.LOOPS_MAPA || {};
  function mark(para, q) {
    const i = para.toLowerCase().replace(/’/g, "'").indexOf(q.toLowerCase().replace(/’/g, "'"));
    if (i < 0) return esc(para);
    return esc(para.slice(0, i)) + '<mark>' + esc(para.slice(i, i + q.length)) + '</mark>' + esc(para.slice(i + q.length));
  }
  function descHtml(g) {
    const defs = MAPA[g.id] || [];
    if (defs.length) return defs.map((m) => `<div class="desc book"><div class="src">Definición del libro · Loops ${m.book} · Mapa de estilos · ${pageLink(m)}</div>${esc(m.text)}</div>`).join('');
    return `<div class="desc"><div class="src">Resumen a partir del libro</div>${esc(g.desc || '')}</div>`;
  }
  function refsHtml(g) {
    const refs = g.refs.map((r) => ({ ...r, loc: REFS[r.q] })).sort((a, b) => (a.loc ? a.loc.book * 1000 + a.loc.pct : 1e6) - (b.loc ? b.loc.book * 1000 + b.loc.pct : 1e6));
    const others = g.chapters.filter((c) => !g.refs.some((r) => r.ch === c));
    if (!refs.length && !others.length) return '';
    return `<h4>Pasajes del libro (${refs.length})</h4>${refs.map((r, i) => `<details class="ref"${i < 2 ? ' open' : ''}><summary class="where">${esc(chapterName(r.ch))}${r.loc ? ` · ${esc(secName(r.loc.sec))} · <b>${pageLink(r.loc)}</b>` : ''}</summary><blockquote>${r.loc ? mark(r.loc.para, r.q) : esc(r.q)}</blockquote></details>`).join('')}
      ${others.length ? `<div class="tags">${others.map((c) => `<span>${esc(chapterName(c))}</span>`).join('')}</div>` : ''}
      <p class="fine">Páginas del PDF generado a partir del ePub (el ePub no incluye la paginación impresa); pulsa una para abrirlo.</p>`;
  }
  const YT = window.LOOPS_YT || {};
  // Páginas que mencionan cada disco o canción (tools/pdfpages.py), como enlaces al PDF.
  const PAGES = window.LOOPS_PAGES || {};
  const pagesHtml = (t) => {
    const ps = PAGES[`${t.a}|${t.t}`];
    if (!ps) return '';
    return ` <span class="pgs">${[1, 2].map((b) => ps.filter(([x]) => x === b)).filter((l) => l.length).map((l) => `Loops ${l[0][0]}: ${l.map(([b, p]) => `<a class="pg" href="${encodeURI(PDF[b])}#page=${p}" target="_blank" rel="noopener" title="Abrir el libro en PDF por esta página">${p}</a>`).join(' · ')}`).join(' · ')}</span>`;
  };

  function trackHtml(t, extra = '') {
    const v = YT[`${t.a}|${t.t}`];
    const search = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${t.a} ${t.t}`.replace(/\([^)]*\)/g, ''));
    const links = v
      ? `<button class="play" data-v="${esc(v.id)}" title="Reproducir aquí: ${esc(v.title)}">▶</button><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)} · ${esc(v.channel)}">↗</a>`
      : `<a href="${search}" target="_blank" rel="noopener" title="Buscar en YouTube">🔍</a>`;
    return `<li${t.ess ? ' class="ess" title="Discografía seleccionada del libro"' : ''}><span class="tt">${t.ess ? '<i class="star">★</i> ' : ''}<b>${esc(t.a)}</b> — ${esc(t.t)} ${t.y ? `<span class="y">(${t.y})</span>` : ''}${pagesHtml(t)}${extra}</span><span class="act">${links}</span></li>`;
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

  // ---------- Discos, por escena o por capítulo ----------
  // La búsqueda filtra por artista, título o nombre del género; los chips de familia, por género.
  function trackMatches(g, t) {
    if (state.off.has(g.family)) return false;
    return !state.q || `${t.a} ${t.t} ${g.name}`.toLowerCase().includes(state.q);
  }
  const byYear = (a, b) => (a.y || 9999) - (b.y || 9999) || a.a.localeCompare(b.a, 'es');
  const dot = (g) => `<i class="dot" style="background:${FAMILIES[g.family].color}"></i>`;
  const genreLink = (g) => `<button class="glink" data-go="${g.id}">${dot(g)}${esc(g.name)}</button>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Listas de reproducción anónimas de YouTube (sin cuenta ni cuota) con los vídeos de un grupo, de 50
  // en 50, el máximo que admite cada una: un capítulo largo lleva varias partes.
  function playlistLinks(tracks) {
    const ids = [...new Set(tracks.map((t) => YT[`${t.a}|${t.t}`]?.id).filter(Boolean))];
    if (ids.length < 2) return '';
    const parts = [];
    for (let i = 0; i < ids.length; i += 50) parts.push(ids.slice(i, i + 50));
    return `<div class="gtools">${parts.map((p, i) => `<a class="plist" href="https://www.youtube.com/watch_videos?video_ids=${p.join(',')}" target="_blank" rel="noopener" title="Abrir en YouTube una lista con ${p.length} vídeos">▶ ${parts.length > 1 ? `parte ${i + 1} (${p.length})` : `lista (${p.length})`}</a>`).join('')}</div>`;
  }

  function discGroups(box, groups, unit, tools = '') {
    const n = groups.reduce((s, gr) => s + gr.tracks.length, 0);
    const openAll = groups.length <= 12 || state.ess;
    box.innerHTML = `<div class="dbar"><span>${plural(n, 'disco', 'discos')} · ${plural(groups.length, unit[0], unit[1])}</span>${tools}<button data-fold="1">Desplegar todo</button><button data-fold="0">Plegar todo</button></div>`
      + (groups.length ? groups.map((gr) => `<details class="dgroup"${openAll ? ' open' : ''}><summary>${gr.head}<span class="n">${gr.tracks.length}</span></summary>${playlistLinks(gr.tracks)}<ol class="tracks">${gr.tracks.map(gr.row).join('')}</ol></details>`).join('')
        : '<p class="hint">Nada coincide con la búsqueda.</p>');
  }
  // Una sola vista de discos, agrupada por escena o por capítulo (para escuchar mientras se lee),
  // con un filtro para ver solo los destacados ★.
  function renderDiscs() {
    const tools = `<label>Agrupar por <select id="dby"><option value="escena"${state.by === 'escena' ? ' selected' : ''}>género</option><option value="cap"${state.by === 'cap' ? ' selected' : ''}>capítulo</option></select></label><label><input type="checkbox" id="dess"${state.ess ? ' checked' : ''}> Solo esenciales ★</label>`;
    state.by === 'cap' ? renderByChapter(tools) : renderByScene(tools);
  }
  function renderByScene(tools) {
    const groups = [];
    for (const g of all.slice().sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'es'))) {
      const tracks = g.tracks.filter((t) => (!state.ess || t.ess) && trackMatches(g, t)).sort(byYear);
      if (tracks.length) groups.push({ head: `${dot(g)}<b>${esc(g.name)}</b><span class="yrs">${g.start}–${g.end ?? '…'}</span><button class="glink" data-go="${g.id}">ficha</button>`, tracks, row: (t) => trackHtml(t) });
    }
    discGroups($('#discs'), groups, ['género', 'géneros'], tools);
  }
  function renderByChapter(tools) {
    // Un mismo disco puede figurar en varios géneros: se agrupa por artista y título.
    const byCh = new Map();
    for (const g of all) for (const t of g.tracks) {
      if ((state.ess && !t.ess) || !trackMatches(g, t)) continue;
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
    discGroups($('#discs'), groups, ['capítulo', 'capítulos'], tools);
  }
  for (const box of document.querySelectorAll('.discs')) {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.matches('.play')) togglePlayer(b);
      else if (b.dataset.go) { e.preventDefault(); open(b.dataset.go); }
      else if (b.dataset.fold) box.querySelectorAll('details').forEach((d) => d.open = b.dataset.fold === '1');
    });
    box.addEventListener('change', (e) => {
      if (e.target.id === 'dess') state.ess = e.target.checked;
      else if (e.target.id === 'dby') state.by = e.target.value;
      else return;
      renderDiscs();
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
      <div class="tobtns"><button class="tofocus" data-focus="${id}">Ver su mapa de influencias</button>${menciones.has(id) ? `<button class="tofocus" data-menc="${id}">Ver sus menciones</button>` : ''}</div>
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
    const mb = $('#detail').querySelector('[data-menc]');
    if (mb) mb.onclick = () => menciones.show(id);
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
    // En Menciones se conserva la selección de géneros y se quita solo el artista.
    const inMentions = location.hash.startsWith('#menciones=');
    history.replaceState(null, '', inFocus ? '#focus=' + focus.root : inMentions ? location.hash.split('%7C')[0] : location.pathname);
  }


  // ---------- Mapa de influencias ----------
  // Un género raíz con sus influencias (padres) y lo que influye (hijos), como un mapa conceptual
  // sin eje de años: cada columna es una generación, de lo que influye (izquierda) a lo influido
  // (derecha), y cada género lleva sus años. El botón «+» de cualquier género visible despliega
  // también sus padres e hijos, sin quitar lo anterior.
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

  const NODE_H = 40, GAP_Y = 14, GAP_X = 80, PAD = 20, BTN = 22;
  function renderFocus() {
    const svg = $('#fsvg');
    svg.innerHTML = '';
    const box = $('#fscroller');
    if (!focus.root) { svg.setAttribute('width', 0); svg.setAttribute('height', 0); $('#fhint').hidden = false; return; }
    $('#fhint').hidden = true;
    const shown = new Set();
    for (const id of focus.open) { shown.add(id); relatives(id).forEach((r) => shown.add(r)); }
    const ids = [...shown].sort((a, b) => byId.get(a).start - byId.get(b).start || byId.get(a).name.localeCompare(byId.get(b).name, 'es'));
    const ups = (id) => parentsOf(id).filter((p) => shown.has(p) && p !== id);
    const downs = (id) => children.get(id).filter((c) => shown.has(c) && c !== id);
    // Columna de cada género: el camino más largo desde los que no tienen padres visibles (si hay
    // un ciclo, se corta donde se cierra), y luego cada uno se acerca a su hijo más cercano.
    const col = new Map();
    const depth = (id, path) => {
      if (col.has(id)) return col.get(id);
      path.add(id);
      let d = 0;
      for (const p of ups(id)) if (!path.has(p)) d = Math.max(d, depth(p, path) + 1);
      path.delete(id);
      col.set(id, d);
      return d;
    };
    ids.forEach((id) => depth(id, new Set()));
    for (const id of ids.slice().sort((a, b) => col.get(b) - col.get(a))) {
      const next = downs(id).map((c) => col.get(c)).filter((c) => c > col.get(id));
      if (next.length) col.set(id, Math.min(...next) - 1);
    }
    const used = [...new Set(col.values())].sort((a, b) => a - b);
    const cols = used.map((c) => ids.filter((id) => col.get(id) === c));
    // Orden dentro de cada columna: por años y luego por la media de sus vecinos, para cruzar menos líneas.
    const most = Math.max(...cols.map((c) => c.length));
    const yOf = new Map();
    const place = (c) => c.forEach((id, i) => yOf.set(id, PAD + ((most - c.length) / 2 + i) * (NODE_H + GAP_Y)));
    cols.forEach(place);
    for (let k = 0; k < 4; k++) for (const [list, nb] of [[cols, ups], [cols.slice().reverse(), downs]]) for (const c of list) {
      const at = new Map(c.map((id) => { const ns = nb(id); return [id, ns.length ? ns.reduce((s, n) => s + yOf.get(n), 0) / ns.length : yOf.get(id)]; }));
      c.sort((a, b) => at.get(a) - at.get(b));
      place(c);
    }
    // Ancho de cada caja según su nombre; las columnas, del ancho de su caja más ancha.
    const more = (id) => relatives(id).filter((r) => !shown.has(r)).length;
    const hasBtn = (id) => id !== focus.root && (more(id) > 0 || focus.open.has(id));
    // Se mide con la fuente de la web (en una caja de prueba); si la vista aún está oculta, se estima.
    const probe = el('g', { class: 'node' }, svg);
    const pt = el('text', { class: 'name' }, probe);
    const textW = (s) => { pt.textContent = s; return pt.getComputedTextLength() || s.length * 7.4; };
    const wOf = new Map(ids.map((id) => [id, Math.max(textW(byId.get(id).name), 70) + 26 + (hasBtn(id) ? BTN + 8 : 0)]));
    probe.remove();
    const xOf = new Map();
    let cx = PAD;
    for (const c of cols) {
      c.forEach((id) => xOf.set(id, cx));
      cx += Math.max(...c.map((id) => wOf.get(id))) + GAP_X;
    }
    const W = cx - GAP_X + PAD;
    const H = PAD * 2 + most * (NODE_H + GAP_Y) - GAP_Y;
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'farrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,1 L10,5 L0,9 z', fill: 'context-stroke' }, mk);
    const links = el('g', {}, svg);
    const nodes = el('g', {}, svg);
    // Flechas de la influencia a lo influido; las que no tocan un género desplegado, más tenues.
    for (const id of ids) for (const p of ups(id)) {
      const x1 = xOf.get(p) + wOf.get(p), y1 = yOf.get(p) + NODE_H / 2;
      const x2 = xOf.get(id) - 2, y2 = yOf.get(id) + NODE_H / 2;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2);
      const near = focus.open.has(p) || focus.open.has(id);
      el('path', { class: 'edge' + (near ? '' : ' far'), 'data-a': p, 'data-b': id, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, stroke: FAMILIES[byId.get(p).family].color, 'marker-end': 'url(#farrow)' }, links);
    }
    for (const id of ids) {
      const g = byId.get(id), fam = FAMILIES[g.family];
      const gx = xOf.get(id), gy = yOf.get(id), gw = wOf.get(id);
      const node = el('g', { class: 'node' + (id === focus.root ? ' root' : '') + (focus.open.has(id) ? ' expanded' : ''), 'data-id': id }, nodes);
      el('rect', { class: 'box', x: gx, y: gy, width: gw, height: NODE_H, rx: 6, stroke: fam.color }, node);
      el('rect', { x: gx, y: gy, width: 6, height: NODE_H, rx: 3, fill: fam.color }, node);
      el('text', { class: 'name', x: gx + 14, y: gy + 17 }, node).textContent = g.name;
      el('text', { class: 'yrs', x: gx + 14, y: gy + 32 }, node).textContent = `${g.start}–${g.end ?? '…'}`;
      el('title', {}, node).textContent = `${g.name} (${g.start}–${g.end ?? '…'}) · ${fam.name} · clic para abrir la ficha`;
      node.addEventListener('click', (e) => { e.stopPropagation(); open(id); });
      // Al pasar por un género se resaltan sus flechas y sus vecinos.
      node.addEventListener('mouseenter', () => {
        const near = new Set([id, ...ups(id), ...downs(id)]);
        svg.classList.add('hov');
        nodes.querySelectorAll('.node').forEach((n) => n.classList.toggle('hit', near.has(n.dataset.id)));
        links.querySelectorAll('.edge').forEach((p) => p.classList.toggle('hit', p.dataset.a === id || p.dataset.b === id));
      });
      node.addEventListener('mouseleave', () => svg.classList.remove('hov'));
      // Botón +/−: desplegar o plegar padres e hijos de este género.
      if (hasBtn(id)) {
        const isOpen = focus.open.has(id);
        const b = el('g', { class: 'fbtn', transform: `translate(${gx + gw - BTN - 8},${gy + (NODE_H - BAR_H) / 2})` }, node);
        el('rect', { width: BTN, height: BAR_H, rx: 4 }, b);
        el('text', { x: BTN / 2, y: 13, 'text-anchor': 'middle' }, b).textContent = isOpen ? '−' : '+';
        el('title', {}, b).textContent = isOpen ? 'Plegar sus relaciones' : `Desplegar sus influencias y herederos (${more(id)} nuevos)`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          isOpen ? focus.open.delete(id) : focus.open.add(id);
          renderFocus();
        });
      }
    }
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    box.scrollLeft = Math.max(0, xOf.get(focus.root) - box.clientWidth / 3);
    box.scrollTop = Math.max(0, yOf.get(focus.root) - box.clientHeight / 2);
  }
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
  // Pestaña «Portadas» (covers.js, común a todas las webs de Music_Books).
  const portadas = Portadas({
    all, FAMILIES, esc, trackHtml, togglePlayer, open, YT, data: window.LOOPS_COVERS,
    matches: trackMatches, isKey: (t) => t.ess, keyLabel: 'Solo esenciales ★', keyName: 'esencial',
    where: (r) => r.chs.slice().sort((a, b) => a - b).map((c) => esc(chapterName(c))).join(' · '),
  });
  // Pestaña «Menciones» (menciones.js, común a todas las webs de Music_Books).
  const menciones = Menciones({ all, FAMILIES, esc, trackHtml, togglePlayer, open, portadas, data: window.LOOPS_COVERS,
    pageLink: (m) => `Loops ${m[0]} · ${pageLink({ book: m[0], pdf: m[1] })}` });
  function render() {
    $('#ftoggle').classList.toggle('active', !!state.q || state.off.size > 0);
    renderTimeline(); renderList(); renderDiscs(); portadas.render(); stickMain(); fitScrollers(); }
  render();
  const hash = location.hash.slice(1);
  if (hash.startsWith('focus=') && byId.has(hash.slice(6))) showFocus(hash.slice(6));
  else if (byId.has(hash)) open(hash);
  // Arrancar la vista en 1940 aprox., donde empieza la densidad
  $('#scroller').scrollLeft = x(1940) - 40;
})();
