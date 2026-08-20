import { Injectable, Inject, Logger } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { ToolExecutor } from '../agent.service';
import { ActionConfirmationGuard } from '../guards/action-confirmation.guard';
import { PerTurnToolCache } from './per-turn-tool-cache';
import { QuickReply, ListSection } from '../interactive-reply.builder';
import { AgentTool, AGENT_TOOLS, ESCALATE_TOOL } from './agent-tool.interface';
import { ESCALACION_SIN_BUSCAR } from './escalate-to-agent.tool';

export interface BotMediaSent {
  localUrl:  string;
  mediaType: 'image' | 'audio';
}

export interface ListPayload {
  buttonLabel: string;
  sections: ListSection[];
}

/**
 * Quita del resultado los campos fuera de banda antes de dárselo al modelo.
 *
 * Por qué (2026-08-07): `_list` viaja DENTRO del resultado de la herramienta —
 * es un canal para el orquestador, que lo manda como lista interactiva de
 * WhatsApp. Pero el resultado entero se le devolvía al modelo, así que el
 * modelo veía ese JSON y lo copiaba a su respuesta.
 *
 * Medido en producción: el cliente recibió
 * `{"buttonLabel": "Ver planes", "sections": [{"rows": [{"description": ...`
 * pegado debajo del texto, en el turno de planes y otra vez en el de horarios.
 * La consecuencia no fue estética: en esos dos turnos ESCRIBIÓ la respuesta a
 * mano ("COBRE", "A las 15:30") en vez de tocar la opción. En los turnos que
 * NO pasan por el modelo —el menú, los horarios al reprogramar— la lista salió
 * limpia. Misma estructura de datos, distinto resultado según intervenga o no
 * el modelo.
 *
 * La regla es por PREFIJO y no una lista de nombres a propósito: un canal nuevo
 * queda cubierto el día que se agrega, sin que nadie tenga que acordarse. Las
 * listas enumeradas se desactualizan — hoy mismo un id de botón se quedó fuera
 * de `DEFAULT_INTENT_MAP` por eso.
 */
export function sinCanalesFueraDeBanda(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;

  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(result as Record<string, unknown>)) {
    if (clave.startsWith('_')) continue;
    limpio[clave] = valor;
  }
  return limpio;
}

export interface BuiltExecutor {
  executor: ToolExecutor;
  getMediaSent: () => BotMediaSent[];
  isSuppressed: () => boolean;
  hasMutationSucceeded: () => boolean;
  getQuickReplies: () => QuickReply[];
  getList: () => ListPayload | null;
  /** FASE B2: id del chunk de la base de conocimiento que alimentó la respuesta. */
  getRagChunkId: () => string | null;
  /** FASE G1: ¿alguna herramienta devolvió un resumen de confirmación (pending)? */
  hasPendingConfirmation: () => boolean;
  /** ¿Alguna herramienta de CONSULTA devolvió estado real en este turno?
   *  Legitima las frases descriptivas ("tu instalación agendada es el 12"). */
  hasStateReadBacking: () => boolean;
  /** ¿La escalación OCURRIÓ de verdad? `toolsCalled` solo dice que el modelo la
   *  intentó — y la intención no es el hecho. */
  hasEscalated: () => boolean;
  /** ¿Alguna herramienta devolvió un error CON mensaje propio? Ese mensaje es
   *  más útil que cualquier fallback genérico y no debe pisarse. */
  hasToolError: () => boolean;
  /**
   * FASE G2: estado del patrón de dos pasos para que el orquestador lo persista.
   *  · `emitido`  → este turno mostró un resumen; hay que guardarlo en sesión.
   *  · `consumido`→ este turno confirmó; hay que limpiarlo.
   *  · ninguno    → si había uno de un turno anterior, se invalida.
   */
  getConfirmationState: () => {
    emitido: { tool: string; argsHash: string; at: number } | null;
    consumido: boolean;
  };
}

/** Ventana máxima de validez de un resumen de confirmación. */
const CONFIRMACION_TTL_MS = 10 * 60_000;

