import { Injectable, Logger } from '@nestjs/common';
import { ChunkVectorRepository } from '../rag/chunk-vector.repository';
import { parseProcedure, normalizarPregunta, ProcedureBlock } from '../rag/procedure-parser';
import { SessionData } from '../session/session.service';
import { EmbeddingService } from '../rag/embedding.service';
import { ConfigService } from '@nestjs/config';

/** Un procedimiento a medias caduca, como todo lo pendiente en este sistema.
 *  Sin esto, un cliente que abandona a mitad vuelve dos días después y el bot
 *  le pregunta si el router mejoró. */
export const PROCEDIMIENTO_TTL_MS = 2 * 60 * 60_000; // 2 horas

export interface PasoRenderizado {
  /** Texto que se le manda al cliente. */
  texto: string;
  /** Botones tal como los definió el documento. */
  botones: { id: string; title: string }[];
  /** Acciones a ejecutar (crear ticket, ofrecer visita…). */
  acciones: ProcedureBlock['actions'];
  /** Clave del bloque, para dejarla en sesión. */
  clave: string;
}

/**
 * Recorre un procedimiento definido en un documento.
 *
 * El código no conoce ni un texto del flujo: pide bloques por nombre y arma los
 * botones con lo que el documento declara. Cambiar el procedimiento es editar
 * el documento y volver a subirlo.
 *
 * Los bloques se piden por NOMBRE, no por similitud: se midió (2026-08-07) que
 * la búsqueda vectorial, aun con consultas fijas por estado, acertaba 5 de 6
 * con márgenes de 0.012-0.02. Un flujo que se equivoca de paso es peor que no
 * tener flujo.
 */
@Injectable()
export class ProcedureRunnerService {
  private readonly logger = new Logger(ProcedureRunnerService.name);

  private readonly umbralEntrada: number;

  constructor(
    private readonly chunks: ChunkVectorRepository,
    private readonly embedder: EmbeddingService,
    config: ConfigService,
  ) {
    // Deliberadamente mas alto que el umbral del RAG (0.50): secuestrar la
    // conversacion hacia un procedimiento es mas invasivo que responder una
    // pregunta, asi que ante la duda conviene NO arrancarlo.
    this.umbralEntrada = config.get<number>('rag.procedureEntryThreshold') ?? 0.62;
  }

