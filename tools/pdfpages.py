#!/usr/bin/env python3
"""Añade a data/refs.js la página del PDF del libro en la que aparece cada cita.

Uso: python3 -I tools/pdfpages.py [--impresas <book.json>] [--sin-discos] <refs.js|-> <libro.pdf>[=<libro.epub>] [<libro2.pdf>[=<libro2.epub>]]

Con `-` en lugar de refs.js (Scaruffi) no hay citas que situar; --sin-discos no genera pages.js.

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

Genera por último data/mentions.js (`window.<ESPACIO>_MENTIONS = {"artista": [[libro, página,
página impresa o null, fragmento], …]}`), los pasajes del libro que nombran a cada artista de los
discos, para la pestaña Menciones. El nombre completo se busca respetando mayúsculas («The X»
exige el artículo: The/los/las); un dúo «A & B» o «A and B» de nombres de dos palabras busca a
cada uno. El apellido solo («Parker») cuenta si el nombre completo salió en las páginas
anteriores (SURNAME_PAGES) y no va pegado a otro nombre propio; si varios artistas comparten
apellido, es del último nombrado. Un nombre de una sola palabra («Can», «Love») no cuenta pegado a otra
palabra en mayúscula ni seguido de apóstrofo. Se quitan las cabeceras y pies repetidos y se descartan
las páginas de índice (fragmentos con muchas cifras).
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
  if (/(yt|refs|covers|pages|mentions|best)\.js$/.test(m[1])) continue;
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


SURNAME_PAGES = 4   # páginas en las que un apellido solo sigue refiriéndose al último nombrado
CONTEXT = 150       # caracteres de contexto a cada lado del nombre en cada fragmento
ARTICLE = re.compile(r'(?i)(the|los|las)\s+(.+)')


def clean(page):
    """Texto de una página en una línea: une las palabras partidas con guion al final de línea."""
    return re.sub(r'\s+', ' ', re.sub(r'(\w)-\n\s*(\w)', r'\1\2', page)).strip()


def running_lines(raw):
    """Cabeceras y pies de página: líneas que se repiten en muchas páginas."""
    count = {}
    for page in raw:
        lines = [l.strip() for l in page.splitlines() if l.strip()]
        for l in set(lines[:2] + lines[-2:]):
            count[l] = count.get(l, 0) + 1
    return {l for l, n in count.items() if n >= max(5, len(raw) // 5)}


def standalone(text, s, e, prev_ok=False, common=False):
    """Un nombre de una palabra no cuenta pegado a otra en mayúscula («Free Speech», «I Can't»);
    si además es una palabra corriente del libro («However»), tampoco a principio de frase."""
    if re.match(r"['’]\w", text[e:e + 2]) or re.match(r' [A-ZÁÉÍÓÚÑ]', text[e:e + 2]):
        return False
    if prev_ok:
        return True
    prev = (text[:s].rstrip().split(' ')[-1:] or [''])[0]
    if not prev or re.search(r'[.:;!?»”"•]$', prev):
        return not common
    return not prev[:1].isupper()


def person_names(a):
    """Los nombres que se buscan para un artista de los datos."""
    a = BAND.sub('', a.strip())
    parts = re.split(r'\s+(?:&|and|y|with|con|feat\.?|featuring)\s+', a)
    if len(parts) > 1 and all(len(x.split()) >= 2 for x in parts):
        return parts
    m = ARTICLE.match(a)
    return [a] if len((m.group(2) if m else a).strip()) >= 2 and a.lower() not in ('the', 'los', 'las') else []


def name_regex(n):
    m = ARTICLE.match(n)
    body = r'\s+'.join(map(re.escape, (m.group(2) if m else n).split()))
    pre = r'(?:[Tt]he|[Ll]os|[Ll]as)\s+' if m else ''
    return re.compile(r'(?<![\w])' + pre + body + r'(?![\w])')


def artist_mentions(artists, books_raw, printed=None):
    """Pasajes que nombran a cada artista: {artista: [[libro, pdf, impresa, fragmento], …]}."""
    artists = [a for a in artists if person_names(a)]
    full = {a: [name_regex(n) for n in person_names(a)] for a in artists}
    probe = {a: [n.split()[-1] for n in person_names(a)] for a in artists}
    by_surname = {}
    for a in artists:
        if len(person_names(a)) > 1:
            continue          # los dúos solo cuentan con los dos nombres completos en la página
        for n in person_names(a):
            w = n.split()
            if len(w) >= 2 and len(w[-1]) >= 4 and w[-1][0].isupper() and not ARTICLE.match(n) and not any(c.isdigit() for c in w[-1]):
                by_surname.setdefault(w[-1], set()).add(a)
    sur_re = {w: re.compile(r'(?<![\w])' + re.escape(w) + r'(?![\w])') for w in by_surname}
    single = {a for a in artists if len(person_names(a)) == 1 and len((ARTICLE.match(person_names(a)[0]) or [None, person_names(a)[0]])[1].split()) == 1}
    out = {}
    for b, raw in enumerate(books_raw):
        last = {}
        drop = running_lines(raw)
        lower = set(re.findall(r'(?<![\w])[a-záéíóúñ]+(?![\w])', '\n'.join(raw)))
        for i, page in enumerate(raw):
            text = clean('\n'.join(l for l in page.splitlines() if l.strip() not in drop))
            hits, taken = {}, []
            for a in artists:
                if not any(w in text for w in probe[a]):
                    continue
                found = [[(m.start(), m.end()) for m in rx.finditer(text)
                          if a not in single or standalone(text, m.start(), m.end(), prev_ok=bool(ARTICLE.match(a)),
                                                           common=a.lower() in lower)] for rx in full[a]]
                if not all(found):
                    continue
                for f in found:
                    hits.setdefault(a, []).extend(f)
                    taken.extend(f)
                if a in hits:
                    last[a] = i
            for w, owners in by_surname.items():
                if w not in text:
                    continue
                for m in sur_re[w].finditer(text):
                    if any(s <= m.start() < e for s, e in taken):
                        continue
                    if not standalone(text, m.start(), m.end()):
                        continue      # pegado a otro nombre propio: «Evan Parker», «Beach Boys»
                    near = [(last[a], a) for a in owners if a in last and i - last[a] <= SURNAME_PAGES]
                    if near:
                        hits.setdefault(max(near)[1], []).append((m.start(), m.end()))
            for a, spans in hits.items():
                spans.sort()
                groups = [[*spans[0]]]
                for s, e in spans[1:]:
                    if s - groups[-1][1] < CONTEXT * 2:
                        groups[-1][1] = e
                    else:
                        groups.append([s, e])
                for s, e in groups:
                    a0, a1 = max(0, s - CONTEXT), min(len(text), e + CONTEXT)
                    if a0:
                        a0 = text.find(' ', a0) + 1
                    if a1 < len(text):
                        a1 = text.rfind(' ', 0, a1)
                    frag = ('…' if a0 else '') + text[a0:a1] + ('…' if a1 < len(text) else '')
                    if sum(c.isdigit() for c in frag) > len(frag) * 0.08:
                        continue      # índice onomástico, discografía en lista…
                    pr = printed(i, letters(text[:s])) if printed else None
                    out.setdefault(a, []).append([b + 1, i + 1, pr, frag])
    return out


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
    book_json, discs = None, True
    while args[0].startswith('--'):
        if args[0] == '--impresas':
            book_json = args.pop(1)
        elif args[0] == '--sin-discos':
            discs = False
        args.pop(0)
    refs_js, *pdfs = args
    out_dir = Path('data') if refs_js == '-' else Path(refs_js).parent
    books, wordpages, quotedpages, books_raw = [], [], [], []
    for arg in pdfs:
        pdf, _, epub = arg.partition('=')
        pdf = Path(pdf)
        if not pdf.exists():
            if not epub:
                sys.exit(f'No existe {pdf}')
            print(f'Generando {pdf} desde {epub}…')
            subprocess.run(['ebook-convert', epub, str(pdf), *CONVERT], check=True, capture_output=True)
        raw = pdftext(pdf)
        books_raw.append(raw)
        books.append(pages(raw))
        wordpages.append([words(pg) for pg in raw])
        quotedpages.append([quoted(pg) for pg in raw])
    if refs_js != '-':
        place_quotes(Path(refs_js), books)
    dump = json.loads(subprocess.run(['node', '-e', DUMP], capture_output=True, text=True, check=True).stdout)
    printed = where = None
    if book_json:
        flat, starts = books[0]
        marks = printed_marks(book_json, flat)
        pos = [m[0] for m in marks]
        print(f'{len(marks)} comienzos de página impresa situados en el PDF')

        def printed(i, before):
            # Página impresa del punto de la página i del PDF precedido por las letras `before`.
            j = bisect.bisect_right(pos, starts[i] + len(before)) - 1
            return marks[j][1] if j >= 0 else None

        def where(b, i, tk):
            # Primera aparición del título en la página i.
            text = wordpages[b][i]
            return printed(i, letters(text[:text.index(tk)]))
    if discs:
        found = mentions(dump['tracks'], wordpages, quotedpages, where)
        (out_dir / 'pages.js').write_text(
            '// Generado por tools/pdfpages.py — no editar a mano.\n'
            f"window.{dump['ns']}_PAGES = {json.dumps(found, ensure_ascii=False, separators=(',', ':'))};\n")
        print(f"{len(found)} de {len(dump['tracks'])} discos con páginas en el PDF")
    artists = sorted({t['a'] for t in dump['tracks']})
    ment = artist_mentions(artists, books_raw, printed)
    (out_dir / 'mentions.js').write_text(
        '// Generado por tools/pdfpages.py — no editar a mano.\n'
        f"window.{dump['ns']}_MENTIONS = {json.dumps(ment, ensure_ascii=False, separators=(',', ':'))};\n")
    print(f"{len(ment)} de {len(artists)} artistas con menciones en el libro ({sum(map(len, ment.values()))} pasajes)")


def place_quotes(p, books):
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


if __name__ == '__main__':
    main(*sys.argv[1:])
