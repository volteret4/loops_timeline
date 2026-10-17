// Pestaña «Menciones»: se elige un género o escena y se ve un timeline con una barra por artista,
// partida en los discos que el libro cita de él (cada tramo, del color de su género). Al pulsar un
// artista, la ficha lateral muestra los pasajes del libro que lo nombran y la lista de sus discos y
// canciones con su vídeo. Es el mismo fichero en todas las webs de Music_Books: cada app.js lo
// llama con Menciones({…}) y le pasa la pestaña Portadas, que ya agrupa las canciones por disco.
// Los pasajes (window.<ESPACIO>_MENTIONS, data/mentions.js) los genera tools/pdfpages.py a partir
// del PDF del libro; pesan bastante, así que se cargan la primera vez que se abre una ficha.
window.Menciones = function (cfg) {
  const { all, FAMILIES, esc, trackHtml, togglePlayer, open, portadas, pageLink, data } = cfg;
  const $ = (s) => document.querySelector(s);
  const box = $('#mentions');
  const LABEL = 200, ROW = 26, MIN_PX = 14;
  // Colores para los demás géneros de la vista; el elegido conserva el de su familia.
  const PALETTE = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
    '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#aaffc3', '#808000', '#ffd8b1', '#a9a9a9'];

  const groups = [...portadas.groups.values()];
  const byArtist = portadas.byArtist;
  const artistsOf = new Map(all.map((g) => [g, new Set()]));
  for (const gr of groups) for (const g of gr.genres) artistsOf.get(g)?.add(gr.a);
  const genres = all.filter((g) => artistsOf.get(g).size).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'es'));
  const st = { g: genres[0], artist: null };

  // Pasajes del libro: carga perezosa de data/mentions.js.
  let M = null;
  const found = () => Object.keys(window).find((k) => /_MENTIONS$/.test(k));
  function load() {
    if (M) return Promise.resolve(M);
    if (found()) return Promise.resolve(M = window[found()]);
    return new Promise((ok) => {
      const s = document.createElement('script');
      s.src = 'data/mentions.js';
      s.onload = () => ok(M = window[found()] || {});
      s.onerror = () => ok(M = {});
      document.head.appendChild(s);
    });
  }

  const dated = (a) => (byArtist.get(a) || []).filter((gr) => gr.y).sort((x, y) => x.y - y.y || x.t.localeCompare(y.t, 'es'));

  function render() {
    const G = st.g;
    if (!G) { box.innerHTML = '<p class="hint">No hay discos en los datos.</p>'; return; }
    const artists = [...artistsOf.get(G)].map((a) => ({ a, d: dated(a) })).filter((o) => o.d.length)
      .sort((x, y) => x.d[0].y - y.d[0].y || x.a.localeCompare(y.a, 'es'));
    // Color por género: el elegido, el de su familia; los demás, de la paleta por orden de aparición.
    const colors = new Map([[G, FAMILIES[G.family].color]]);
    const count = new Map();
    for (const o of artists) for (const gr of o.d) {
      const g = gr.genres.includes(G) ? G : gr.genres[0];
      if (!colors.has(g)) colors.set(g, PALETTE[(colors.size - 1) % PALETTE.length]);
      count.set(g, (count.get(g) || 0) + 1);
      gr._g = g;
    }
    const ys = artists.flatMap((o) => o.d.map((gr) => gr.y));
    const Y0 = Math.min(...ys), Y1 = Math.max(...ys) + 1;
    const width = (box.clientWidth || window.innerWidth - 48) - LABEL - 24;
    const PX = Math.max(MIN_PX, width / Math.max(1, Y1 - Y0));
    const x = (y) => (y - Y0) * PX;
    const W = x(Y1) + 8;

    const opts = Object.entries(FAMILIES).map(([f, F]) => {
      const list = genres.filter((g) => g.family === f);
      return list.length ? `<optgroup label="${esc(F.name)}">${list.map((g) => `<option value="${esc(g.id)}"${g === G ? ' selected' : ''}>${esc(g.name)} (${artistsOf.get(g).size})</option>`).join('')}</optgroup>` : '';
    }).join('');
    const legend = [...colors].map(([g, c]) => `<button class="mlg${g === G ? ' on' : ''}" data-g="${esc(g.id)}" title="Ver ${esc(g.name)}"><i style="background:${c}"></i>${esc(g.name)} <span>${count.get(g) || 0}</span></button>`).join('');
    let axis = '';
    const step = PX >= 40 ? 1 : PX >= 16 ? 5 : 10;
    for (let y = Math.ceil(Y0 / step) * step; y <= Y1; y += step) axis += `<span style="left:${x(y)}px">${y}</span>`;
    const rows = artists.map(({ a, d }) => {
      // Cada disco ocupa desde su año hasta el del siguiente; los del mismo año se reparten ese tramo.
      const years = [...new Set(d.map((gr) => gr.y))];
      const segs = years.map((y, i) => {
        const same = d.filter((gr) => gr.y === y);
        const span = (i + 1 < years.length ? years[i + 1] : y + 1) - y;
        return same.map((gr, j) => {
          const l = x(y) + (span * PX * j) / same.length, w = (span * PX) / same.length;
          const tip = `${gr.t} (${gr.y}) · ${gr.genres.map((g) => g.name).join(', ')}${gr.items.length > 1 ? '\n' + gr.items.map((r) => '· ' + r.t).join('\n') : ''}`;
          return `<span class="mseg${gr.isKey ? ' key' : ''}" style="left:${l}px;width:${Math.max(3, w - 1)}px;background:${colors.get(gr._g)}" title="${esc(tip)}">${w > 46 ? esc(gr.t) : ''}</span>`;
        }).join('');
      }).join('');
      const n = M && M[a] ? M[a].length : null;
      return `<div class="mrow${a === st.artist ? ' on' : ''}" data-a="${esc(a)}"><button class="mname" title="${esc(a)}">${esc(a)}${n ? ` <span>${n}</span>` : ''}</button><div class="mbar" style="width:${W}px">${segs}</div></div>`;
    }).join('');
    box.innerHTML = `<div class="dbar mhead"><label>Género o escena <select data-mg>${opts}</select></label>
        <span>${artists.length} artistas · ${artists.reduce((s, o) => s + o.d.length, 0)} discos citados · ${Y0}–${Y1 - 1}</span></div>
      <div class="mlegend">${legend}</div>
      <div class="mscroll"><div class="mgrid" style="width:${LABEL + W}px;--label:${LABEL}px">
        <div class="maxis" style="width:${W}px">${axis}</div>${rows}</div></div>
      <p class="fine">Cada barra es un artista, partida en los discos y canciones que el libro cita de él (las canciones de un mismo disco forman un tramo), con el color de su género. Pulsa un artista para ver los pasajes que lo nombran.</p>`;
    // Arrancar en los años del género elegido.
    // Las barras se recortan por la izquierda lo que se haya desplazado el timeline, para que no
    // asomen bajo la columna fija de nombres.
    const sc = box.querySelector('.mscroll');
    const clip = () => sc.firstElementChild.style.setProperty('--sl', sc.scrollLeft + 'px');
    sc.addEventListener('scroll', clip, { passive: true });
    sc.scrollLeft = Math.max(0, x(Math.max(Y0, G.start)) - 40);
    clip();
  }

  box.addEventListener('change', (e) => {
    if (!e.target.matches('[data-mg]')) return;
    st.g = genres.find((g) => g.id === e.target.value) || st.g;
    render();
  });
  box.addEventListener('click', (e) => {
    const lg = e.target.closest('.mlg');
    if (lg) { st.g = genres.find((g) => g.id === lg.dataset.g) || st.g; render(); return; }
    const row = e.target.closest('.mrow');
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
    box.querySelectorAll('.mrow').forEach((r) => r.classList.toggle('on', r.dataset.a === a));
    await load();
    const A = (data && data.a && data.a[a]) || {};
    const mine = (byArtist.get(a) || []).slice().sort((x, y) => (x.y || 9999) - (y.y || 9999));
    const items = mine.flatMap((gr) => gr.items);
    const gs = [...new Set(items.flatMap((r) => r.genres))];
    const ys = items.map((r) => r.y).filter(Boolean);
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
      <p class="fine">Pasajes localizados automáticamente en el PDF por el nombre del artista (o su apellido, si se acaba de nombrar). Vídeos de YouTube.</p>`;
    det.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => open(b.dataset.go));
    det.querySelectorAll('.play').forEach((b) => b.onclick = () => togglePlayer(b));
    const more = det.querySelector('[data-more]');
    if (more) more.onclick = () => { det.querySelector('.mlist').innerHTML = mentionsHtml(a, list, true); };
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    $('#panel').scrollTop = 0;
    history.replaceState(null, '', '#menciones=' + encodeURIComponent(st.g.id + '|' + a));
    // Ya cargados los pasajes, las filas muestran cuántos tiene cada artista.
    if (!box.querySelector('.mname span')) render();
  }

  const view = document.querySelector('.views button[data-view="mentions"]');
  view.addEventListener('click', () => requestAnimationFrame(render));
  render();
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('menciones=')) {
    const [gid, a] = h.slice(10).split('|');
    st.g = genres.find((g) => g.id === gid) || st.g;
    view.click();
    if (a) openArtist(a);
  }
  return { render };
};
