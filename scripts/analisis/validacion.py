#!/usr/bin/env python3
"""Endpoints que reciben un cuerpo: cuales validan y cuales no."""
import re
import pathlib

RAIZ = pathlib.Path("telecombolivianet-backend-develop/src/TelecomBoliviaNet.Presentation/Controllers")
ACCION = re.compile(
    r"((?:[ \t]*\[[^\]]*\]\s*\r?\n)+)[ \t]*public\s+(?:async\s+)?"
    r"[\w<>,\?\[\]\s]+\s+(\w+)\s*\(([^)]*)\)", re.S)

def main():
    con_cuerpo, validan, sin_validar = 0, 0, []
    for f in sorted(RAIZ.rglob("*.cs")):
        texto = f.read_text(encoding="utf-8-sig", errors="replace")
        for m in ACCION.finditer(texto):
            attrs, nombre, params = m.group(1), m.group(2), m.group(3)
            if not re.search(r"\[Http(Post|Put|Patch)", attrs):
                continue
            if "[FromBody]" not in params:
                continue
            con_cuerpo += 1
            # cuerpo del metodo: hasta la siguiente accion o 60 lineas
            resto = texto[m.end(): m.end() + 2500]
            if "ValidateAsync" in resto.split("[Http")[0]:
                validan += 1
            else:
                sin_validar.append(f"{f.name}::{nombre}")

    print(f"Endpoints con [FromBody]: {con_cuerpo}")
    print(f"  validan con FluentValidation: {validan}")
    print(f"  NO validan en el controlador: {len(sin_validar)}")
    for x in sin_validar:
        print(f"    {x}")

if __name__ == "__main__":
    main()
