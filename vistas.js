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

// En GitHub Pages cada libro es un repo propio (volteret4.github.io/<repo>/) y la portada común vive
// en el repo libros: los enlaces con data-pages llevan allí; abiertos en local, siguen siendo relativos.
if (location.hostname.endsWith('github.io')) for (const a of document.querySelectorAll('a[data-pages]')) a.href = a.dataset.pages;
