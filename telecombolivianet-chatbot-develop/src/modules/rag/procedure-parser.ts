/**
 * Convierte un documento de procedimiento en un grafo navegable.
 *
 * Por qué existe (2026-08-07): se intentó que el flujo de soporte saliera del
 * RAG por similitud y se midió que no funciona. Dos causas, ambas estructurales:
 *
 *   - Los embeddings no codifican negación ni tiempo verbal: "reiniciá el
 *     router" y "ya reinicié y sigue igual" son casi el mismo vector, así que
 *     el cliente que reporta un paso fallido vuelve al paso que ya hizo.
 *   - Con consultas fijas por estado, la similitud daba 5 de 6 con márgenes de
 *     0.012 a 0.02 — a esa distancia el ganador es azar.
 *
 * La conclusión no fue "hay que meter el flujo en el código" sino "hay que
 * dejar de buscar por parecido cuando ya sabés qué bloque querés". El
 * procedimiento entero (texto, botones, ramas y acciones) sigue viviendo en el
 * documento que sube el usuario; acá sólo se lo interpreta.
 */

export interface ProcedureButton {
  /** Lo que ve el cliente en el botón. */
  label: string;
  /** Pregunta del bloque al que lleva. */
  next: string;
}

export interface ProcedureAction {
  name: string;
  params: Record<string, string>;
}

export interface ProcedureBlock {
  question: string;
  body: string;
  buttons: ProcedureButton[];
  actions: ProcedureAction[];
  /** Bloque al que no llega ningún botón: por acá entra el cliente escribiendo
   *  libre. Es el ÚNICO que se busca por similitud; el resto se pide por nombre. */
  isEntry?: boolean;
  /**
   * Texto original del bloque, directivas incluidas.
   *
   * Existe porque `body` NO lleva las líneas `>> BOTON:` / `>> ACCION:` — el
   * parser las consume. Guardar sólo pregunta+cuerpo perdía las ramas, y al
   * releer el bloque desde la base no había botones. Medido en producción: el
   * flujo mostraba el primer paso y moría ahí, porque sin botones el
   * procedimiento se marcaba como terminado.
   */
  raw?: string;
}

export interface ParsedProcedure {
  blocks: Map<string, ProcedureBlock>;
  errors: string[];
}

/** Acciones que el ejecutor sabe realizar. Una acción fuera de esta lista es un
 *  error del documento, no algo que se intente adivinar en tiempo de ejecución. */
export const ACCIONES_CONOCIDAS = ['crear_ticket', 'ofrecer_visita', 'escalar'] as const;

const DIRECTIVA = /^>>\s*(BOTON|ACCION)\s*:\s*(.+)$/i;

/**
 * Clave de búsqueda: minúsculas, sin tildes, sin signos y con espacios
 * colapsados. Un `¿La luz del módem está verde?` escrito sin tildes en la rama
 * sigue encontrando su bloque — y aun así la validación avisa de la diferencia.
 */
export function normalizarPregunta(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function esPregunta(linea: string): boolean {
  const l = linea.trim();
  return l.startsWith('¿') && l.endsWith('?');
}

function parsearDirectiva(
  crudo: string, tipo: string, bloque: ProcedureBlock, errores: string[],
): void {
  if (tipo.toUpperCase() === 'BOTON') {
    const [etiqueta, destino] = crudo.split('->');
    if (!destino?.trim()) {
      errores.push(`Bloque "${bloque.question}": el botón "${crudo.trim()}" no indica a dónde lleva (falta "-> ¿pregunta?").`);
      return;
    }
    bloque.buttons.push({ label: etiqueta.trim(), next: destino.trim() });
    return;
  }

  // ACCION: nombre clave=valor clave=valor
  const partes = crudo.trim().split(/\s+/);
  const nombre = partes.shift() ?? '';
  if (!(ACCIONES_CONOCIDAS as readonly string[]).includes(nombre)) {
    errores.push(
      `Bloque "${bloque.question}": la acción "${nombre}" no existe. ` +
      `Disponibles: ${ACCIONES_CONOCIDAS.join(', ')}.`,
    );
    return;
  }
  const params: Record<string, string> = {};
  for (const p of partes) {
    const [k, v] = p.split('=');
    if (k && v) params[k] = v;
  }
  bloque.actions.push({ name: nombre, params });
}

export function parseProcedure(texto: string): ParsedProcedure {
  const blocks = new Map<string, ProcedureBlock>();
  const errors: string[] = [];
  let actual: ProcedureBlock | null = null;
  // Un bloque nuevo empieza en una pregunta que abre párrafo. Una pregunta
  // pegada al texto anterior ("¿De qué color está la luz?") es parte del
  // mensaje al cliente, no un bloque aparte.
  let renglonAnteriorVacio = true;

  for (const lineaCruda of (texto ?? '').split('\n')) {
    const linea = lineaCruda.trim();
    if (!linea) {
      renglonAnteriorVacio = true;
      // Una línea en blanco DENTRO de un bloque es un salto de párrafo del
      // texto que lee el cliente. Descartarla juntaba dos párrafos en uno.
      // Si en realidad separaba dos bloques, la pregunta siguiente abre uno
      // nuevo y este salto sobrante lo elimina el trim final.
      if (actual?.body) {
        actual.body += '\n';
        actual.raw = (actual.raw ?? '') + '\n';
      }
      continue;
    }
    const abreParrafo = renglonAnteriorVacio;
    renglonAnteriorVacio = false;

    const dir = DIRECTIVA.exec(linea);
    if (dir) {
      if (!actual) {
        errors.push(`La directiva "${linea}" aparece antes de cualquier pregunta.`);
        continue;
      }
      parsearDirectiva(dir[2], dir[1], actual, errors);
      actual.raw = (actual.raw ?? '') + '\n' + linea;
      continue;
    }

    if (esPregunta(linea) && abreParrafo) {
      actual = { question: linea, body: '', buttons: [], actions: [], raw: linea };
      const clave = normalizarPregunta(linea);
      if (blocks.has(clave)) {
        errors.push(`La pregunta "${linea}" está repetida: no se sabría cuál mostrar.`);
      }
      blocks.set(clave, actual);
      continue;
    }

    if (actual) {
      actual.body += (actual.body ? '\n' : '') + linea;
      actual.raw = (actual.raw ?? '') + '\n' + linea;
    }
  }

  // Toda rama tiene que llevar a algún lado que exista. Sin esto, el error
  // aparecería recién cuando un cliente cayera en ese botón.
  for (const bloque of blocks.values()) {
    for (const boton of bloque.buttons) {
      if (!blocks.has(normalizarPregunta(boton.next))) {
        errors.push(
          `Bloque "${bloque.question}": el botón "${boton.label}" lleva a ` +
          `"${boton.next}", que no existe en el documento.`,
        );
      }
    }
    if (bloque.buttons.length === 0 && bloque.actions.length === 0 && bloque.body) {
      // No es error: un bloque terminal (cierre) es legítimo.
      continue;
    }
  }

  // Un bloque de entrada es aquel al que no llega ninguna rama. Es el punto por
  // donde el cliente entra escribiendo libremente ("no tengo internet"), y el
  // unico que tiene sentido buscar por similitud.
  const apuntados = new Set<string>();
  for (const b of blocks.values()) {
    for (const boton of b.buttons) apuntados.add(normalizarPregunta(boton.next));
  }
  for (const [clave, bloque] of blocks) bloque.isEntry = !apuntados.has(clave);

  if (blocks.size === 0) errors.push('El documento no contiene ningún bloque con pregunta.');

  return { blocks, errors };
}
