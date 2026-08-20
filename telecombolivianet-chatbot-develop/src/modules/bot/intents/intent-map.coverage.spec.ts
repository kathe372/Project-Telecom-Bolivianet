import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { DEFAULT_INTENT_MAP } from './intent-map.config';

/**
 * Todo botón que se le muestra al cliente tiene que tener un destino definido.
 *
 * Por qué existe (2026-08-07): `mostrarOAgendarInstalacion` ofrecía
 * "📅 Reprogramar" y "❌ Cancelar". El primero tenía ruta determinista; el
 * segundo no estaba en ningún lado — ni ruta, ni entrada en el mapa de
 * intenciones. Un id sin destino degrada a su etiqueta pelada, y "❌ Cancelar"
 * fuera de contexto no significa nada.
 *
 * Medido en producción: el cliente tocó ese botón para anular su instalación y
 * el bot le abrió el procedimiento de soporte técnico preguntándole de qué
 * color estaba la luz del módem.
 *
 * Revisar caso por caso no sirve: estaban mapeados los cuatro ids de
 * cancelación de instalación EXCEPTO el que la inicia, y nadie lo notó. Esto lo
 * verifica leyendo el código, así que cubre también los botones que se agreguen
 * mañana.
 */

/** Ids que el orquestador atiende él mismo, sin pasar por el mapa. */
const RUTAS_DETERMINISTAS = new Set([
  'reagendar_instalacion',
  'solicitar_instalacion',
]);

/**
 * Un botón visible se reconoce por llevar `id` y `title` juntos. Los ids
 * dinámicos (`plan:<uuid>`, `slot:<fecha>`, `proc:<clave>`, `csat:<n>`) los
 * resuelve el codec y no entran acá: no son literales en minúsculas.
 */
const BOTON = /\{\s*id:\s*'([a-z_]+)'\s*,\s*title:/g;

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivosFuente(ruta, acc);
    } else if (ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts')) {
      acc.push(ruta);
    }
  }
  return acc;
}

describe('cobertura de ids de botón', () => {
  const raizSrc = join(__dirname, '..', '..', '..');

  it('todo id que se muestra como botón tiene ruta o entrada en el mapa', () => {
    const huerfanos: string[] = [];

    for (const archivo of archivosFuente(raizSrc)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const m of contenido.matchAll(BOTON)) {
        const id = m[1];
        if (DEFAULT_INTENT_MAP[id] || RUTAS_DETERMINISTAS.has(id)) continue;
        huerfanos.push(`${id}  (${archivo.replace(raizSrc, 'src')})`);
      }
    }

    expect(huerfanos).toEqual([]);
  });

  // El caso concreto que lo motivó, explícito: si alguien borra la entrada, el
  // mensaje de error dice qué se rompe y no solo que "falta una clave".
  it('cancelar_instalacion está mapeado — sin él el botón abre soporte técnico', () => {
    expect(DEFAULT_INTENT_MAP['cancelar_instalacion']).toBeDefined();
    expect(DEFAULT_INTENT_MAP['cancelar_instalacion']).toMatch(/cancelar/i);
    expect(DEFAULT_INTENT_MAP['cancelar_instalacion']).toMatch(/instalaci/i);
  });
});
