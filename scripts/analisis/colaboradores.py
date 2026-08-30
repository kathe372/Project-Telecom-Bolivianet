#!/usr/bin/env python3
"""Dependencias de NEGOCIO por clase, excluyendo las transversales.

La regla 2 de CONVENCIONES.md dice que ningun constructor pasa de 6
dependencias. Contarlas todas mide lo que no es: AuditService lo inyectan 57
clases y ILogger 35, y ninguna de las dos dice nada sobre si la clase hace
demasiado. Este contador las descuenta.
"""
import re
import sys
import pathlib

RAIZ = pathlib.Path("telecombolivianet-backend-develop/src/TelecomBoliviaNet.Application")

TRANSVERSALES = ("AuditService", "ILogger<", "IUnitOfWork", "IConfiguration")

CTOR = re.compile(r'\bpublic\s+(\w+)\s*\(([^)]*)\)\s*(?:\r?\n\s*)?\{', re.S)
CLASE = re.compile(r'\bpublic\s+(?:sealed\s+|abstract\s+)?class\s+(\w+)')


def partir(params):
    partes, prof, actual = [], 0, ""
    for ch in params:
        if ch in "<([":
            prof += 1
        elif ch in ">)]":
            prof -= 1
        if ch == "," and prof == 0:
            partes.append(actual.strip())
            actual = ""
        else:
            actual += ch
    if actual.strip():
        partes.append(actual.strip())
    return partes


def main() -> int:
    techo = int(sys.argv[sys.argv.index("--techo") + 1]) if "--techo" in sys.argv else 8
    filas = []

    for f in sorted(RAIZ.rglob("*.cs")):
        if "/obj/" in f.as_posix():
            continue
        texto = f.read_text(encoding="utf-8-sig", errors="replace")
        clases = {m.group(1) for m in CLASE.finditer(texto)}
        for m in CTOR.finditer(texto):
            nombre, params = m.group(1), m.group(2).strip()
            if nombre not in clases or not params:
                continue
            todas = partir(params)
            negocio = [p for p in todas if not any(t in p for t in TRANSVERSALES)]
            filas.append((len(negocio), len(todas), nombre, f.name))

    grandes = sorted([x for x in filas if x[0] > techo], reverse=True)
    for neg, tot, clase, arch in grandes:
        print(f"  {neg:2} de negocio ({tot:2} en total)  {clase}")

    print(f"\nClases con mas de {techo} dependencias DE NEGOCIO: {len(grandes)}")
    if grandes:
        print("::error::Alguna clase esta haciendo demasiado. Ver CONVENCIONES.md regla 2.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
