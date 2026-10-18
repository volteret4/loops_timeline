#!/usr/bin/env python3
"""Discografía de cada artista (álbumes de MusicBrainz) para la pestaña «Menciones».

Uso (desde la carpeta del libro): python3 -I tools/discos.py [--retry]

Es el mismo fichero en todas las webs de Music_Books. Para cada artista de los discos del libro
(leídos con node desde los <script src="data/…"> de index.html) pide a MusicBrainz sus grupos de
publicación de tipo álbum, con el año de la primera edición. El artista se identifica por su MBID,
el que guardó tools/covers.py en music.db (de Wikidata o de Last.fm; se acepta el primero cuyo
nombre en MusicBrainz coincide con el del libro) o, si no hay, buscándolo por el nombre.
MusicBrainz admite una consulta por segundo: unos mil artistas tardan unos veinte minutos.

Todo se guarda en la tabla `discog` de la base común ../music.db (clave = nombre en minúsculas),
con todos los álbumes y sus tipos secundarios, así que cada libro nuevo solo consulta los artistas
que ningún otro trajo (--retry repite los no encontrados y los que quedaron sin álbumes). Genera data/discos.js como
window.<ESPACIO>_DISCOS = {"artista": [[título, año], …]} con los álbumes de estudio y bandas
sonoras (sin recopilatorios, directos, remezclas…) de los artistas de este libro. Como MusicBrainz
no marca como recopilatorio muchas reediciones de músicos anteriores al LP, se quitan también los
títulos de recopilatorio («Best of», «Essential»…) y los álbumes posteriores a la muerte del artista
o la disolución del grupo (P570/P576 de Wikidata, guardados en `end` del registro de discog).
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = 'MusicBooks/1.0 (static book timelines; https://github.com/)'
DB = Path(os.environ.get('MUSIC_DB') or Path(__file__).resolve().parents[2] / 'music.db')
API = 'https://musicbrainz.org/ws/2/'
PAGES = 5                    # como mucho 500 álbumes por artista
COMPILATION = re.compile(r'\b(best of|greatest|essentials?|collection|anthology|the complete|very best|'
                         r'definitive|gold|retrospective|hits|masters of|portrait of|the story of|the legendary|'
                         r'classic recordings|the immortal|in memoriam)\b', re.I)
# Tipos secundarios que no cuentan como discos propios en el timeline.
SKIP = {'Compilation', 'Live', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview',
        'Audiobook', 'Spokenword', 'Audio drama', 'Field recording'}

DUMP = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script src="(data\/[^"]+)"/g)) {
  if (/^data\/(yt|refs|covers|pages|mentions|discos|best)\.js$/.test(m[1])) continue;
  vm.runInContext(fs.readFileSync(m[1], 'utf8'), ctx);
}
const ns = Object.keys(ctx).find((k) => ctx[k] && ctx[k].genres && typeof ctx[k].genres.values === 'function');
const artists = new Set();
for (const g of ctx[ns].genres.values()) for (const t of g.tracks) artists.add(t.a);
console.log(JSON.stringify({ ns, artists: [...artists] }));
"""

_last = [0.0]


def get(path, **params):
    """Una consulta a MusicBrainz, respetando su límite de una por segundo."""
    url = API + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    for attempt in range(4):
        time.sleep(max(0.0, _last[0] + 1.05 - time.monotonic()))
        _last[0] = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(3 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError):
            time.sleep(3 * (attempt + 1))
    return None


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'^(the|los|las) ', '', s)
    s = re.sub(r'&| and | y ', ' ', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def dbkey(name):
    return re.sub(r'\s+', ' ', name).strip().lower()


def albums(mbid):
    """Los álbumes de un artista y el nombre con el que MusicBrainz lo acredita."""
    out, name = [], None
    for page in range(PAGES):
        d = get('release-group', artist=mbid, type='album', limit=100, offset=100 * page, inc='artist-credits')
        if not d:
            return None, None
        for rg in d.get('release-groups', []):
            for c in rg.get('artist-credit', []):
                if isinstance(c, dict) and c.get('artist', {}).get('id') == mbid:
                    name = name or c['artist'].get('name')
            y = (rg.get('first-release-date') or '')[:4]
            out.append([rg.get('title', ''), int(y) if y.isdigit() else None, ','.join(rg.get('secondary-types') or [])])
        if 100 * (page + 1) >= d.get('release-group-count', 0):
            break
    return out, name


def candidates(rec):
    """MBID del artista según Wikidata y según Last.fm (pueden no coincidir)."""
    rec = rec or {}
    ids = [(rec.get('links') or {}).get('P434'), rec.get('mbid')]
    return [i for i in dict.fromkeys(ids) if i]


def search(name):
    d = get('artist', query=f'artist:"{name}"', limit=5)
    return [a['id'] for a in (d or {}).get('artists', []) if a.get('score', 0) >= 90 and norm(a.get('name', '')) == norm(name)]


def lookup(name, rec):
    tried, empty = set(), None
    for source in (lambda: candidates(rec), lambda: search(name)):
        for mbid in source():
            if mbid in tried:
                continue
            tried.add(mbid)
            al, credited = albums(mbid)
            if al is None:
                continue
            if credited is not None and norm(credited) == norm(name):
                return {'mbid': mbid, 'name': credited, 'albums': al}
            # Sin álbumes no se puede comprobar el nombre: solo vale si ningún otro candidato da más.
            if credited is None and empty is None:
                empty = {'mbid': mbid, 'name': name, 'albums': []}
    return empty or {'none': 1}


def end_years(qids):
    """Año de muerte (P570) o de disolución (P576) de cada elemento de Wikidata; 0 si no tiene."""
    out = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 200):
        vals = ' '.join('wd:' + q for q in qids[i:i + 200])
        query = (f'SELECT ?i (MIN(YEAR(?d)) AS ?y) WHERE {{ VALUES ?i {{ {vals} }} '
                 'OPTIONAL { { ?i wdt:P570 ?d } UNION { ?i wdt:P576 ?d } } } GROUP BY ?i')
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                rows = json.loads(r.read().decode())['results']['bindings']
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError, KeyError):
            continue
        for b in rows:
            q = b['i']['value'].rsplit('/', 1)[-1]
            out[q] = int(b['y']['value']) if 'y' in b else 0
        time.sleep(1)
    return out