/** Huella estable de los argumentos, ignorando el propio flag de confirmación. */
function hashArgs(args: Record<string, unknown>): string {
  const relevantes = Object.keys(args)
    .filter((k) => k !== 'confirmado')
    .sort()
    .map((k) => `${k}=${String(args[k])}`)
    .join('|');
  let h = 0;
  for (let i = 0; i < relevantes.length; i++) {
    h = (h * 31 + relevantes.charCodeAt(i)) | 0;
  }
  return String(h);
}


@Injectable()
export class AgentToolRegistry {
  private readonly logger = new Logger(AgentToolRegistry.name);
  private readonly tools: Map<string, AgentTool>;

  constructor(
    @Inject(AGENT_TOOLS) tools: AgentTool[],
    private readonly confirmationGuard: ActionConfirmationGuard,
  ) {
    this.tools = new Map(tools.map((t) => [t.getName(), t]));
  }

  getDeclarations(): object[] {
    return [...this.tools.values()].map((t) => t.getDeclaration());
  }

  /** Ejecuta search_knowledge_base en lugar del modelo cuando este quiso
   *  escalar sin haber consultado. La consulta sale del último mensaje del
   *  cliente; si no lo hubiera, se cae al `reason` que el propio modelo escribió
   *  (que siempre contiene la pregunta reformulada). */
  private async buscarPorElModelo(
    session: SessionData, args: Record<string, unknown>,
  ): Promise<unknown> {
    const buscar = this.tools.get('search_knowledge_base');
    if (!buscar) return { queued: false, errorInterno: true, error: ESCALACION_SIN_BUSCAR };

    const ultimaDelCliente = [...(session.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const consulta = (ultimaDelCliente || (args.reason as string) || '').trim();
    if (!consulta) return { queued: false, errorInterno: true, error: ESCALACION_SIN_BUSCAR };

    const resultado = (await buscar.execute({ query: consulta }, session)) as Record<string, unknown>;

    if (resultado?.['found']) {
      return {
        ...resultado,
        nota_para_el_agente:
          'La respuesta SÍ estaba en la base de conocimiento. NO escales: respondé al ' +
          'cliente con esta información.',
      };
    }
    return {
      ...resultado,
      nota_para_el_agente:
        'Se consultó la base y efectivamente no hay información sobre esto. ' +
        'Ahora sí podés escalar con motivo no_se_responder.',
    };
  }

  /** Ejecuta una herramienta fuera del loop del agente, para los caminos
   *  deterministas del orquestador (botones que no necesitan al modelo). */
  async ejecutarSuelta(
    nombre: string, args: Record<string, unknown>, session: SessionData,
  ): Promise<unknown> {
    const tool = this.tools.get(nombre);
    if (!tool) return null;
    try {
      return await tool.execute(args, session);
    } catch (err: unknown) {
      this.logger.warn(`ejecutarSuelta(${nombre}) falló: ${(err as Error).message}`);
      return null;
    }
  }

  buildExecutor(session: SessionData): BuiltExecutor {
    const mediaSent: BotMediaSent[] = [];
    const turnCache = new PerTurnToolCache();
    let suppressResponse = false;
    let mutationSucceeded = false;
    let stateReadBacked   = false;
    // 2026-08-07: se registra si el turno consultó la base de conocimiento.
    // El bot escaló "¿el router es mío o prestado?" sin buscar, teniendo la
    // respuesta indexada en primera posición — y la escalación dejó la
    // conversación congelada, sin responder los dos mensajes siguientes.
    let consultoBase        = false;
    // 2026-08-07: el orquestador escalaba con `toolsCalled.includes(ESCALATE_TOOL)`,
    // es decir por el NOMBRE de la herramienta. Cuando el registry interceptaba
    // la escalación para buscar en su lugar, el nombre igual quedaba en la lista
    // y la conversación se congelaba en silencio: medido en producción, el
    // cliente recibió la respuesta correcta y la conversación quedó escalada
    // sin que nada se lo dijera.
    let escalacionEfectiva  = false;
    // 2026-08-07: un prospecto recorrió ocho pasos del alta y al confirmar la
    // herramienta devolvió "ya tenés una instalación agendada" — un mensaje
    // accionable. El guard lo reemplazó por "⚠️ Aún no pude completar esa
    // acción", que no dice nada. Tapar una mentira es el trabajo del guard;
    // tapar la verdad, no.
    let huboErrorDeTool     = false;

    let quickReplies: QuickReply[] = [];
    let list: ListPayload | null = null;
    let ragChunkId: string | null = null;
    let pendingConfirmation = false;
    let confirmacionEmitida: { tool: string; argsHash: string; at: number } | null = null;
    let confirmacionConsumida = false;

    const executor: ToolExecutor = async (name: string, args: Record<string, any>) => {
      const tool = this.tools.get(name);
      if (!tool) throw new Error(`Herramienta desconocida: ${name}`);

      if (tool.requiresIdentification() && !session.clientId) {
        return { error: 'Por favor identifícate primero para continuar.' };
      }

      // BUG-13: las tools de lectura repetidas en el mismo turno no re-consultan el backend.
      if (turnCache.isCacheable(name)) {
        const cached = turnCache.get(name, args);
        // La caché guarda el resultado CRUDO (con sus canales fuera de banda);
        // el saneo va acá, en la salida, porque este `return` se saltea el del
        // final. Sin esto la fuga de `_list` volvía en cuanto el modelo llamaba
        // dos veces a la misma herramienta de lectura en un turno.
        if (cached !== undefined) return sinCanalesFueraDeBanda(cached);
      }

      // ── FASE G2 (2026-08-07): el paso 2 exige un paso 1 real ────────────────
      // `session` es la foto ANTERIOR al turno, así que un resumen emitido en
      // este mismo turno no cuenta: es exactamente el caso que hay que impedir
      // (el modelo mandó confirmado:true en el mismo turno en que el cliente dio
      // el motivo, y la instalación se canceló sin que nadie confirmara).
      if (args?.confirmado === true) {
        const pc = session.pendingConfirmation;
        const vencido = !!pc && (Date.now() - pc.at) > CONFIRMACION_TTL_MS;

        if (!pc || pc.tool !== name || vencido) {
          const motivo = !pc      ? 'no hay ningún resumen pendiente'
                       : vencido  ? 'el resumen pendiente ya venció'
                       :            `el resumen pendiente es de ${pc.tool}, no de ${name}`;
          return {
            error:
              `No se puede confirmar: ${motivo}. ESTE ES UN ERROR TUYO, no le digas al cliente ` +
              `que hubo un problema. Llamá ${name} SIN confirmado para mostrarle el resumen, y ` +
              `esperá a que él confirme explícitamente antes de volver a llamarla con confirmado=true.`,
          };
        }

        if (pc.argsHash !== hashArgs(args)) {
          // No se rechaza: el modelo suele agregar campos entre paso 1 y paso 2
          // (nombre, CI, teléfono). Pero queda registrado para poder medirlo.
          this.logger.warn(JSON.stringify({
            event: 'confirmation_args_changed', tool: name,
            phone: session.phoneNumber,
          }));
        }
        confirmacionConsumida = true;
      }

      // El prompt ya ordenaba consultar antes de escalar y el modelo lo ignoró.
      //
      // La primera versión de este guardia solo RECHAZABA, y una sola vez, para
      // no colgar al cliente en un bucle. Medido en producción el mismo día: el
      // modelo no buscó, volvió a llamar escalate_to_agent, y el segundo intento
      // pasó por esa puerta. Un guardia que falla en abierto no es un guardia.
      //
      // Ahora la búsqueda NO depende de que el modelo obedezca: la hace este
      // registry con la última pregunta del cliente y le entrega el resultado.
      // Determinista, un solo turno, sin bucle posible.
      if (name === ESCALATE_TOOL && args?.motivo === 'no_se_responder' && !consultoBase) {
        this.logger.warn(JSON.stringify({
          event: 'escalacion_sin_consultar_base', phone: session.phoneNumber,
        }));
        const hallado = await this.buscarPorElModelo(session, args) as Record<string, unknown>;
        consultoBase = true;
        // Este retorno temprano se saltaba la captura del chunkId de más abajo,
        // así que la respuesta salía de la base pero quedaba registrada como
        // `chunk_id = NULL` — indistinguible de una alucinación en la auditoría.
        // Verificado en producción: el bot respondió bien y el mensaje se guardó
        // sin trazabilidad.
        if (typeof hallado?.['chunkId'] === 'string' && hallado['chunkId']) {
          ragChunkId = hallado['chunkId'] as string;
        }
        return sinCanalesFueraDeBanda(hallado);
      }

      const result = (await tool.execute(args, session)) as Record<string, unknown>;

      if (name === 'search_knowledge_base') consultoBase = true;

      // 2026-08-07: `check_recurring_issue` devolvía `siguiente_paso_obligatorio`
      // ordenando consultar la base ANTES de redactar pasos. Medido en
      // producción: el modelo leyó la instrucción y no llamó a la herramienta —
      // 869 caracteres de pasos inventados, chunk_id en NULL, el síntoma
      // original intacto.
      //
      // La premisa de que "una instrucción dentro del resultado de una tool se
      // obedece mejor que el prompt" resultó no ser confiable. Así que la
      // búsqueda se hace acá, sin pedir permiso: los pasos documentados llegan
      // al modelo dentro del mismo resultado, ya resueltos.
      if (name === 'check_recurring_issue'
          && result?.['recurrent'] === false
          && !consultoBase) {
        const hallado = await this.buscarPorElModelo(session, {}) as Record<string, unknown>;
        consultoBase = true;
        if (typeof hallado?.['chunkId'] === 'string' && hallado['chunkId']) {
          ragChunkId = hallado['chunkId'] as string;
        }
        if (hallado?.['found']) {
          result['pasos_documentados'] = hallado['answer'];
          result['siguiente_paso_obligatorio'] =
            'Usá EXACTAMENTE los pasos de `pasos_documentados`. Está PROHIBIDO redactar pasos ' +
            'propios o agregar otros: son los únicos aprobados. Dalos de a uno, no todos juntos.';
        } else {
          result['siguiente_paso_obligatorio'] =
            'La base de conocimiento no tiene pasos para este problema. NO inventes ninguno: ' +
            'creá el ticket con create_support_ticket.';
        }
      }
      if (name === ESCALATE_TOOL && result?.['queued'] === true) escalacionEfectiva = true;
      // 17 (2026-08-07): un error de AUTOCORRECCION no es un mensaje para el
      // cliente. La primera version no distinguia, y el resultado fue que el
      // modelo le dijo "hubo un problema al cargar los horarios, intenta mas
      // tarde" cuando el error interno le pedia exactamente lo contrario:
      // corregir el plan_id y reintentar en el mismo turno, sin mostrar nada.
      const esInterno = result?.['errorInterno'] === true;
      if (!esInterno
          && (result?.['error'] || result?.['created'] === false || result?.['scheduled'] === false)) {
        huboErrorDeTool = true;
      }

      if (turnCache.isCacheable(name) && !result?.['error']) {
        turnCache.set(name, args, result);
      }

      if (tool.isMutating?.() && this.confirmationGuard.isSuccessfulMutation(result)) {
        mutationSucceeded = true;
      }
      // 2026-08-07: una herramienta de consulta que encontró datos respalda que
      // el agente los describa. Sin esto, `get_active_installation` devolvía la
      // cita correcta y el guard marcaba la respuesta como inventada, sólo por
      // la adyacencia "instalación agendada".
      // 18 (2026-08-07): antes exigia found===true. Una consulta que responde
      // "no hay ninguna instalacion agendada" es un resultado igual de valido
      // que una que encuentra algo — y el guard marcaba esa negacion como
      // afirmacion sin respaldo. Lo que respalda es HABER CONSULTADO.
      // La condicion NO puede depender del nombre de un campo. Antes exigia
      // `found`, y `check_coverage` devuelve `covered`: consulto, obtuvo el
      // dato correcto, y el respaldo no se registro. El bot dijo "ya tenes una
      // instalacion agendada" —cierto y respaldado— y el guard lo tapo.
      //
      // Lo que respalda es HABER CONSULTADO: una herramienta no mutante que
      // devuelve algo sin error. Cualquier otra regla es adivinar por el nombre.
      if (!tool.isMutating?.() && result && typeof result === 'object' && !result['error']) {
        stateReadBacked = true;
      }
      if (result?.['_localUrl']) {
        mediaSent.push({ localUrl: result['_localUrl'] as string, mediaType: 'image' });
      }
      // PASO 3 (2026-08): `_suppressResponse` mezclaba dos significados distintos
      // ("ya entregué contenido, no dupliques" y "no hice nada, deduplicado") en
      // una sola bandera — el segundo caso apagaba turnos enteros por error,
      // incluida cualquier pregunta nueva que llegara en el mismo mensaje.
      // `_mediaDelivered` es el reemplazo correcto; `_suppressResponse` se lee
      // como alias retrocompatible (verificado: hoy solo send-payment-qr.tool.ts
      // lo usaba, y ya está migrado a los campos nuevos). `_noOp` NO se lee
      // acá a propósito — nunca debe apagar la respuesta del turno.
      if (result?.['_mediaDelivered'] || result?.['_suppressResponse']) {
        suppressResponse = true;
      }
      if (Array.isArray(result?.['_quickReplies'])) {
        // MEJORA-1C: la última herramienta que ofrece botones define los del turno
        quickReplies = result['_quickReplies'] as QuickReply[];
      }
      // PASO 8: mismo criterio que _quickReplies, pero para listas dinámicas
      // (planes, horarios) — la última herramienta que ofrece una lista
      // define la del turno.
      if (result?.['_list']) {
        list = result['_list'] as ListPayload;
      }
      // FASE B2 (2026-08-07): search_knowledge_base ya devolvía `chunkId`, pero
      // nadie lo recogía: el orquestador llamaba sender.send(...) sin él, así
      // que `messages.chunk_id` quedaba en NULL INCLUSO en los turnos donde el
      // RAG sí había respondido. Resultado: era imposible saber desde el
      // sistema qué documento contestó — había que cruzar logs, bot_events y
      // la caché a mano. Se propaga por el mismo canal que _quickReplies/_list.
      if (typeof result?.['chunkId'] === 'string' && result['chunkId']) {
        ragChunkId = result['chunkId'] as string;
      }
      // FASE G1 (2026-08-07): `pending: true` es el paso 1 del patrón de dos
      // pasos: la herramienta devuelve un RESUMEN de algo que todavía NO pasó,
      // para que el cliente lo confirme. Es correcto y deseado que la respuesta
      // describa esa acción en futuro. El guard anti-mentiras no puede
      // distinguirlo de una confirmación falsa, así que marcaba el resumen como
      // mentira, forzaba una corrección y el cliente terminaba leyendo
      // "Mil disculpas por la confusión" sin que hubiera ninguna.
      if (result?.['pending'] === true) {
        pendingConfirmation = true;
        // FASE G2: se guarda la huella para que el paso 2 pueda exigirla.
        confirmacionEmitida = { tool: name, argsHash: hashArgs(args), at: Date.now() };
      }

      // Todos los canales fuera de banda ya se consumieron arriba. Lo que sigue
      // va al modelo, y ahí no tienen nada que hacer: son instrucciones para el
      // transporte, no información para responder.
      return sinCanalesFueraDeBanda(result);
    };

    return {
      executor,
      getMediaSent:         () => mediaSent,
      isSuppressed:         () => suppressResponse,
      hasMutationSucceeded: () => mutationSucceeded,
      getQuickReplies:      () => quickReplies,
      getList:              () => list,
      getRagChunkId:        () => ragChunkId,
      hasPendingConfirmation: () => pendingConfirmation,
      hasStateReadBacking:    () => stateReadBacked,
      hasEscalated:           () => escalacionEfectiva,
      hasToolError:           () => huboErrorDeTool,
      getConfirmationState: () => ({
        emitido:   confirmacionEmitida,
        consumido: confirmacionConsumida,
      }),
    };
  }
}
