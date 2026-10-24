// Las vistas (Timeline, Discos, Portadas…) se eligen en un desplegable para dejar el ancho de la
// barra a los filtros de género. Los botones .views siguen en la página, ocultos: app.js, covers.js
// y menciones.js los pulsan para cambiar de vista, y el desplegable se sincroniza con ellos.
// Es el mismo fichero en todas las webs de Music_Books; se carga después de app.js.
(function () {
  const views = document.querySelector('.views');
  if (!views) return;
  const sel = document.createElement('select');
  sel.className = 'viewsel';
  sel.setAttribute('aria-label', 'Vista');
  for (const b of views.querySelectorAll('button')) sel.add(new Option(b.textContent, b.dataset.view));
  const sync = () => {
    const on = views.querySelector('button.on');
    if (on) sel.value = on.dataset.view;
  };
  sel.addEventListener('change', () => views.querySelector(`button[data-view="${sel.value}"]`).click());
  views.addEventListener('click', () => setTimeout(sync));
  views.before(sel);
  views.classList.add('hid');
  sync();
})();

// Las familias (los carriles del timeline) también van en un desplegable con una casilla por familia,
// «Todas» y «Ninguna»: sus nombres largos no caben en la barra. Los chips de app.js siguen en la
// página, ocultos; el desplegable los pulsa y se sincroniza con ellos.
(function () {
  const fam = document.querySelector('#families');
  if (!fam) return;
  const chips = () => [...fam.querySelectorAll('.chip')];
  const box = document.createElement('div');
  box.className = 'famdrop';
  box.innerHTML = '<button type="button" class="fambtn" aria-expanded="false"></button><div class="fampop" hidden><div class="mall"><button type="button" data-fam="1">Todas</button><button type="button" data-fam="0">Ninguna</button></div><div class="famopts"></div></div>';
  const btn = box.querySelector('.fambtn'), pop = box.querySelector('.fampop');
  const sync = () => {
    const cs = chips(), on = cs.filter((c) => !c.classList.contains('off'));
    btn.textContent = `Familias: ${on.length === cs.length ? 'todas' : on.length === 1 ? on[0].textContent : on.length ? `${on.length} de ${cs.length}` : 'ninguna'} ▾`;
    btn.classList.toggle('active', on.length < cs.length);
    box.querySelector('.famopts').innerHTML = cs.map((c, i) => `<label class="mopt"><input type="checkbox" data-i="${i}"${c.classList.contains('off') ? '' : ' checked'}>${c.innerHTML}</label>`).join('');
  };
  const setOpen = (o) => { pop.hidden = !o; btn.setAttribute('aria-expanded', o); };
  btn.addEventListener('click', () => setOpen(pop.hidden));
  document.addEventListener('click', (e) => { if (!pop.hidden && !box.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  box.addEventListener('change', (e) => { const c = chips()[e.target.dataset.i]; if (c) { c.click(); sync(); } });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam]');
    if (!b) return;
    for (const c of chips()) if (c.classList.contains('off') === (b.dataset.fam === '1')) c.click();
    sync();
  });
  fam.before(box);
  fam.classList.add('hid');
  sync();
})();

// En GitHub Pages cada libro es un repo propio (volteret4.github.io/<repo>/) y la portada común vive
// en el repo libros: los enlaces con data-pages llevan allí; abiertos en local, siguen siendo relativos.
if (location.hostname.endsWith('github.io')) for (const a of document.querySelectorAll('a[data-pages]')) a.href = a.dataset.pages;
