"""D-13: métodos con más de una escritura y sin transacción.

Cuenta por MÉTODO, no por archivo: dos SaveChangesAsync en métodos distintos no
comparten riesgo. Un archivo con seis puede estar perfectamente bien.

Uso:  python scripts/escrituras-sin-transaccion.py
"""
import re
import pathlib

RAIZ = pathlib.Path("telecombolivianet-backend-develop/src/TelecomBoliviaNet.Application")

# Firma de método (public/private/protected, async o no) con cuerpo entre llaves.
FIRMA = re.compile(
    r"^\s{4}(?:public|private|protected|internal)\s+"
    r"(?:static\s+|async\s+|virtual\s+|override\s+)*"
    r"[\w<>?,\[\]\. ]+?\s+(\w+)\s*\([^)]*\)\s*$",
    re.M)


def cuerpo_de(texto: str, desde: int) -> tuple[str, int]:
    """Cuerpo entre la primera llave tras `desde` y su cierre."""
    abre = texto.find("{", desde)
    if abre == -1:
        return "", desde
    nivel, i = 0, abre
    while i < len(texto):
        if texto[i] == "{":
            nivel += 1
        elif texto[i] == "}":
            nivel -= 1
            if nivel == 0:
                return texto[abre:i + 1], i
        i += 1
    return texto[abre:], len(texto)


def main() -> None:
    sospechosos = []
    for p in sorted(RAIZ.rglob("*.cs")):
        texto = p.read_text(encoding="utf-8-sig", errors="ignore")
        for m in FIRMA.finditer(texto):
            cuerpo, _ = cuerpo_de(texto, m.end())
            escrituras = len(re.findall(r"\.SaveChangesAsync\(", cuerpo))
            if escrituras < 2:
                continue
            protegido = "BeginTransactionAsync" in cuerpo
            justificado = bool(re.search(r"//[^\n]*(atóm|transacc|a propósito|deliberad)", cuerpo, re.I))
            if not protegido:
                sospechosos.append((escrituras, justificado,
                                    f"{p.relative_to(RAIZ).as_posix()}::{m.group(1)}"))

    print(f"{'esc':>4}  {'nota':>4}  método")
    for n, just, q in sorted(sospechosos, key=lambda x: (-x[0], x[2])):
        print(f"{n:>4}  {'sí' if just else '--':>4}  {q}")
    print(f"\n{len(sospechosos)} métodos con >1 escritura y sin transacción "
          f"({sum(1 for _, j, _ in sospechosos if j)} con comentario que lo justifica)")


if __name__ == "__main__":
    main()
