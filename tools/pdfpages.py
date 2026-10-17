#!/usr/bin/env python3
"""Añade a data/refs.js la página del PDF del libro en la que aparece cada cita.

Uso: python3 -I tools/pdfpages.py [--impresas <book.json>] <refs.js> <libro.pdf>[=<libro.epub>] [<libro2.pdf>[=<libro2.epub>]]

Si el PDF no existe y se indica el ePub, lo genera con Calibre (ebook-convert),
en A5 y sin números de página impresos, para que la página que muestra el visor
sea la que enlaza la web (`libro.pdf#page=N`). Busca cada cita en el texto de
cada página (pdftotext), comparando solo letras, y guarda la página en `pdf`.
Con dos PDF (Loops 1 y 2), el libro de cada cita es `book` de refs.js (1 o 2).

Genera también data/pages.js (`window.<ESPACIO>_PAGES = {"artista|título": [[libro, página], …]}`):
las páginas que mencionan cada disco o canción de los datos. Una página cuenta si contiene el
título como palabras completas y el artista aparece en ella o en la de al lado (salvo títulos
largos, que bastan solos); los títulos de menos de 4 letras no se buscan, y los que salen en
muchas páginas o coinciden con el artista solo cuentan entre comillas.

Con --impresas (Postpunk), <book.json> es la salida de split.py con la página impresa de cada
trozo de texto: cada mención lleva además esa página, [libro, página del PDF, página impresa].
"""
import bisect
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

CONVERT = ['--paper-size', 'a5', '--pdf-default-font-size', '13',
           '--pdf-page-margin-top', '40', '--pdf-page-margin-bottom', '40',
           '--pdf-page-margin-left', '45', '--pdf-page-margin-right', '45']


