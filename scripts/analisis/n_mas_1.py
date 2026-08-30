#!/usr/bin/env python3
"""Bucles con una llamada a base de datos dentro: candidatos a N+1."""
import re
import pathlib

RAIZ = pathlib.Path("telecombolivianet-backend-develop/src")
CONS = re.compile(r"\b(foreach|for|while)\s*\(")
IO = re.compile(
    r"await\s+_\w*[Rr]epo\w*\.|\.FirstOrDefaultAsync|\.ToListAsync|"
    r"\.AnyAsync|\.CountAsync|\.SingleAsync|await\s+_db\."
)

def main():
    total = 0
    for f in sorted(RAIZ.rglob("*.cs")):
        ruta = f.as_posix()
        if "/obj/" in ruta or "/Migrations/" in ruta:
            continue
        lineas = f.read_text(encoding="utf-8-sig", errors="replace").splitlines()
        n = len(lineas)
        for i in range(n):
            if not CONS.search(lineas[i]):
                continue
            prof = 0
            abierto = False
            for j in range(i, min(i + 45, n)):
                prof += lineas[j].count("{") - lineas[j].count("}")
                if "{" in lineas[j]:
                    abierto = True
                if abierto and prof <= 0 and j > i:
                    break
                if j > i and IO.search(lineas[j]):
                    corto = ruta.split("/src/")[1].replace("TelecomBoliviaNet.", "")
                    print(f"  {corto}:{j + 1}")
                    print(f"      {lineas[j].strip()[:88]}")
                    total += 1
                    break
    print(f"\n  -> {total} bucles con E/S dentro")

if __name__ == "__main__":
    main()
