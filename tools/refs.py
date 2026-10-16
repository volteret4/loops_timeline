#!/usr/bin/env python3
"""Localiza en el libro las citas (`q: '...'`) de los ficheros data/*.js.

Uso: python3 -I tools/refs.py <data_dir> <dir_txt_1> <spine_1> [<dir_txt_2> <spine_2>]

Un par <dir_txt> <spine> por libro (Loops 1, Loops 2): <dir_txt> contiene un
.txt por fichero del ePub (convertido con pandoc) y <spine> el orden de
lectura. Los ficheros de datos NN-*.js con NN < 30 citan Loops 1; el resto,
Loops 2 (si la cita no aparece en su libro se busca en el otro). Genera <data_dir>/refs.js con, para cada
cita: fichero, sección, posición (% del libro), página aproximada y el
párrafo literal que la contiene. Exporta también las definiciones literales
de cada «Mapa de estilos» (fichero cuader) para los géneros de data/00-mapa.js
(Loops 1) y data/30-mapa.js (Loops 2).
El ePub no trae paginación impresa: la página se estima a 300 palabras/pág.
"""
import json
import re
import sys
from pathlib import Path

WORDS_PER_PAGE = 300
HEADING = re.compile(r'^(\d+\.\s+[A-ZÁÉÍÓÚÑÜ«»“”"’\'0-9 ,.:;¡!¿?()&/-]{4,})\s*$')


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('’', "'").replace('‘', "'")).strip().lower()


def excerpt(para, nq, limit=1600):
    """El párrafo entero, o una ventana alrededor de la cita si es muy largo."""
    if len(para) <= limit:
        return para
    i = max(0, norm(para).find(nq))
    a = max(0, i - limit // 2)
    b = min(len(para), a + limit)
    a = para.rfind(' ', 0, a) + 1 if a else 0
    return ('…' if a else '') + para[a:b].rsplit(' ', 1)[0] + '…'


def book_of(js):
    return 1 if int(js.name.split('-', 1)[0]) < 30 else 2


def map_definitions(docs, total, mapa_js, book):
    name, lines, base = next(d for d in docs if d[0] == 'cuader')
    offsets, w = [], base
    for l in lines:
        offsets.append(w)
        w += len(l.split())
    paras = [(l.strip(), o) for l, o in zip(lines, offsets) if len(l.strip()) > 80]
    out = {}
    for gid, name in re.findall(r"id: '([^']+)', name: '([^']+)'", mapa_js.read_text()):
        full = name.replace("\\'", "'")
        head = re.sub(r'\s*\(.*?\)', '', full)
        for l, o in paras:
            for h in (full, head):
                if l.casefold().startswith(h.casefold() + ' '):
                    out[gid] = {'book': book, 'text': l[len(h) + 1:], 'page': o // WORDS_PER_PAGE + 1,
                                'pct': round(100 * o / total, 1)}
                    break
            if gid in out:
                break
        else:
            print('  SIN DEFINICIÓN EN EL MAPA:', gid, head)
    return out


def load_book(txt_dir, spine_file):
    txt_dir = Path(txt_dir)
    spine = [l.strip().removesuffix('.xhtml') for l in open(spine_file) if l.strip()]
    docs, total = [], 0
    for name in spine:
        p = txt_dir / f'{name}.txt'
        if not p.exists():
            continue
        lines = p.read_text().splitlines()
        docs.append((name, lines, total))
        total += sum(len(l.split()) for l in lines)
    return docs, total


def find(docs, total, nq):
    for name, lines, base in docs:
        words, section = base, None
        for line in lines:
            m = HEADING.match(line.strip())
            if m:
                section = m.group(1).strip()
            i = norm(line).find(nq)
            if i >= 0:
                w = words + len(norm(line)[:i].split())
                return {'file': name, 'sec': section, 'pct': round(100 * w / total, 1),
                        'page': w // WORDS_PER_PAGE + 1, 'para': excerpt(line.strip(), nq)}
            words += len(line.split())
    return None


def main(data_dir, *books):
    data_dir = Path(data_dir)
    books = {i + 1: load_book(t, s) for i, (t, s) in enumerate(zip(books[::2], books[1::2]))}

    quotes = {}
    for js in sorted(data_dir.glob('[0-9]*.js')):
        for q in re.findall(r"\bq:\s*'((?:[^'\\]|\\.)+)'", js.read_text()):
            quotes.setdefault(q, book_of(js))

    out, missing = {}, []
    for q, pref in sorted(quotes.items()):
        nq = norm(q.replace("\\'", "'"))
        for b in [pref] + [b for b in books if b != pref]:
            if b in books and (hit := find(*books[b], nq)):
                out[q.replace("\\'", "'")] = {'book': b, **hit}
                break
        else:
            missing.append(q)

    mapa = {}
    for b, fname in ((1, '00-mapa.js'), (2, '30-mapa.js')):
        if b in books and (data_dir / fname).exists():
            for gid, d in map_definitions(*books[b], data_dir / fname, b).items():
                mapa.setdefault(gid, []).append(d)
    (data_dir / 'refs.js').write_text(
        '// Generado por tools/refs.py — no editar a mano.\n'
        f'window.LOOPS_REFS = {json.dumps(out, ensure_ascii=False, indent=1)};\n'
        f'window.LOOPS_MAPA = {json.dumps(mapa, ensure_ascii=False, indent=1)};\n')
    print(f'{sum(len(v) for v in mapa.values())} definiciones de los mapas')
    print(f'{len(out)} citas localizadas, {len(missing)} sin encontrar')
    for q in missing:
        print('  NO ENCONTRADA:', q)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))
