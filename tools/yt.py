#!/usr/bin/env python3
"""Busca en YouTube cada disco/canción de data/*.js con yt-dlp.

Uso: python3 -I tools/yt.py [data_dir] [--retry]

Un track puede llevar `yq` para forzar la consulta (`yq: '-'` = sin vídeo).

Caché en <data_dir>/yt.json (clave "artista|título" → vídeo); genera
<data_dir>/yt.js para la web. Solo busca lo que no está en caché
(--retry vuelve a intentar las búsquedas fallidas; --accept da por buenas
las dudosas actuales, tras revisarlas). Las coincidencias
dudosas ya revisadas a mano se listan en tools/yt-ok.txt.
"""
import json
import re
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

S = r"'((?:[^'\\]|\\.)*)'"
TRACK = re.compile(r"\{\s*a:\s*" + S + r",\s*t:\s*" + S + r"(?:,\s*y:\s*\d+)?(?:,\s*yq:\s*" + S + r")?(?:,\s*ess:\s*1)?\s*\}")


def query(a, t):
    t = re.sub(r'\([^)]*\)', ' ', t)          # quita (BSO), (prod. …), (álbum)
    a = '' if a.lower().startswith('varios') else re.sub(r'\([^)]*\)', ' ', a)
    return re.sub(r'\s+', ' ', f'{a} {t}').strip()


def search(q):
    if q == '-':                               # sin vídeo fiable: la web enlaza a la búsqueda
        return None
    # YouTube devuelve a veces 0 resultados para una consulta exacta: variantes de respaldo
    plain = re.sub(r"[’'´]", '', q)
    for variant in dict.fromkeys([q, plain + ' audio', plain + ' song']):
        res = search_once(variant)
        if res:
            return res
    return None


def search_once(q):
    try:
        out = subprocess.run(
            ['yt-dlp', '--flat-playlist', '--no-warnings', '--print',
             '%(id)s\t%(title)s\t%(channel)s\t%(duration)s', f'ytsearch1:{q}'],
            capture_output=True, text=True, timeout=60).stdout.strip()
    except subprocess.TimeoutExpired:
        return None
    if not out:
        return None
    vid, title, channel, dur = (out.split('\t') + ['', '', ''])[:4]
    return {'id': vid, 'title': title, 'channel': channel, 'dur': dur}


def words(s):
    return {w for w in re.findall(r'\w{4,}', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower())}


def plausible(key, res):
    """Algún término del título buscado aparece en el título o canal del vídeo."""
    a, t = key.split('|', 1)
    got = words(res['title'] + ' ' + res['channel'])
    want_t = words(re.sub(r'\([^)]*\)', ' ', t))
    want_a = set() if a.lower().startswith('varios') else words(re.sub(r'\([^)]*\)', ' ', a))
    return (not want_t or bool(want_t & got)) and (not want_a or bool(want_a & got))


def main(data_dir='data', *flags):
    data_dir = Path(data_dir)
    cache_file = data_dir / 'yt.json'
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    tracks = {}
    for js in sorted(data_dir.glob('[0-9]*.js')):
        for a, t, q in TRACK.findall(js.read_text()):
            a, t, q = (x.replace("\\'", "'") for x in (a, t, q))
            k = f'{a}|{t}'
            if q or k not in tracks:              # un yq en cualquier aparición manda
                tracks[k] = q or query(a, t)
    todo = [k for k in tracks if k not in cache
            or ('--retry' in flags and cache[k] is None and tracks[k] != '-')
            or (cache[k] and cache[k].get('q', query(*k.split('|', 1))) != tracks[k])]
    print(f'{len(tracks)} discos, {len(todo)} por buscar')
    with ThreadPoolExecutor(8) as pool:
        for k, res in zip(todo, pool.map(lambda k: search(tracks[k]), todo)):
            cache[k] = res and {**res, 'q': tracks[k]}
            print(('OK  ' if res else 'NADA') + f' {tracks[k]}  →  {res["title"] if res else ""}')
    ok_file = Path(__file__).with_name('yt-ok.txt')
    accepted = set(ok_file.read_text().splitlines()) if ok_file.exists() else set()
    doubtful = [k for k in tracks if cache.get(k) and k not in accepted and not plausible(k, cache[k])]
    for k in doubtful:
        print('DUDOSO', k, '→', cache[k]['title'], '/', cache[k]['channel'])
    if '--accept' in flags and doubtful:                # tras revisarlas a mano
        with ok_file.open('a') as f:
            f.write(''.join(k + '\n' for k in doubtful))
        print(f'{len(doubtful)} aceptadas')
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True))
    (data_dir / 'yt.js').write_text(
        '// Generado por tools/yt.py — no editar a mano.\n'
        f'window.LOOPS_YT = {json.dumps({k: v for k, v in cache.items() if v}, ensure_ascii=False)};\n')


if __name__ == '__main__':
    main(*sys.argv[1:])
