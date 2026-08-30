#!/usr/bin/env python3
"""Ninguna accion de controlador puede heredar su politica de autorizacion.

En ASP.NET Core el [Authorize] de un metodo NO reemplaza al de su clase: se
exigen los DOS (D-25). De ahi que una accion sin politica propia herede el piso
del controlador, y que ampliar ese piso -- para admitir un rol nuevo, por
ejemplo -- la abra sin que nadie lo haya decidido.

Se ejecuta en CI. Sin argumentos asume el directorio del backend.
"""
import re
import sys
import pathlib

RAIZ_POR_DEFECTO = (
    "telecombolivianet-backend-develop/src/TelecomBoliviaNet.Presentation/Controllers"
)

ACCION = re.compile(
    r'((?:[ \t]*\[[^\]]*\]\s*\r?\n)+)'          # el bloque de atributos
    r'[ \t]*public\s+(?:async\s+)?'
    r'[\w<>,\?\[\]\s]+\s+(\w+)\s*\('            # ... y la firma que lo sigue
)
VERBO = re.compile(r'\[Http(Get|Post|Put|Patch|Delete)')


def acciones_sin_politica(raiz: pathlib.Path):
    for archivo in sorted(raiz.rglob("*.cs")):
        texto = archivo.read_text(encoding="utf-8-sig", errors="replace")
        for m in ACCION.finditer(texto):
            atributos, nombre = m.group(1), m.group(2)
            if not VERBO.search(atributos):
                continue
            if "[Authorize" in atributos or "AllowAnonymous" in atributos:
                continue
            yield f"{archivo.as_posix()}::{nombre}"


def main() -> int:
    raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else RAIZ_POR_DEFECTO)
    if not raiz.is_dir():
        print(f"::error::No encuentro los controladores en {raiz}")
        return 2

    faltan = list(acciones_sin_politica(raiz))
    if faltan:
        print(f"::error::{len(faltan)} accion(es) sin politica propia de autorizacion:")
        for x in faltan:
            print("  " + x)
        print("\nAnadele [Authorize(Policy = \"...\")] con la politica que ya tiene")
        print("de hecho por herencia. Ver CONVENCIONES.md, seccion Autorizacion.")
        return 1

    print("Todas las acciones declaran su propia politica.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
