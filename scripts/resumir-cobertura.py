"""Resume uno o varios informes cobertura.xml, agrupados por capa.

Sirve para dos cosas distintas:

  python scripts/resumir-cobertura.py cobertura-e2e/
      -> lo que cubren las pruebas E2E dentro del contenedor instrumentado.

  python scripts/resumir-cobertura.py <dir-de-resultados> ...
      -> lo que cubren las suites de dotnet test. Pasando VARIOS directorios se
         obtiene la UNION, que es lo que interesa: una linea cubierta por las
         E2E y por las unitarias no debe contarse dos veces.
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET

CAPAS = ('Domain', 'Application', 'Infrastructure', 'Presentation')


def capa_de(ruta: str) -> str:
    for c in CAPAS:
        if f'TelecomBoliviaNet.{c}' in ruta or f'{os.sep}{c}{os.sep}' in ruta:
            return c
    return 'otros'


def main(directorios):
    archivos = []
    for d in directorios:
        archivos += glob.glob(os.path.join(d, '**', '*.xml'), recursive=True)
    archivos = [a for a in archivos if 'cobertura' in os.path.basename(a).lower()
                or a.endswith('.cobertura.xml')]

    if not archivos:
        print('No se encontro ningun informe. ¿Se paro el contenedor con margen '
              'suficiente? coverlet solo escribe si el proceso termina ordenadamente.')
        return 1

    print(f'informes leidos: {len(archivos)}')
    por_capa = {}
    for a in archivos:
        try:
            raiz = ET.parse(a).getroot()
        except ET.ParseError:
            print(f'  (ilegible, se omite: {a})')
            continue
        for cls in raiz.iter('class'):
            fn = cls.get('filename', '')
            cub, tot = por_capa.setdefault(capa_de(fn), (set(), set()))
            for l in cls.iter('line'):
                clave = (fn, l.get('number'))
                tot.add(clave)
                if int(l.get('hits', '0')) > 0:
                    cub.add(clave)

    print()
    tc = tt = 0
    for capa in CAPAS + ('otros',):
        if capa not in por_capa:
            continue
        cub, tot = por_capa[capa]
        if not tot:
            continue
        tc += len(cub)
        tt += len(tot)
        print(f'  {capa:16} {len(cub):6}/{len(tot):6}  {100 * len(cub) / len(tot):5.1f} %')
    if tt:
        print(f'  {"TOTAL":16} {tc:6}/{tt:6}  {100 * tc / tt:5.1f} %')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] or ['cobertura-e2e']))
