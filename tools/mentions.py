#!/usr/bin/env python3
"""Lista los títulos mencionados en un capítulo que faltan en sus datos.

Uso: python3 -I tools/mentions.py <capitulo.md> <data/NN-x.js> [ignorar.txt]

Candidatos: texto entre «comillas» (canciones) y *cursivas* (álbumes, pero
también películas, libros y extranjerismos: hay que revisarlos a mano).
Un candidato se da por cubierto si aparece dentro del título de algún track
del fichero de datos (o en la lista de ignorados del propio fichero:
comentarios `// ignorar: titulo1 | titulo2`).
"""
import re
import sys
import unicodedata


def norm(s):
    s = unicodedata.normalize('NFKD', s.replace('’', "'")).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def main(md, js):
    text = open(md).read()
    data = open(js).read()
    titles = [norm(t) for t in re.findall(r"\bt:\s*'((?:[^'\\]|\\.)*)'", data)]
    ignored = [norm(x) for line in re.findall(r'//\s*ignorar:(.*)', data) for x in line.split('|')]
    have = ' | '.join(titles + ignored)
    cands = re.findall(r'«([^»]{2,90})»', text) + re.findall(r'(?<![*\w])\*([^*\n]{2,90}?)\*(?![*\w])', text)
    seen, missing = set(), []
    for c in cands:
        c = c.strip(' —-,.')
        n = norm(c)
        if not n or n in seen or len(n) < 2:
            continue
        seen.add(n)
        if n not in have:
            missing.append(c)
    for m in missing:
        print(m)
    print(f'-- {len(missing)} candidatos sin cubrir de {len(seen)}', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:3])
