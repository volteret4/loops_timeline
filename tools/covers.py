#!/usr/bin/env python3
"""Portadas, fotos e información de Last.fm, Deezer y Wikidata para la pestaña «Portadas».

Uso (desde la carpeta del libro): python3 -I tools/covers.py [--retry]

Es el mismo fichero en todas las webs de Music_Books. Lee los discos y canciones
cargando con node los <script src="data/…"> de index.html (el espacio de nombres
se detecta solo: el objeto global con `genres`) y, para cada uno:
  - portada e información: Last.fm album.getInfo (y track.getInfo si no es un
    álbum o no tiene portada), con Deezer como respaldo de la portada;
  - para cada artista: biografía de Last.fm (en español si existe; si no, en
    inglés), su elemento de Wikidata (por el MBID de MusicBrainz o, si no, por
    el nombre), sus identificadores en servicios externos, su foto de Wikimedia
    Commons (o de Deezer) y sus artículos de Wikipedia.

Necesita la variable de entorno LASTFM_API_KEY. Todo lo consultado se guarda en
la base SQLite común ../music.db (tablas `release` y `artist`, clave = nombre en
minúsculas; otra ruta con MUSIC_DB), así que cada libro nuevo solo consulta lo que
ningún otro libro trajo ya (--retry repite lo que no se encontró). Genera
data/covers.js como window.<ESPACIO>_COVERS con lo que usa este libro.
"""
import html
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

UA = 'MusicBooks/1.0 (static book timelines; https://github.com/)'
KEY = os.environ.get('LASTFM_API_KEY', '')
# Base común a todas las webs de Music_Books (los libros comparten muchos artistas y discos).
DB = Path(os.environ.get('MUSIC_DB') or Path(__file__).resolve().parents[2] / 'music.db')
NOIMG = '2a96cbd8b46e442fc41c2b86b821562f'      # estrella gris de Last.fm (sin imagen)
VARIOUS = re.compile(r'^(varios|various( artists)?|vv\.? ?aa\.?|v\.a\.)$', re.I)
# Identificadores de Wikidata que la web convierte en iconos (ver PROPS en covers.js).
PROPS = ['P856', 'P1902', 'P2850', 'P2722', 'P4576', 'P3283', 'P3040', 'P2397', 'P1953', 'P434',
         'P1728', 'P3192', 'P5404', 'P2373', 'P3478', 'P2013', 'P2003', 'P2002', 'P7085', 'P345']

