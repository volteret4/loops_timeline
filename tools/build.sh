#!/bin/sh
# Enlaza data/NN-*.js en index.html y regenera data/refs.js.
# Uso: tools/build.sh <dir_txt_loops1> <spine_loops1> [<dir_txt_loops2> <spine_loops2>]
set -e
cd "$(dirname "$0")/.."
tags=$(for f in data/[0-9]*.js; do printf '<script src="%s"></script>\\n' "$f"; done)
python3 -I - "$tags" <<'PY'
import re, sys
p = 'index.html'
s = open(p).read()
block = '<!-- capitulos:inicio -->\n' + sys.argv[1].replace('\\n', '\n') + '<!-- capitulos:fin -->'
s = re.sub(r'<!-- capitulos:inicio -->.*?<!-- capitulos:fin -->', block, s, flags=re.S)
open(p, 'w').write(s)
PY
python3 -I tools/refs.py data "$@"
python3 -I tools/yt.py data | grep -v "^OK  " || true
for f in data/*.js app.js; do node --check "$f"; done