  /**
   * ¿El mensaje libre del cliente abre algún procedimiento?
   *
   * Acá SÍ se usa similitud: el cliente escribe como quiere y no hay
   * alternativa. Pero acotada a los bloques de ENTRADA, no a todo el corpus, y
   * con umbral propio. Se registra la similitud siempre para poder ajustar el
   * umbral con datos y no a ojo — el error que ya cometimos con el del RAG.
   */
  async detectarEntrada(texto: string, session: SessionData): Promise<string | null> {
    const limpio = (texto ?? '').trim();
    if (limpio.length < 4) return null;

    try {
      const vec = await this.embedder.embed(limpio, 'RETRIEVAL_QUERY');
      const candidatos = await this.chunks.searchProcedureEntries(vec, 2);
      if (candidatos.length === 0) return null;

      const mejor = candidatos[0];
      // No alcanza con superar un umbral: hay que GANARLE al RAG.
      //
      // Medido en produccion (2026-08-07): "el router es mio o prestado"
      // (entrada 0.564 / RAG 0.669) y "dame datos de mi instalacion" se iban al
      // procedimiento aunque el RAG tenia mejor respuesta. El umbral solo
      // preguntaba "¿se parece bastante?" cuando lo que importa es "¿se parece
      // MAS que cualquier otra cosa?".
      const mejorRag = await this.chunks.bestNonEntrySimilarity(vec);
      const arranca = mejor.similarity >= this.umbralEntrada && mejor.similarity > mejorRag;
      this.logger.log(JSON.stringify({
        event: 'procedimiento_entrada',
        arranca, similitud: Number(mejor.similarity.toFixed(3)),
        mejorRag: Number(mejorRag.toFixed(3)),
        umbral: this.umbralEntrada, bloque: mejor.question,
      }));
      return arranca ? mejor.question : null;
    } catch (err: unknown) {
      // Si falla la deteccion, el turno sigue por el camino normal del agente.
      // Nunca se cuelga al cliente por un problema nuestro.
      this.logger.warn(`No se pudo detectar entrada de procedimiento: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Mapea una respuesta ESCRITA a una de las ramas del bloque actual.
   *
   * Medido en producción (2026-08-07): con el flujo andando, el cliente escribió
   * "Rojo" en vez de tocar 🔴 Roja y el procedimiento se perdió. La gente
   * escribe: sin esto, el flujo se corta en el primer paso.
   *
   * Es un problema chico y acotado — dos o tres opciones conocidas, no todo el
   * corpus — así que se resuelve con comparación léxica y NO con el modelo:
   * meter una llamada a Gemini acá le devolvería al flujo la indeterminación
   * que vinimos a sacarle.
   */
  async resolverRespuesta(session: SessionData, texto: string): Promise<string | null> {
    const clave = this.enCurso(session);
    if (!clave || !texto?.trim()) return null;

    const paso = await this.ir(clave, session);
    if (!paso || paso.botones.length === 0) return null;

    const dicho = normalizarPregunta(texto);
    const palabras = dicho.split(' ').filter((p) => p.length >= 2);

    for (const boton of paso.botones) {
      // El emoji no aporta al cotejo; las palabras del título, sí.
      const etiqueta = normalizarPregunta(boton.title.replace(/[^\p{L}\p{N}\s]/gu, ' '));
      for (const termino of etiqueta.split(' ').filter((t) => t.length >= 4)) {
        // Prefijo de 3: "roja" reconoce "rojo", "mejoro" reconoce "mejoró".
        const raiz = termino.slice(0, 3);
        if (palabras.some((p) => p.startsWith(raiz))) return boton.id.replace(/^proc:/, '');
      }
    }

    // Sí/no sueltos: no aparecen en las etiquetas pero son la respuesta más
    // natural a "¿mejoró?". Solo se aplica con exactamente dos opciones, donde
    // no hay ambigüedad sobre cuál es cuál.
    if (paso.botones.length === 2) {
      const afirma = /^(si|sí|s|dale|ok|correcto|afirmativo|volvio|mejoro|funciona)$/.test(dicho);
      const niega  = /^(no|nel|nada|negativo|sigue|tampoco|igual)$/.test(dicho);
      // Solo si los botones SON de sí/no. Medido en produccion: el cliente
      // respondio "Si" a "¿de que color esta la luz?" y el codigo, al no
      // encontrar marca afirmativa, eligio el primer boton (🔴 Roja) por
      // descarte. Un "si" a una pregunta de color no significa nada, y darle
      // un significado inventado mando al cliente por la rama equivocada.
      const positivo = paso.botones.findIndex((b) => /✅|👍|s[ií]/i.test(b.title));
      const negativo = paso.botones.findIndex((b) => /❌|👎|no/i.test(b.title));
      if ((afirma || niega) && positivo >= 0 && negativo >= 0) {
        return paso.botones[afirma ? positivo : negativo].id.replace(/^proc:/, '');
      }
    }

    this.logger.log(JSON.stringify({
      event: 'procedimiento_respuesta_no_mapeada', clave, texto: texto.slice(0, 60),
    }));
    return null;
  }

  /** ¿Hay un procedimiento en curso y todavía vigente? */
  enCurso(session: SessionData): string | null {
    const p = session.procedimientoActual;
    if (!p?.clave) return null;
    if (p.at && Date.now() - p.at > PROCEDIMIENTO_TTL_MS) return null;
    return p.clave;
  }

  /** Trae y renderiza el bloque cuya pregunta se indica. */
  async ir(pregunta: string, session: SessionData): Promise<PasoRenderizado | null> {
    const clave = normalizarPregunta(pregunta);
    const fila = await this.chunks.findByQuestion(clave);
    if (!fila) {
      // No se inventa un paso: se avisa y el turno sigue por el camino normal.
      this.logger.warn(JSON.stringify({
        event: 'procedimiento_bloque_inexistente', clave, phone: session.phoneNumber,
      }));
      return null;
    }

    // El contenido guardado es "pregunta\ncuerpo": la pregunta es el nombre del
    // bloque, no algo que se le muestre al cliente.
    const { blocks } = parseProcedure(fila.content);
    const bloque = blocks.get(clave) ?? [...blocks.values()][0];
    if (!bloque) return null;

    return {
      clave,
      texto:    this.sustituir(bloque.body, session),
      botones:  bloque.buttons.map((b) => ({ id: `proc:${normalizarPregunta(b.next)}`, title: b.label })),
      acciones: bloque.actions,
    };
  }

  /**
   * Reemplaza los marcadores del documento con datos del cliente.
   *
   * Existe para que el texto siga siendo del documento pero el número sea real:
   * "tu plan es de {plan_velocidad} Mbps, menos de {plan_mitad} es un problema"
   * evita que el cliente tenga que hacer la cuenta. El RAG no puede hacerlo
   * porque sólo devuelve texto; acá hay datos de sesión a mano.
   *
   * Un marcador sin dato se borra junto con su frase-oración para no dejar
   * "tu plan es de {plan_velocidad} Mbps" a la vista.
   */
  private sustituir(texto: string, session: SessionData): string {
    const velocidad = session.planSpeedMbps ?? null;
    const valores: Record<string, string | null> = {
      nombre:          session.clientName?.split(' ')[0] ?? null,
      plan:            session.planName ?? null,
      plan_velocidad:  velocidad ? String(velocidad) : null,
      plan_mitad:      velocidad ? String(Math.round(velocidad / 2)) : null,
    };

    return texto
      .split('\n')
      .map((linea) => {
        const faltantes = [...linea.matchAll(/\{(\w+)\}/g)].some((m) => !valores[m[1]]);
        if (faltantes) return null;   // se cae la línea entera, no queda a medias
        return linea.replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? '');
      })
      .filter((l): l is string => l !== null)
      .join('\n')
      .trim()
      // El documento se escribe con márgenes, y esos cortes a mitad de frase
      // llegaban tal cual a WhatsApp: "Mirá el módem que tenés en casa y fijate
      // de qué ⏎ color está la luz". Se juntan los renglones de un mismo
      // párrafo; los párrafos (línea en blanco) se conservan.
      .replace(/([^\n])\n(?!\n)/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ');
  }
}
