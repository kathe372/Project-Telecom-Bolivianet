"""Cuenta parámetros de constructor por clase de Application. Sin trampas:
el conteo por comas se salta el último parámetro."""
import re, pathlib, sys
raiz = pathlib.Path("telecombolivianet-backend-develop/src/TelecomBoliviaNet.Application")
peores = []
for p in raiz.rglob("*.cs"):
    s = p.read_text(encoding="utf-8-sig", errors="ignore")
    for m in re.finditer(r"public\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*base[^{]*)?\{", s, re.S):
        nombre, args = m.group(1), m.group(2)
        if not re.search(r"(class|record)\s+" + re.escape(nombre) + r"\b", s):
            continue
        n = len([a for a in args.split(",") if a.strip()])
        if n > 6:
            peores.append((n, p.relative_to(raiz).as_posix()))
for n, q in sorted(peores, reverse=True):
    print(f"{n:3}  {q}")
print(f"\n{len(peores)} clases por encima del límite de 6")
