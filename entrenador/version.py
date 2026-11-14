"""Pone un número de versión nuevo en los archivos de la app (para que el navegador no use copias antiguas).
Uso: python3 version.py   (desde la carpeta entrenador/)"""
import re, time, pathlib
v = time.strftime("%Y%m%d%H%M")
base = pathlib.Path(__file__).parent
for f in list(base.glob("js/*.js")) + [base / "index.html", base / "ver.html", base / "conoceme.html"]:
    t = f.read_text()
    n = re.sub(r'((?:from |import\()\s*"\./[\w-]+\.js)(\?v=\w+)?"', rf'\1?v={v}"', t)
    n = re.sub(r'((?:src|href)="(?:js/[\w-]+\.js|styles\.css))(\?v=\w+)?"', rf'\1?v={v}"', n)
    if n != t:
        f.write_text(n)
print("versión", v)
