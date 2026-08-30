#!/usr/bin/env python3
"""Metricas estructurales por clase del backend C#.

No pretende ser exacta: es un mapa para saber DONDE mirar. Cada numero se
verifica leyendo la clase antes de sacar conclusiones.
"""
import re, sys, json, pathlib

RAIZ = pathlib.Path("telecombolivianet-backend-develop/src")

CLASE = re.compile(
    r'^\s*(?:public|internal)\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*'
    r'(class|record|struct|interface)\s+(\w+)', re.M)
CTOR_DEPS = re.compile(r'\b(?:public|internal|protected)\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*base\([^)]*\)\s*)?\{')
RAMA = re.compile(r'\bif\s*\(|\bswitch\s*[\({]|\bwhile\s*\(|\bfor(each)?\s*\(|\?\?|\?\s|&&|\|\|')
PUBLICO = re.compile(r'^\s*public\s+(?!class|record|struct|interface|enum)', re.M)

def deps_de(texto, nombre):
    """Cuenta parametros del constructor de `nombre` (0 si no tiene)."""
    for m in CTOR_DEPS.finditer(texto):
        if m.group(1) != nombre: continue
        params = m.group(2).strip()
        if not params: return 0
        # separar por comas de primer nivel (no las de genericos)
        prof, n = 0, 1
        for ch in params:
            if ch in '<([': prof += 1
            elif ch in '>)]': prof -= 1
            elif ch == ',' and prof == 0: n += 1
        return n
    return 0

def main():
    filas = []
    for f in sorted(RAIZ.rglob("*.cs")):
        ruta = f.as_posix()
        if "/obj/" in ruta or "/Migrations/" in ruta: continue
        texto = f.read_text(encoding="utf-8-sig", errors="replace")
        capa = ruta.split("TelecomBoliviaNet.")[1].split("/")[0]
        for m in CLASE.finditer(texto):
            tipo, nombre = m.group(1), m.group(2)
            # cuerpo aproximado: desde aqui hasta la siguiente declaracion o el fin
            sig = CLASE.search(texto, m.end())
            cuerpo = texto[m.start(): sig.start() if sig else len(texto)]
            filas.append({
                "capa": capa,
                "archivo": ruta.split("/src/")[1],
                "tipo": tipo,
                "clase": nombre,
                "lineas": cuerpo.count("\n") + 1,
                "deps": deps_de(cuerpo, nombre),
                "publicos": len(PUBLICO.findall(cuerpo)),
                "ramas": len(RAMA.findall(cuerpo)),
                "ef": int("Microsoft.EntityFrameworkCore" in texto),
                "saves": cuerpo.count("SaveChangesAsync"),
                "catch": len(re.findall(r'\bcatch\s*[\({]', cuerpo)),
            })
    json.dump(filas, open("scripts/analisis/metricas.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"{len(filas)} tipos analizados en {len(set(x['archivo'] for x in filas))} archivos")
    for capa in ["Domain", "Application", "Infrastructure", "Presentation"]:
        c = [x for x in filas if x["capa"] == capa]
        clases = [x for x in c if x["tipo"] == "class"]
        print(f"  {capa:15} {len(c):4} tipos ({len(clases)} clases), "
              f"mediana {sorted(x['lineas'] for x in clases)[len(clases)//2] if clases else 0} líneas")

if __name__ == "__main__":
    main()
