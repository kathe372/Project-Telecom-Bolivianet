#!/usr/bin/env python3
"""Cuenta las funciones de mas de 50 lineas del backend.

CONVENCIONES.md regla 3 dice que ninguna funcion pasa de 50 lineas. Hoy hay 72
que si pasan. Refactorizarlas es un trabajo aparte y con riesgo propio; hasta
entonces, esto es un trinquete: la cuenta puede bajar, no subir.

Dos avisos sobre la cifra:

  * Cuenta lineas fisicas, comentarios incluidos. Este proyecto comenta el
    porque de cada decision y eso engorda funciones que por logica son cortas.
    Una funcion de 60 lineas de las que 25 son explicaciones no es el problema
    que la regla persigue.
  * No cuenta declaraciones de tipo (record, class). Un `record` con veinte
    parametros no es una funcion larga.

Uso:  python3 scripts/funciones-largas.py [--techo N] [ruta]
"""
import re
import sys
import pathlib

TECHO_POR_DEFECTO = 72
RAIZ_POR_DEFECTO = "telecombolivianet-backend-develop/src"
LIMITE_LINEAS = 50

DECLARACION = re.compile(
    r'^\s*(?:public|private|internal|protected)\s+'
    r'(?:static\s+|async\s+|override\s+|virtual\s+|sealed\s+|partial\s+|abstract\s+)*'
    r'(?:record|class|struct|interface|enum)\b'
)
FIRMA = re.compile(
    r'^(\s*)(?:public|private|internal|protected)\s+'
    r'(?:static\s+|async\s+|override\s+|virtual\s+|sealed\s+)*'
    r'[\w<>,\[\]\?\.]+\s+(\w+)\s*\('
)


def funciones_largas(raiz: pathlib.Path):
    for archivo in sorted(raiz.rglob("*.cs")):
        ruta = archivo.as_posix()
        if "/obj/" in ruta or "/Migrations/" in ruta:
            continue
        lineas = archivo.read_text(encoding="utf-8-sig", errors="replace").splitlines()
        i = 0
        while i < len(lineas):
            if DECLARACION.match(lineas[i]):
                i += 1
                continue
            m = FIRMA.match(lineas[i])
            if m and not lineas[i].rstrip().endswith(";"):
                sangria, nombre = m.group(1), m.group(2)
                cierre = sangria + "}"
                for j in range(i + 1, min(i + 500, len(lineas))):
                    if lineas[j].rstrip() == cierre:
                        if j - i > LIMITE_LINEAS:
                            yield (j - i, ruta, nombre, i + 1)
                        i = j
                        break
            i += 1


def main() -> int:
    args = [a for a in sys.argv[1:]]
    techo = TECHO_POR_DEFECTO
    if "--techo" in args:
        k = args.index("--techo")
        techo = int(args[k + 1])
        del args[k:k + 2]
    raiz = pathlib.Path(args[0] if args else RAIZ_POR_DEFECTO)

    largas = sorted(funciones_largas(raiz), reverse=True)
    for n, ruta, nombre, linea in largas[:15]:
        print(f"{n:4} lineas  {ruta}:{linea}  {nombre}")
    if len(largas) > 15:
        print(f"     ... y {len(largas) - 15} mas")

    print(f"\nFunciones de mas de {LIMITE_LINEAS} lineas: {len(largas)} (techo: {techo})")
    if len(largas) > techo:
        print(f"::error::Han aparecido {len(largas) - techo} funcion(es) largas nuevas.")
        print("La cuenta puede bajar, no subir. Ver CONVENCIONES.md, regla 3.")
        return 1
    if len(largas) < techo:
        print(f"Bajo {techo - len(largas)}. Baja el techo en el CI para fijar la mejora.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