# Volcado de los discos: carga los scripts de datos de index.html en node.
DUMP = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script src="(data\/[^"]+)"/g)) {
  if (/(yt|refs|covers)\.js$/.test(m[1])) continue;
  vm.runInContext(fs.readFileSync(m[1], 'utf8'), ctx);
}
const ns = Object.keys(ctx).find((k) => ctx[k] && ctx[k].genres && typeof ctx[k].genres.values === 'function'); // otro «realm»: sin instanceof
const tracks = new Map();
for (const g of ctx[ns].genres.values()) for (const t of g.tracks) {
  const k = t.a + '|' + t.t;
  if (!tracks.has(k)) tracks.set(k, { a: t.a, t: t.t, k: t.k || '' });
}
console.log(JSON.stringify({ ns, tracks: [...tracks.values()] }));
"""


class Rate:
    """Limita las peticiones por segundo a un servicio (compartido entre hilos)."""
    def __init__(self, per_sec):
        self.gap, self.next, self.lock = 1 / per_sec, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            self.next = max(self.next, now) + self.gap
            delay = self.next - self.gap - now
        if delay > 0:
            time.sleep(delay)


RATES = {'lastfm': Rate(5), 'deezer': Rate(8), 'wikidata': Rate(3)}


def get(url, service, data=None):
    for attempt in range(4):
        RATES[service].wait()
        req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': 'application/json'})
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


def lastfm(method, **params):
    q = urllib.parse.urlencode({'method': method, 'api_key': KEY, 'format': 'json', 'autocorrect': 1, **params})
    d = get('https://ws.audioscrobbler.com/2.0/?' + q, 'lastfm')
    return None if not d or 'error' in d else d


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\([^)]*\)|\[[^]]*\]', ' ', s)
    s = re.sub(r'^the |&| and ', ' ', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def clean_title(t):
    return re.sub(r'\s+', ' ', re.sub(r'\([^)]*\)', ' ', t)).strip()


def text(wiki):
    """Resumen de Last.fm sin el enlace final «Read more on Last.fm» ni etiquetas HTML."""
    s = re.sub(r'<a [^>]*>.*?</a>\.?', '', wiki or '', flags=re.S)
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
    s = re.sub(r'User-contributed text is available.*$', '', s, flags=re.S).strip()
    if len(s) > 1400:
        s = s[:1400].rsplit(' ', 1)[0] + '…'
    return s


def image(imgs):
    url = (imgs or [{}])[-1].get('#text', '')
    return '' if not url or NOIMG in url else url


def tags(d):
    t = (d.get('tags') or d.get('toptags') or {})
    t = t.get('tag', []) if isinstance(t, dict) else []
    return [x['name'] for x in (t if isinstance(t, list) else [t])][:6]


def wiki_es_en(method, d, field, **params):
    """Texto de Last.fm en español si existe; si no, el inglés de `d` (pedido sin idioma).
    Solo se hace la segunda consulta cuando hay texto: la mayoría de discos no tienen."""
    en = text((d.get(field) or {}).get('summary', ''))
    if not en:
        return '', ''
    es = lastfm(method, lang='es', **params)
    root = (es or {}).get(method.split('.')[0], {})
    es = text((root.get(field) or {}).get('summary', ''))
    return (es, 'es') if es and es != en else (en, 'en')


# ---------- Discos y canciones ----------
def deezer_cover(a, t, kind):
    for what in (['album', 'track'] if kind != 's' else ['track', 'album']):
        q = f'artist:"{a}" {what}:"{clean_title(t)}"' if a else clean_title(t)
        d = get('https://api.deezer.com/search/' + what + '?' + urllib.parse.urlencode({'q': q, 'limit': 5}), 'deezer')
        for hit in (d or {}).get('data', []):
            al = hit if what == 'album' else hit.get('album', {})
            name = hit.get('title', '')
            if a and norm(hit.get('artist', {}).get('name', '')) != norm(a):
                continue
            if norm(name).startswith(norm(clean_title(t))) or norm(clean_title(t)) in norm(name):
                if al.get('cover_xl'):
                    return {'img': al['cover_xl'], 'src': 'deezer', 'dz': hit.get('link', '')}
    return None


def release(a, t, kind):
    artist = 'Various Artists' if VARIOUS.match(a) else a
    rec = None
    titles = list(dict.fromkeys([t, clean_title(t)]))
    if kind != 's':
        for title in titles:
            d = lastfm('album.getinfo', artist=artist, album=title)
            if d and image(d['album'].get('image')):
                al = d['album']
                wiki, lang = wiki_es_en('album.getinfo', al, 'wiki', artist=artist, album=title)
                rec = {'kind': 'album', 'img': image(al.get('image')), 'src': 'lastfm', 'url': al.get('url', ''),
                       'lis': int(al.get('listeners') or 0), 'tags': tags(al), 'wiki': wiki, 'lang': lang}
                break
    if not rec and kind != 'a':
        for title in titles:
            d = lastfm('track.getinfo', artist=artist, track=title)
            if not d:
                continue
            tr = d['track']
            al = tr.get('album') or {}
            wiki, lang = wiki_es_en('track.getinfo', tr, 'wiki', artist=artist, track=title)
            rec = {'kind': 'track', 'img': image(al.get('image')), 'src': 'lastfm', 'url': tr.get('url', ''),
                   'album': al.get('title', ''), 'lis': int(tr.get('listeners') or 0), 'tags': tags(tr),
                   'wiki': wiki, 'lang': lang}
            break
    if not rec or not rec['img']:
        dz = deezer_cover('' if VARIOUS.match(a) else a, t, kind)
        if dz:
            rec = {**(rec or {'kind': 'album' if kind == 'a' else 'track' if kind == 's' else ''}), **dz}
    return rec or {'miss': 1}


# ---------- Artistas ----------
def artist_lastfm(name):
    d = lastfm('artist.getinfo', artist=name)
    if not d:
        return {'miss': 1}
    ar = d['artist']
    bio, lang = wiki_es_en('artist.getinfo', ar, 'bio', artist=name)
    return {'name': ar.get('name', name), 'mbid': ar.get('mbid', ''), 'url': ar.get('url', ''),
            'lis': int((ar.get('stats') or {}).get('listeners') or 0), 'tags': tags(ar), 'bio': bio, 'lang': lang}


def sparql(query):
    d = get('https://query.wikidata.org/sparql', 'wikidata',
            data=urllib.parse.urlencode({'query': query, 'format': 'json'}).encode())
    return (d or {}).get('results', {}).get('bindings', [])


def lit(s):
    return json.dumps(s, ensure_ascii=False)


def wikidata_ids(artists):
    """Nombre → Qid: primero por el MBID de Last.fm; si no, por la etiqueta (con MBID en Wikidata)."""
    found = {}
    by_mbid = {r['mbid']: n for n, r in artists.items() if r.get('mbid')}
    mb = list(by_mbid)
    for i in range(0, len(mb), 150):
        rows = sparql('SELECT ?item ?mb WHERE { VALUES ?mb { %s } ?item wdt:P434 ?mb . }' % ' '.join(map(lit, mb[i:i + 150])))
        for r in rows:
            found.setdefault(by_mbid[r['mb']['value']], r['item']['value'].rsplit('/', 1)[1])
    rest = [n for n in artists if n not in found and not VARIOUS.match(n)]
    for i in range(0, len(rest), 60):
        chunk = rest[i:i + 60]
        labels = set()
        for n in chunk:
            labels.update({n, artists[n].get('name') or n})
        rows = sparql('SELECT ?item ?l ?n WHERE { VALUES ?l { %s } ?item rdfs:label ?l ; wdt:P434 [] ; wikibase:sitelinks ?n . }'
                      % ' '.join(lit(l) + '@en' for l in labels))
        best = {}
        for r in rows:
            l, n = r['l']['value'], int(r['n']['value'])
            if n > best.get(l, (None, -1))[1]:
                best[l] = (r['item']['value'].rsplit('/', 1)[1], n)
        for n in chunk:
            hit = best.get(n) or best.get(artists[n].get('name') or n)
            if hit:
                found[n] = hit[0]
    return found


def wikidata_entities(qids):
    out = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 50):
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(qids[i:i + 50]), 'props': 'claims|sitelinks/urls',
                                    'sitefilter': 'eswiki|enwiki', 'format': 'json'})
        d = get('https://www.wikidata.org/w/api.php?' + q, 'wikidata') or {}
        for qid, e in d.get('entities', {}).items():
            links = {}
            for p in PROPS + ['P18']:
                for c in e.get('claims', {}).get(p, []):
                    v = c['mainsnak'].get('datavalue', {}).get('value')
                    if isinstance(v, str):
                        links[p] = v
                        if c.get('rank') == 'preferred':
                            break
            wp = {k[:2]: s['url'] for k, s in e.get('sitelinks', {}).items()}
            out[qid] = {'links': links, 'wp': wp}
    return out


def deezer_artist(name):
    d = get('https://api.deezer.com/search/artist?' + urllib.parse.urlencode({'q': name, 'limit': 5}), 'deezer')
    for hit in (d or {}).get('data', []):
        pic = hit.get('picture_xl', '')
        if norm(hit.get('name', '')) == norm(name) and pic and '/artist//' not in pic:
            return pic
    return ''


class Store:
    """Una tabla de music.db: clave normalizada → registro JSON. Se carga entera al empezar."""
    def __init__(self, con, table):
        con.execute(f'CREATE TABLE IF NOT EXISTS {table} (key TEXT PRIMARY KEY, name TEXT NOT NULL, '
                    'data TEXT NOT NULL, updated TEXT NOT NULL)')
        self.con, self.table, self.dirty = con, table, {}
        self.rows = {k: json.loads(d) for k, d in con.execute(f'SELECT key, data FROM {table}')}

    def get(self, name):
        return self.rows.get(dbkey(name))

    def put(self, name, rec):
        self.rows[dbkey(name)] = rec
        self.dirty[dbkey(name)] = name

    def flush(self):
        rows = [(k, n, json.dumps(self.rows[k], ensure_ascii=False, sort_keys=True), time.strftime('%Y-%m-%d'))
                for k, n in list(self.dirty.items())]
        self.con.executemany(f'INSERT OR REPLACE INTO {self.table} VALUES (?, ?, ?, ?)', rows)
        self.con.commit()
        for k, *_ in rows:
            self.dirty.pop(k, None)


def dbkey(name):
    """Misma clave para «Van der Graaf Generator» y «Van Der Graaf  Generator» en libros distintos."""
    return re.sub(r'\s+', ' ', name).strip().lower()


def main(*flags):
    if not KEY:
        sys.exit('Falta la variable de entorno LASTFM_API_KEY')
    dump = json.loads(subprocess.run(['node', '-e', DUMP], capture_output=True, text=True, check=True).stdout)
    ns, tracks = dump['ns'], dump['tracks']
    con = sqlite3.connect(DB, check_same_thread=False, timeout=300)   # otro libro puede estar escribiendo a la vez
    R, A = Store(con, 'release'), Store(con, 'artist')
    lock = threading.Lock()

    def save():
        with lock:
            R.flush()
            A.flush()

    # Caché antigua por libro (data/covers.json): se pasa a la base común y se borra.
    old = Path('data/covers.json')
    if old.exists():
        o = json.loads(old.read_text())
        for k, v in o.get('r', {}).items():
            R.get(k) or R.put(k, v)
        for k, v in o.get('a', {}).items():
            A.get(k) or A.put(k, v)
        save()
        old.unlink()

    retry = '--retry' in flags
    key = lambda t: f"{t['a']}|{t['t']}"
    todo = [t for t in tracks if not R.get(key(t)) or (retry and 'miss' in R.get(key(t)))]
    print(f'{ns}: {len(tracks)} discos, {len(todo)} no están en {DB.name}', flush=True)

    def do_release(i_t):
        i, t = i_t
        R.put(key(t), release(t['a'], t['t'], t['k']))
        if i % 100 == 99:
            save()
            print(f'  discos {i + 1}/{len(todo)}', flush=True)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(do_release, enumerate(todo)))
    save()

    names = sorted({t['a'] for t in tracks if not VARIOUS.match(t['a'])})
    todo = [n for n in names if not A.get(n) or (retry and 'miss' in A.get(n))]
    print(f'{len(names)} artistas, {len(todo)} no están en {DB.name}', flush=True)

    def do_artist(i_n):
        i, n = i_n
        A.put(n, artist_lastfm(n))
        if i % 100 == 99:
            save()
            print(f'  artistas {i + 1}/{len(todo)}', flush=True)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(do_artist, enumerate(todo)))
    save()

    # Wikidata y fotos: solo para los artistas que aún no se han resuelto.
    pending = {n: A.get(n) for n in names if 'wd' not in A.get(n) or (retry and not A.get(n)['wd'])}
    if pending:
        print(f'Wikidata para {len(pending)} artistas', flush=True)
        qids = wikidata_ids(pending)
        ents = wikidata_entities(qids.values())
        for n, rec in pending.items():
            q = qids.get(n, '')
            e = ents.get(q, {'links': {}, 'wp': {}})
            rec.update({'wd': q, 'links': {k: v for k, v in e['links'].items() if k != 'P18'}, 'wp': e['wp']})
            p18 = e['links'].get('P18')
            rec['img'] = ('https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(p18.replace(' ', '_')) + '?width=500') if p18 else ''
            rec['isrc'] = 'commons' if p18 else ''
            A.put(n, rec)
        save()
        no_photo = [n for n, r in pending.items() if not r['img']]
        print(f'Fotos de Deezer para {len(no_photo)} artistas', flush=True)

        def do_photo(n):
            pic = deezer_artist(n)
            if pic:
                A.put(n, {**pending[n], 'img': pic, 'isrc': 'deezer'})
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(do_photo, no_photo))
        save()

    # Para la web: solo lo que usa este libro, con sus claves exactas y sin campos vacíos.
    keep = lambda d: {k: v for k, v in d.items() if v not in ('', [], {}, 0, None) and k not in ('miss', 'mbid')}
    web = {'r': {key(t): keep(R.get(key(t))) for t in tracks if 'miss' not in R.get(key(t))},
           'a': {n: keep(A.get(n)) for n in names if 'miss' not in A.get(n) or A.get(n).get('wd') or A.get(n).get('img')}}
    Path('data/covers.js').write_text(f'// Generado por tools/covers.py a partir de {DB.name} — no editar a mano.\nwindow.{ns}_COVERS = '
                                      + json.dumps(web, ensure_ascii=False, separators=(',', ':')) + ';\n')
    n_img = sum(1 for v in web['r'].values() if v.get('img'))
    n_pic = sum(1 for v in web['a'].values() if v.get('img'))
    n_wd = sum(1 for v in web['a'].values() if v.get('wd'))
    print(f'Portadas: {n_img}/{len(tracks)} · artistas con foto: {n_pic}/{len(names)} · en Wikidata: {n_wd}/{len(names)}')
    print(f'{DB}: {len(R.rows)} discos y {len(A.rows)} artistas en total')


if __name__ == '__main__':
    main(*sys.argv[1:])
