// Registro de géneros. Cada fichero de capítulo llama a LOOPS.add([...]) y
// los datos se fusionan por id: los arrays se unen, los textos nuevos se
// acumulan como notas por capítulo.
window.LOOPS = (function () {
  const genres = new Map();
  const chapters = [];

  const FAMILIES = {
    vanguardia: { name: 'Vanguardia y experimental', color: '#8b7cf6' },
    ambient:    { name: 'Ambient y escucha', color: '#38bdf8' },
    rock:       { name: 'Rock, synth-pop y canción', color: '#f472b6' },
    industrial: { name: 'Industrial y ruido', color: '#94a3b8' },
    jamaica:    { name: 'Jamaica y sound system', color: '#facc15' },
    disco:      { name: 'Disco y house', color: '#fb923c' },
    techno:     { name: 'Techno y derivados', color: '#22d3ee' },
    rave:       { name: 'Rave y continuum hardcore', color: '#4ade80' },
    hiphop:     { name: 'Hip hop, breaks y ritmo lento', color: '#f87171' },
    global:     { name: 'Gueto global y periferias', color: '#a3e635' },
  };
  // Capítulos que son mapas de estilos: sus fechas y lugares son provisionales.
  const isMap = (c) => c === 0 || c === 99;

  const key = (t) => (t.a + '|' + t.t).toLowerCase();

  function mergeArr(a = [], b = [], k = (x) => (typeof x === 'string' ? x.toLowerCase() : JSON.stringify(x))) {
    const seen = new Set(a.map(k));
    const out = a.slice();
    for (const x of b) if (!seen.has(k(x))) { seen.add(k(x)); out.push(x); }
    return out;
  }

  function add(list, chapter) {
    for (const g of list) {
      const prev = genres.get(g.id);
      if (!prev) {
        genres.set(g.id, {
          aka: [], influences: [], artists: [], tracks: [], labels: [], places: [], refs: [], notes: [], chapters: [],
          ...g,
          refs: (g.refs || []).map((r) => ({ ch: chapter, ...r })),
          notes: g.note ? [{ ch: chapter, text: g.note }] : [],
          chapters: chapter != null ? [chapter] : [],
          _datedBy: chapter,
        });
        continue;
      }
      for (const f of ['aka', 'influences', 'artists', 'labels', 'places']) prev[f] = mergeArr(prev[f], g[f]);
      prev.tracks = mergeArr(prev.tracks, g.tracks, key);
      // La discografía seleccionada del libro marca discos ya presentes como esenciales.
      for (const t of g.tracks || []) if (t.ess) { const m = prev.tracks.find((x) => key(x) === key(t)); if (m) m.ess = 1; }
      prev.refs = mergeArr(prev.refs, (g.refs || []).map((r) => ({ ch: chapter, ...r })), (r) => r.q);
      // Las fechas y el lugar de los mapas (0 y 99) son provisionales: el primer capítulo que los da manda.
      const fromMap = isMap(prev._datedBy) && !isMap(chapter);
      for (const f of ['name', 'family', 'start', 'end', 'place', 'desc', 'spectrum']) {
        const provisional = fromMap && ['start', 'end', 'place'].includes(f);
        if (g[f] != null && (g.override || provisional || prev[f] == null)) prev[f] = g[f];
      }
      if (fromMap && (g.start != null || g.end != null)) prev._datedBy = chapter;
      if (g.note) prev.notes.push({ ch: chapter, text: g.note });
      if (chapter != null && !prev.chapters.includes(chapter)) prev.chapters.push(chapter);
    }
  }

  return {
    FAMILIES,
    chapters,
    genres,
    chapter(meta) { chapters.push(meta); },
    add,
  };
})();
