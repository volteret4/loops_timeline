// Menciones, dentro del Timeline: un desplegable (con búsqueda difusa, «Mostrar todos» y «Mostrar
// ninguno») elige qué géneros o escenas despliegan bajo su barra una fila por artista, en el mismo
// eje de años. Cada fila va del primer al último álbum del artista; con la casilla «Discos», se
// parte en sus álbumes: rellenos, los que cita el libro (del color de la familia del género en que
// los cita), y solo con borde, el resto de sus álbumes de estudio según MusicBrainz; el borde, del
// color del género desplegado. Al pulsar un artista, la ficha lateral muestra los pasajes del libro
// que lo nombran y sus discos con vídeo. Es el mismo fichero en todas las webs de Music_Books: cada
// app.js lo llama con Menciones({…}), le pasa la pestaña Portadas (que ya agrupa las canciones por
// disco) y, al dibujar el timeline, le pide el alto (height) y el dibujo (draw) de cada género.
// Los pasajes (window.<ESPACIO>_MENTIONS, data/mentions.js) los genera tools/pdfpages.py a partir
// del PDF del libro, y el resto de álbumes de cada artista (window.<ESPACIO>_DISCOS, data/discos.js)
// tools/discos.py a partir de MusicBrainz; pesan bastante, así que se cargan al hacer falta.
window.Menciones = function (cfg) {
  const { all, FAMILIES, esc, trackHtml, togglePlayer, open, portadas, pageLink, data, redraw, reveal } = cfg;
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const AROW = 20, AH = 12;
  const box = $('#mctl');

  const byArtist = portadas.byArtist;
  // Los recopilatorios («Varios», «Various Artists»…) no son un artista: no llevan fila.
  const VARIOS = /^(varios( artistas)?|various( artists)?|vv\.? ?aa\.?|v\/a|va)$/i;
  const artistsOf = new Map(all.map((g) => [g, new Set()]));
  for (const gr of portadas.groups.values()) if (!VARIOS.test(gr.a.trim())) for (const g of gr.genres) artistsOf.get(g)?.add(gr.a);
  const genres = all.filter((g) => artistsOf.get(g).size).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'es'));
  const byId = (id) => genres.find((g) => g.id === id);
  // on: los géneros desplegados; discos: filas partidas en álbumes; artist: el de la ficha abierta.
  const st = { on: new Set(), discos: false, artist: null, q: '' };

  // Datos que pesan y solo se cargan al hacer falta: los pasajes del libro (data/mentions.js, de
  // tools/pdfpages.py) y las discografías (data/discos.js, de tools/discos.py).
  const lazy = {};
  function load(file, suffix) {
    const key = () => Object.keys(window).find((k) => k.endsWith(suffix));
    if (!lazy[file]) lazy[file] = key() ? Promise.resolve(window[key()]) : new Promise((ok) => {
      const s = document.createElement('script');
      s.src = `data/${file}.js`;
      s.onload = () => ok(window[key()] || {});
      s.onerror = () => ok({});
      document.head.appendChild(s);
    });
    return lazy[file];
  }
  let M = null, DISCOS = null;
  const needDiscos = () => {
    if (DISCOS || !st.on.size) return;
    load('discos', '_DISCOS').then((d) => { DISCOS = d; memo.clear(); redraw(); });
  };

  // Lo que se dibuja de cada artista: los discos que cita el libro (agrupados como en Portadas)
  // y el resto de sus álbumes según MusicBrainz.
  const CUR = new Date().getFullYear();
  const nkey = (s) => s.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
  const memo = new Map();
  function entries(a) {
    if (memo.has(a)) return memo.get(a);
    const mine = byArtist.get(a) || [];
    const cited = new Set(mine.flatMap((gr) => [gr.t, ...gr.items.map((r) => r.t)]).map(nkey));
    const out = mine.filter((gr) => gr.y).map((gr) => ({ y: gr.y, t: gr.t, gr }));
    for (const [t, y] of (DISCOS && DISCOS[a]) || []) if (y <= CUR && !cited.has(nkey(t))) out.push({ y, t });
    out.sort((p, q) => p.y - q.y || !!q.gr - !!p.gr || p.t.localeCompare(q.t, 'es'));
    memo.set(a, out);
    return out;
  }
  // Artistas de un género, por el año de su primer disco citado.
  const first = (d) => (d.find((e) => e.gr) || d[0]).y;
  const rowsOf = (G) => [...artistsOf.get(G)].map((a) => ({ a, d: entries(a) })).filter((o) => o.d.length)
    .sort((x, y) => first(x.d) - first(y.d) || x.a.localeCompare(y.a, 'es'));

  // Lo que app.js pregunta al dibujar el timeline: el alto extra de un género y hasta qué año llega.
  const height = (G) => st.on.has(G) ? rowsOf(G).length * AROW + 6 : 0;
  function lastYear() {
    let y = 0;
    for (const G of st.on) for (const { d } of rowsOf(G)) y = Math.max(y, d[d.length - 1].y + 1);
    return y;
  }

  // Dibuja las filas de artistas de G en la capa layer del SVG, desde la altura y0, con la escala x.
  function draw(G, layer, y0, x) {
    const el = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      parent.appendChild(n);
      return n;
    };
    const col = (g) => FAMILIES[g.family].color;
    const mine = col(G);
    rowsOf(G).forEach(({ a, d }, i) => {
      const y = y0 + i * AROW;
      const years = [...new Set(d.map((e) => e.y))];
      const x0 = x(years[0]), x1 = x(years[years.length - 1] + 1);
      const n = M && M[a] ? M[a].length : 0;
      const label = a + (n ? ` · ${n}` : '');
      const row = el('g', { class: 'mart' + (a === st.artist ? ' on' : ''), 'data-a': a }, layer);
      el('rect', { class: 'mhit', x: x0 - label.length * 6.4 - 12, y: y - 3, width: x1 - x0 + label.length * 6.4 + 14, height: AROW }, row);
      el('text', { class: 'mlabel', x: x0 - 6, y: y + AH - 2, 'text-anchor': 'end' }, row).textContent = label;
      const cites = d.filter((e) => e.gr).length;
      if (!st.discos) {
        el('rect', { class: 'mfix', x: x0, y: y + 2, width: Math.max(4, x1 - x0), height: AH - 4, rx: 4, fill: mine }, row);
        el('title', {}, row).textContent = `${a} · ${years[0]}–${years[years.length - 1]} · ${cites} ${cites === 1 ? 'disco citado' : 'discos citados'} de ${d.length} · clic para ver sus menciones`;
        return;
      }
      el('rect', { class: 'mline', x: x0, y: y + AH / 2 - 1, width: x1 - x0, height: 2 }, row);
      // Cada disco ocupa su año (los del mismo año se lo reparten).
      for (const yr of years) {
        const same = d.filter((e) => e.y === yr);
        const w = (x(yr + 1) - x(yr)) / same.length;
        same.forEach((e, j) => {
          const s = el('rect', { class: 'mseg' + (e.gr ? (e.gr.isKey ? ' key' : '') : ' out'), x: x(yr) + w * j + 0.5, y, width: Math.max(3, w - 1), height: AH, rx: 2, stroke: mine }, row);
          if (e.gr) {
            const g = e.gr.genres.includes(G) ? G : e.gr.genres[0];
            s.setAttribute('fill', col(g));
            el('title', {}, s).textContent = `${a} — ${e.gr.t} (${e.gr.y}) · ${e.gr.genres.map((g) => g.name).join(', ')}${e.gr.items.length > 1 ? '\n' + e.gr.items.map((r) => '· ' + r.t).join('\n') : ''}`;
          } else el('title', {}, s).textContent = `${a} — ${e.t} (${e.y}) · no lo cita el libro`;
        });
      }
    });
  }

  // ---------- Desplegable de géneros y casilla «Discos» ----------
  const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Búsqueda difusa: mejor si el texto aparece seguido (y antes); si no, las letras en orden, con
  // menos huecos mejor. Devuelve -1 si no casa.
  function fuzzy(q, s) {
    s = norm(s);
    const i = s.indexOf(q);
    if (i >= 0) return i / 100;
    let j = 0, gaps = 0, last = -1;
    for (let k = 0; k < s.length && j < q.length; k++) if (s[k] === q[j]) { if (last >= 0) gaps += k - last - 1; last = k; j++; }
    return j === q.length ? 1 + gaps : -1;
  }
  function found() {
    const q = norm(st.q.trim());
    if (!q) return genres;
    return genres.map((g) => [g, Math.min(...[g.name, ...(g.aka || [])].map((s) => fuzzy(q, s)).map((v) => v < 0 ? Infinity : v))])
      .filter(([, v]) => v < Infinity).sort((a, b) => a[1] - b[1]).map(([g]) => g);
  }
  box.innerHTML = `<div class="mdrop"><button type="button" class="mbtn" aria-expanded="false"></button>
      <div class="mpop" hidden><input type="search" class="mq" placeholder="Buscar (vale a medias o con letras sueltas)…" autocomplete="off">
        <div class="mall"><button type="button" data-all="1"></button><button type="button" data-all="0"></button></div>
        <div class="mopts"></div></div></div>
    <label class="mdisc" title="Cada fila de artista, partida en sus álbumes: rellenos, los que cita el libro; con borde, el resto de sus álbumes de estudio (MusicBrainz)"><input type="checkbox" class="mdiscos"> Discos</label>
    <span class="mstat"></span>`;
  const btn = box.querySelector('.mbtn'), pop = box.querySelector('.mpop'), mq = box.querySelector('.mq');
  function list() {
    const gs = found();
    const q = st.q.trim();
    box.querySelector('[data-all="1"]').textContent = q ? `Mostrar estos (${gs.length})` : 'Mostrar todos';
    box.querySelector('[data-all="0"]').textContent = q ? 'Quitar estos' : 'Mostrar ninguno';
    box.querySelector('.mopts').innerHTML = gs.map((g) => `<label class="mopt"><input type="checkbox" data-id="${esc(g.id)}"${st.on.has(g) ? ' checked' : ''}><i style="background:${FAMILIES[g.family].color}"></i>${esc(g.name)} <small>${g.start}–${g.end ?? '…'} · ${artistsOf.get(g).size} ${artistsOf.get(g).size === 1 ? 'artista' : 'artistas'}</small></label>`).join('')
      || '<p class="fine">Nada coincide.</p>';
  }
  function status() {
    const n = st.on.size;
    btn.textContent = `Menciones: ${n ? (n === genres.length ? 'todos' : n === 1 ? [...st.on][0].name : `${n} elegidos`) : 'ninguno'} ▾`;
    const arts = new Set([...st.on].flatMap((G) => [...artistsOf.get(G)]));
    box.querySelector('.mstat').textContent = n ? `${arts.size} ${arts.size === 1 ? 'artista' : 'artistas'} · clic en uno para ver sus menciones` : '';
  }
  // La selección queda en la URL para poder volver a ella o compartirla («*» = todos).
  const hashOf = () => '#menciones=' + encodeURIComponent((st.on.size === genres.length ? '*' : [...st.on].map((g) => g.id).join(',')) + (st.artist ? '|' + st.artist : ''));
  function update(focusId) {
    if (st.on.size) history.replaceState(null, '', hashOf());
    else if (location.hash.startsWith('#menciones=')) history.replaceState(null, '', location.pathname);
    status();
    needDiscos();
    redraw();
    if (focusId) reveal(focusId);
  }
  const setOpen = (o) => { pop.hidden = !o; btn.setAttribute('aria-expanded', o); if (o) { list(); mq.focus(); } };
  btn.addEventListener('click', () => setOpen(pop.hidden));
  document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.mdrop')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) setOpen(false); });
  mq.addEventListener('input', () => { st.q = mq.value; list(); });
  // Intro marca o desmarca el primero de la búsqueda.
  mq.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const g = found()[0];
    if (!g) return;
    st.on.has(g) ? st.on.delete(g) : st.on.add(g);
    list();
    update(st.on.has(g) && g.id);
  });
  box.addEventListener('change', (e) => {
    if (e.target.matches('.mdiscos')) { st.discos = e.target.checked; redraw(); return; }
    const g = e.target.dataset.id && byId(e.target.dataset.id);
    if (!g) return;
    e.target.checked ? st.on.add(g) : st.on.delete(g);
    update(st.on.has(g) && g.id);
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-all]');
    if (!b) return;
    for (const g of found()) b.dataset.all === '1' ? st.on.add(g) : st.on.delete(g);
    list();
    update();
  });
  status();

  // Clic en una fila de artista del timeline: su ficha con las menciones.
  $('#svg').addEventListener('click', (e) => {
    const row = e.target.closest('.mart');
    if (row) openArtist(row.dataset.a);
  });

  // Nombres que se resaltan en los pasajes: el completo (sin «and His Orchestra»…) y el apellido.
  function marks(a) {
    const base = a.replace(/\s+(and|&|y|with|con)\s+(his|her|their|su|sus)\s+.*$|\s+(orchestra|orquesta|quartet|quintet|sextet|trio|band)$/i, '');
    const parts = base.split(/\s+(?:&|and|y|with|con)\s+/);
    const names = new Set();
    for (const p of parts) {
      names.add(p.replace(/^(the|los|las)\s+/i, ''));
      const w = p.split(/\s+/);
      if (w.length > 1 && w[w.length - 1].length >= 4) names.add(w[w.length - 1]);
    }
    const alt = [...names].sort((x, y) => y.length - x.length).map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return alt ? new RegExp(`(?<![\\p{L}\\p{N}])(${alt})(?![\\p{L}\\p{N}])`, 'gu') : null;
  }
  const PAGE = 30;
  function mentionsHtml(a, list, all) {
    const rx = marks(a);
    const shown = all ? list : list.slice(0, PAGE);
    return shown.map((m) => `<div class="ref mref"><div class="where">${pageLink(m)}</div><blockquote>${rx ? esc(m[3]).replace(rx, '<mark>$1</mark>') : esc(m[3])}</blockquote></div>`).join('')
      + (!all && list.length > PAGE ? `<button class="more" data-more>Ver las ${list.length - PAGE} restantes</button>` : '');
  }

  async function openArtist(a) {
    st.artist = a;
    document.querySelectorAll('#svg .mart').forEach((r) => r.classList.toggle('on', r.dataset.a === a));
    const fresh = !M;
    M = await load('mentions', '_MENTIONS');
    if (!DISCOS) { DISCOS = await load('discos', '_DISCOS'); memo.clear(); }
    const A = (data && data.a && data.a[a]) || {};
    const mine = (byArtist.get(a) || []).slice().sort((x, y) => (x.y || 9999) - (y.y || 9999));
    const items = mine.flatMap((gr) => gr.items);
    const gs = [...new Set(items.flatMap((r) => r.genres))];
    const ys = items.map((r) => r.y).filter(Boolean);
    const others = entries(a).filter((e) => !e.gr);
    const list = (M[a] || []).slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const chip = (g) => `<button class="chip" data-go="${esc(g.id)}"><i style="background:${FAMILIES[g.family].color}"></i>${esc(g.name)}</button>`;
    const det = $('#detail');
    det.innerHTML = `
      ${A.img ? `<div class="cvpics"><figure class="art"><img src="${esc(A.img)}" alt="${esc(a)}"><figcaption>${A.isrc === 'commons' ? 'Wikimedia Commons' : 'Deezer'}</figcaption></figure></div>` : ''}
      <h2>${esc(a)}</h2>
      <div class="aka">${ys.length ? `${Math.min(...ys)}–${Math.max(...ys)} · ` : ''}${items.length} ${items.length === 1 ? 'disco o canción citada' : 'discos y canciones citados'} · ${list.length} ${list.length === 1 ? 'mención' : 'menciones'} en el libro</div>
      <div class="links cvg">${gs.map(chip).join('')}</div>
      <h4>Menciones en el libro (${list.length})</h4>
      <div class="mlist">${list.length ? mentionsHtml(a, list, false) : '<p class="fine">El libro no lo nombra fuera de las citas de discos, o el nombre no se encontró en el PDF.</p>'}</div>
      <h4>Discos y canciones mencionados en el libro (${items.length})</h4>
      <ol class="tracks">${items.map((r) => trackHtml(r)).join('')}</ol>
      ${others.length ? `<h4>Otros álbumes, no citados en el libro (${others.length})</h4><div class="tags mothers">${others.map((e) => `<span>${esc(e.t)} <b>${e.y}</b></span>`).join('')}</div>` : ''}
      <p class="fine">Pasajes localizados automáticamente en el PDF por el nombre del artista (o su apellido, si se acaba de nombrar). Otros álbumes: los de estudio según MusicBrainz. Vídeos de YouTube.</p>`;
    det.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => open(b.dataset.go));
    det.querySelectorAll('.play').forEach((b) => b.onclick = () => togglePlayer(b));
    const more = det.querySelector('[data-more]');
    if (more) more.onclick = () => { det.querySelector('.mlist').innerHTML = mentionsHtml(a, list, true); };
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    $('#panel').scrollTop = 0;
    history.replaceState(null, '', hashOf());
    // Ya cargados los pasajes, las filas muestran cuántos tiene cada artista.
    if (fresh) redraw();
  }

  // Selección guardada en la URL (#menciones=id1,id2|Artista, o * para todos).
  const h = decodeURIComponent(location.hash.slice(1));
  let pending = null;
  if (h.startsWith('menciones=')) {
    const [ids, a] = h.slice(10).split('|');
    for (const g of ids === '*' ? genres : ids.split(',').map(byId).filter(Boolean)) st.on.add(g);
    status();
    needDiscos();
    pending = { id: [...st.on][0]?.id, a };
  }
  // Desde la ficha de un género (app.js): desplegarlo en el timeline y llevarlo a la vista.
  function show(id) {
    const g = byId(id);
    if (!g) return;
    st.on.add(g);
    st.artist = null;
    document.querySelector('.views button[data-view="timeline"]').click();
    update(id);
  }
  // app.js lo llama tras el primer dibujo: llevar a la vista lo que pedía la URL.
  function start() {
    if (!pending) return;
    if (pending.id) reveal(pending.id);
    if (pending.a) openArtist(pending.a);
  }
  return { height, lastYear, draw, show, start, has: (id) => !!byId(id) };
};