DUMP = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script src="(data\/[^"]+)"/g)) {
  if (/(yt|refs|covers|pages)\.js$/.test(m[1])) continue;
  vm.runInContext(fs.readFileSync(m[1], 'utf8'), ctx);
}
const ns = Object.keys(ctx).find((k) => ctx[k] && ctx[k].genres && typeof ctx[k].genres.values === 'function');
const tracks = new Map();
for (const g of ctx[ns].genres.values()) for (const t of g.tracks) tracks.set(t.a + '|' + t.t, { a: t.a, t: t.t });
console.log(JSON.stringify({ ns, tracks: [...tracks.values()] }));
"""
LONG = 20  # un título de 20 caracteres o más se acepta sin el artista cerca
MANY = 6   # un título en más páginas es una palabra corriente: solo cuenta entre comillas
BAND = re.compile(r'\s+(and|&|y|with|con)\s+(his|her|their|su|sus)\s+.*$|\s+(orchestra|orquesta|quartet|quintet|sextet|trio|band)$', re.I)


def words(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return ' ' + re.sub(r'[^a-z0-9]+', ' ', s).strip() + ' '


def artist_keys(a):
    a = BAND.sub('', a.strip())
    w = words(a).strip()
    w = re.sub(r'^(the|los|las|el|la) ', '', w)
    keys = {w}
    parts = w.split()
    if len(parts) > 1 and len(parts[-1]) >= 4:
        keys.add(parts[-1])
    return [f' {k} ' for k in keys if k]


def title_keys(t):
    t = re.sub(r'\([^)]*\)|\[[^\]]*\]', '', t)
    out = []
    for part in re.split(r'\s+/\s+', t):
        w = words(part)
        if len(w.replace(' ', '')) >= 4:
            out.append(w)
    return out


def quoted(s):
    """Como words(), pero cada comilla queda como la palabra «qq»."""
    return words(re.sub(r'[«»“”"]', ' qq ', s))


def printed_marks(book_json, flat):
    """Posiciones (en las letras del PDF) donde empieza cada página impresa según book.json."""
    marks, pos = [], 0
    for para in json.loads(Path(book_json).read_text()):
        for page, seg in para['segs']:
            k = letters(seg)[:40]
            i = flat.find(k, pos) if len(k) >= 20 else -1
            if i >= 0:
                marks.append((i, page))
                pos = i
    return marks


def mentions(tracks, wordpages, quotedpages, where=None):
    out = {}
    for tr in tracks:
        akeys, hits = artist_keys(tr['a']), []
        for tk in title_keys(tr['t']):
            found = [(b, i) for b, pg in enumerate(wordpages) for i, text in enumerate(pg) if tk in text]
            # Título que es una palabra corriente o el propio artista: solo cuenta entre comillas.
            generic = len(found) > MANY or tk in akeys
            qk = ' qq' + tk + 'qq '
            for b, i in found:
                pg = wordpages[b]
                near = any(k in pg[j] for j in (i - 1, i, i + 1) if 0 <= j < len(pg) for k in akeys)
                if generic and qk not in quotedpages[b][i]:
                    continue
                if len(tk) >= LONG + 2 or near:
                    hits.append((b + 1, i + 1, *([where(b, i, tk)] if where else [])))
        if hits:
            out[tr['a'] + '|' + tr['t']] = sorted(set(hits))
    return out


def letters(s):
    s = unicodedata.normalize('NFKD', s.lower())
    return ''.join(c for c in s if c.isalpha())


def pdftext(pdf):
    return subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True, check=True).stdout.split('\f')


def pages(raw):
    """Texto de todo el PDF en letras y el desplazamiento donde empieza cada página."""
    starts, parts, n = [], [], 0
    for page in raw:
        starts.append(n)
        page = letters(page)
        parts.append(page)
        n += len(page)
    return ''.join(parts), starts


def locate(book, q):
    flat, starts = book
    nq = letters(q)
    i = flat.find(nq)
    if i < 0 and len(nq) > 60:
        i = flat.find(nq[:60])
    if i < 0 and len(nq) > 60:
        i = flat.find(nq[-60:])
    return bisect.bisect_right(starts, i) if i >= 0 else None


def main(*args):
    args = list(args)
    book_json = None
    if args[0] == '--impresas':
        book_json = args[1]
        args = args[2:]
    refs_js, *pdfs = args
    books, wordpages, quotedpages = [], [], []
    for arg in pdfs:
        pdf, _, epub = arg.partition('=')
        pdf = Path(pdf)
        if not pdf.exists():
            if not epub:
                sys.exit(f'No existe {pdf}')
            print(f'Generando {pdf} desde {epub}…')
            subprocess.run(['ebook-convert', epub, str(pdf), *CONVERT], check=True, capture_output=True)
        raw = pdftext(pdf)
        books.append(pages(raw))
        wordpages.append([words(pg) for pg in raw])
        quotedpages.append([quoted(pg) for pg in raw])
    p = Path(refs_js)
    src = p.read_text()
    # Una o varias sentencias `window.NOMBRE = {…};` (Loops añade las definiciones del mapa).
    parts = re.split(r'^(window\.\w+) = ', src, flags=re.M)
    blocks, items, missing = [], [], []
    for name, body in zip(parts[1::2], parts[2::2]):
        data = json.loads(body.rstrip().rstrip(';'))
        for key, val in data.items():
            for r in (val if isinstance(val, list) else [val]):
                items.append((r.get('text') or key, r))
        blocks.append((name, data))
    for q, r in items:
        book = books[r.get('book', 1) - 1] if len(books) > 1 else books[0]
        page = locate(book, q)
        if page:
            r['pdf'] = page
        else:
            r.pop('pdf', None)
            missing.append(q[:120])
    p.write_text(parts[0] + ''.join(f'{n} = {json.dumps(d, ensure_ascii=False, indent=1)};\n' for n, d in blocks))
    print(f'{len(items) - len(missing)} citas con página del PDF, {len(missing)} sin ella')
    for q in missing:
        print('  SIN PÁGINA:', q)
    dump = json.loads(subprocess.run(['node', '-e', DUMP], capture_output=True, text=True, check=True).stdout)
    where = None
    if book_json:
        flat, starts = books[0]
        marks = printed_marks(book_json, flat)
        pos = [m[0] for m in marks]

        def where(b, i, tk):
            # Primera aparición del título en la página i: su posición en letras → página impresa.
            text = wordpages[b][i]
            at = starts[i] + len(letters(text[:text.index(tk)]))
            j = bisect.bisect_right(pos, at) - 1
            return marks[j][1] if j >= 0 else None
        print(f'{len(marks)} comienzos de página impresa situados en el PDF')
    found = mentions(dump['tracks'], wordpages, quotedpages, where)
    Path(refs_js).with_name('pages.js').write_text(
        '// Generado por tools/pdfpages.py — no editar a mano.\n'
        f"window.{dump['ns']}_PAGES = {json.dumps(found, ensure_ascii=False, separators=(',', ':'))};\n")
    print(f"{len(found)} de {len(dump['tracks'])} discos con páginas en el PDF")


if __name__ == '__main__':
    main(*sys.argv[1:])
