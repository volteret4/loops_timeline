#!/usr/bin/env python3
"""Añade a data/refs.js la página del PDF del libro en la que aparece cada cita.

Uso: python3 -I tools/pdfpages.py <refs.js> <libro.pdf>[=<libro.epub>] [<libro2.pdf>[=<libro2.epub>]]

Si el PDF no existe y se indica el ePub, lo genera con Calibre (ebook-convert),
en A5 y sin números de página impresos, para que la página que muestra el visor
sea la que enlaza la web (`libro.pdf#page=N`). Busca cada cita en el texto de
cada página (pdftotext), comparando solo letras, y guarda la página en `pdf`.
Con dos PDF (Loops 1 y 2), el libro de cada cita es `book` de refs.js (1 o 2).
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


def letters(s):
    s = unicodedata.normalize('NFKD', s.lower())
    return ''.join(c for c in s if c.isalpha())


def pages(pdf):
    """Texto de todo el PDF en letras y el desplazamiento donde empieza cada página."""
    text = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True, check=True).stdout
    starts, parts, n = [], [], 0
    for page in text.split('\f'):
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


def main(refs_js, *pdfs):
    books = []
    for arg in pdfs:
        pdf, _, epub = arg.partition('=')
        pdf = Path(pdf)
        if not pdf.exists():
            if not epub:
                sys.exit(f'No existe {pdf}')
            print(f'Generando {pdf} desde {epub}…')
            subprocess.run(['ebook-convert', epub, str(pdf), *CONVERT], check=True, capture_output=True)
        books.append(pages(pdf))
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


if __name__ == '__main__':
    main(*sys.argv[1:])