def main(*flags):
    dump = json.loads(subprocess.run(['node', '-e', DUMP], capture_output=True, text=True, check=True).stdout)
    ns, artists = dump['ns'], sorted(dump['artists'])
    con = sqlite3.connect(DB, timeout=300)   # otro libro puede estar escribiendo a la vez
    con.execute('CREATE TABLE IF NOT EXISTS discog (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL)')
    have = {k: json.loads(d) for k, d in con.execute('SELECT key, data FROM discog')}
    known = {k: json.loads(d) for k, d in con.execute('SELECT key, data FROM artist')}
    retry = lambda r: r.get('none') or not r.get('albums')
    todo = [a for a in artists if dbkey(a) not in have or ('--retry' in flags and retry(have[dbkey(a)]))]
    print(f'{ns}: {len(artists)} artistas, {len(todo)} no están en music.db (≈{len(todo) * 1.3 / 60:.0f} min)')
    for i, a in enumerate(todo, 1):
        rec = lookup(a, known.get(dbkey(a)))
        have[dbkey(a)] = rec
        con.execute('INSERT OR REPLACE INTO discog VALUES (?, ?, ?, ?)',
                    (dbkey(a), a, json.dumps(rec, ensure_ascii=False), time.strftime('%Y-%m-%d')))
        if i % 25 == 0:
            con.commit()
            print(f'  artistas {i}/{len(todo)}', flush=True)
    con.commit()
    # Fin de cada artista (muerte o disolución), una sola vez por artista.
    need = {a: known[dbkey(a)]['wd'] for a in artists
            if 'end' not in (have.get(dbkey(a)) or {'end': 0}) and (known.get(dbkey(a)) or {}).get('wd')}
    if need:
        ends = end_years(need.values())
        for a, q in need.items():
            if q in ends:
                have[dbkey(a)]['end'] = ends[q]
                con.execute('UPDATE discog SET data = ? WHERE key = ?', (json.dumps(have[dbkey(a)], ensure_ascii=False), dbkey(a)))
        con.commit()
    out = {}
    for a in artists:
        rec = have.get(dbkey(a)) or {}
        seen, rows, end = set(), [], rec.get('end') or 9999
        for t, y, sec in sorted(rec.get('albums', []), key=lambda r: (r[1] or 9999, r[0])):
            if not y or y > end + 1 or set(filter(None, sec.split(','))) & SKIP or COMPILATION.search(t) or norm(t) in seen:
                continue
            seen.add(norm(t))
            rows.append([t, y])
        if rows:
            out[a] = rows
    Path('data/discos.js').write_text(
        '// Generado por tools/discos.py — no editar a mano.\n'
        f'window.{ns}_DISCOS = {json.dumps(out, ensure_ascii=False, separators=(",", ":"))};\n')
    found = sum(1 for a in artists if not (have.get(dbkey(a)) or {}).get('none'))
    print(f'Discografía: {found}/{len(artists)} artistas en MusicBrainz, {len(out)} con álbumes '
          f'({sum(map(len, out.values()))} álbumes) · {DB}: {len(have)} artistas en la tabla discog')


if __name__ == '__main__':
    main(*sys.argv[1:])
