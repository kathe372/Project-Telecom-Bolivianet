import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { maskPhone } from '../../common/utils/log.util';
import { SessionService, SessionData } from '../session/session.service';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { AdminSignalrNotifierService } from '../notifications/admin-signalr-notifier.service';
import { AgentService, isDegradedResponse } from './agent.service';
import { AgentToolRegistry } from './tools/agent-tool-registry.service';
import { ESCALATE_TOOL } from './tools/agent-tool.interface';
import { AudioTranscriberService } from './audio-transcriber.service';
import { BotConfigCacheService } from './bot-config-cache.service';
import { MainMenuService } from './main-menu.service';
import { AccountChoiceService } from './account-choice.service';
import { Conversation } from '../../database/entities/conversation.entity';
import { MessageSource } from '../../database/entities/message.entity';
import { MessageContext } from './pipeline/message-context';
import { MessageHandler, MESSAGE_PIPELINE } from './pipeline/message-handler';
import { MessageSenderService } from './pipeline/message-sender.service';
import { MessagePersistenceService } from './pipeline/message-persistence.service';
import { parseGoogleMapsUrl, extractGoogleMapsShortLink } from '../coverage/location-parser.util';
import { GoogleMapsLinkResolverService } from '../coverage/google-maps-link-resolver.service';
import { IIntentMapper, INTENT_MAPPER } from './intents/intent-mapper.interface';
import { InteractiveIdCodec } from './intents/interactive-id.codec';
import { CsatRecorderService } from './csat-recorder.service';
import { detectarIntencionNegocio } from './domain/business-intent-router';
import { IInstallationRepository, INSTALLATION_REPOSITORY } from '../client/sistema-api.interfaces';
import { ProcedureRunnerService } from './procedure-runner.service';
import { ProcedureActionsService } from './procedure-actions.service';
import { FirstContactPolicy } from './pipeline/first-contact.policy';
import { BotEventRecorderService } from '../monitoring/bot-event-recorder.service';
import { ProcessingIndicatorService } from './processing-indicator.service';
import { geminiTelemetry } from '../ai/gemini-telemetry';


export interface IncomingMessage {
  from: string;
  messageId: string;
  type: string;
  text?: string;
  interactiveId?: string;
  imageId?: string;
  imageCaption?: string;
  audioId?: string;
  locationLat?: number;
  locationLng?: number;
  locationName?: string;
  locationAddress?: string;
  contactName?: string;
}


@Injectable()
export class BotOrchestratorService {
  private readonly logger = new Logger(BotOrchestratorService.name);

  constructor(
    @Inject(MESSAGE_PIPELINE) private readonly pipeline: MessageHandler[],
    private readonly session:              SessionService,
    private readonly whatsapp:             WhatsappApiService,
    private readonly adminNotifier:        AdminSignalrNotifierService,
    private readonly agent:                AgentService,
    private readonly toolRegistry:         AgentToolRegistry,
    private readonly audioTranscriber:     AudioTranscriberService,
    private readonly botConfigCache:       BotConfigCacheService,
    private readonly sender:               MessageSenderService,
    private readonly persistence:          MessagePersistenceService,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @Inject(INTENT_MAPPER) private readonly intentMapper: IIntentMapper,
    private readonly firstContactPolicy: FirstContactPolicy,
    private readonly eventRecorder: BotEventRecorderService,
    private readonly indicator: ProcessingIndicatorService,
    private readonly mainMenu: MainMenuService,
    private readonly accountChoice: AccountChoiceService,
    private readonly interactiveIdCodec: InteractiveIdCodec,
    private readonly mapsLinkResolver: GoogleMapsLinkResolverService,
    private readonly csatRecorder: CsatRecorderService,
    private readonly procedimiento: ProcedureRunnerService,
    private readonly accionesProc: ProcedureActionsService,
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
  ) {}

  /**
   * Muestra un bloque del procedimiento y ejecuta sus acciones.
   *
   * Las acciones corren ANTES de mandar el mensaje: asi el numero de ticket que
   * lee el cliente corresponde a un ticket que existe. Si algo falla, el texto
   * lo dice en vez de anunciar algo que no ocurrio.
   */
  private async avanzarProcedimiento(
    clave: string, session: SessionData, textoCliente: string,
  ): Promise<void> {
    const paso = await this.procedimiento.ir(clave, session);
    if (!paso) {
      this.logger.warn(`Procedimiento: bloque "${clave}" no encontrado para ${maskPhone(session.phoneNumber)}`);
      await this.sender.send(session, 'No pude continuar con el diagnóstico. Te paso con un agente.');
      await this.triggerEscalation(session, !session.humanAvailable);
      return;
    }

    const res = paso.acciones.length
      ? await this.accionesProc.ejecutar(paso.acciones, session, textoCliente)
      : { extra: '', lista: undefined, ok: true };

    const texto = [paso.texto, res.extra].filter(Boolean).join('\n\n');

    // Un bloque terminal (sin botones ni lista) cierra el procedimiento.
    const sigueAbierto = paso.botones.length > 0 || !!res.lista;
    await this.session.patchSession(session.phoneNumber, {
      procedimientoActual: sigueAbierto ? { clave: paso.clave, at: Date.now() } : null,
    });

    if (res.lista) {
      await this.sender.sendWithList(session, texto, res.lista as any);
    } else if (paso.botones.length > 0) {
      await this.sender.sendWithQuickReplies(session, texto, paso.botones);
    } else {
      await this.sender.send(session, texto);
    }
  }

  /**
   * "📅 Instalacion": muestra la que ya tiene, o arranca el alta. Sin Gemini.
   */
  private async mostrarOAgendarInstalacion(session: SessionData): Promise<void> {
    let inst: Record<string, unknown> | null = null;
    try {
      const id = session.activeInstallationId
        ?? await this.installationRepo.findScheduledInstallationByPhone(session.phoneNumber);
      if (id) inst = await this.installationRepo.getInstallationById(id) as any;
    } catch (err: unknown) {
      // Si falla la consulta seguimos por el alta: pedir la ubicacion nunca
      // esta de mas, y colgar al cliente por un problema nuestro, si.
      this.logger.warn(`No se pudo consultar la instalación de ${maskPhone(session.phoneNumber)}: ${(err as Error).message}`);
    }

    const vigente = inst && !['Completada', 'Cancelada', 'NoRealizada'].includes(String(inst['Status']));
    if (!vigente) {
      await this.sender.send(session,
        'Perfecto, vamos a agendar tu instalación. 🛠️\n\n' +
        'Para empezar, compartime la ubicación donde querés el servicio ' +
        '(podés mandar tu ubicación de WhatsApp o un enlace de Google Maps).');
      return;
    }

    const texto =
      `Ya tenés una instalación agendada:\n\n` +
      `• *Fecha*: ${inst!['Fecha']} a las ${inst!['HoraInicio']}\n` +
      (inst!['PlanNombre'] ? `• *Plan*: ${inst!['PlanNombre']}\n` : '') +
      (inst!['Direccion']  ? `• *Dirección*: ${inst!['Direccion']}\n` : '') +
      `\n¿Qué querés hacer?`;

    // La etiqueta dice "Cancelar cita", no "Cancelar", porque "❌ Cancelar" ya
    // significa lo contrario en los turnos de confirmación ("no sigas con esta
    // operación"). El mismo cliente ve las dos en la misma conversación.
    await this.sender.sendWithQuickReplies(session, texto, [
      { id: 'reagendar_instalacion', title: '📅 Reprogramar' },
      { id: 'cancelar_instalacion',  title: '❌ Cancelar cita' },
    ]);
  }

  /** Muestra los horarios reales para reprogramar, en vez de pedirlos escritos. */
  private async ofrecerHorariosDeReprogramacion(session: SessionData): Promise<void> {
    const slots = await this.toolRegistry.ejecutarSuelta('get_installation_slots', {}, session);
    const lista = (slots as Record<string, unknown>)?.['_list'];

    if (!lista) {
      await this.sender.send(session,
        'No pude traer los horarios disponibles en este momento. ' +
        'Probá de nuevo en un rato, o te paso con un agente.');
      return;
    }
    await this.sender.sendWithList(session,
      'Elegí el nuevo horario para tu instalación:', lista as any);
  }

  async handleIncoming(incoming: IncomingMessage): Promise<void> {
    await this.executeFullPipeline(incoming);
  }

  private async executeFullPipeline(incoming: IncomingMessage): Promise<void> {
    const ctx: MessageContext = {
      phone:           incoming.from,
      messageId:       incoming.messageId,
      type:            incoming.type,
      text:            incoming.text,
      interactiveId:   incoming.interactiveId,
      imageId:         incoming.imageId,
      imageCaption:    incoming.imageCaption,
      audioId:         incoming.audioId,
      locationLat:     incoming.locationLat,
      locationLng:     incoming.locationLng,
      locationName:    incoming.locationName,
      locationAddress: incoming.locationAddress,
      humanAvailable:  false,
    };

    let index = 0;
    const run = async (): Promise<void> => {
      if (index < this.pipeline.length) {
        await this.pipeline[index++].handle(ctx, run);
      } else {
        // Paso 5 (PLAN_OPTIMIZACION_GEMINI): cuenta las llamadas a Gemini
        // atribuibles al turno (agente, RAG, audio y también el sentimiento —
        // aunque es fire-and-forget, se despacha dentro de este scope y su
        // record() corre durante el await del agente, por lo que SÍ se cuenta).
        // Verificado en prod: turno sin herramienta = 2 (sentimiento + agente).
        const { calls } = await geminiTelemetry.run(() => this.processCoreLogic(ctx));
        if (calls > 0) {
          this.logger.log(JSON.stringify({
            event: 'gemini_calls_per_turn', phone: maskPhone(ctx.phone), calls,
          }));
        }
      }
    };
    await run();
  }

  private async processCoreLogic(ctx: MessageContext): Promise<void> {
    const session = ctx.updatedSession!;
    session.humanAvailable = ctx.humanAvailable;

    if (ctx.type === 'image' && ctx.imageId) {
      const imageCaption = ctx.imageCaption?.trim();
      if (!imageCaption) {
        await this.triggerEscalation(session, !session.humanAvailable);
        return;
      }
    }

    let effectiveText: string | null | undefined;
    // ¿El turno viene de un id que YA trae su significado resuelto (un plan, un
    // horario, una cuenta)? Si es así, no hay texto libre que interpretar y la
    // detección de procedimiento no tiene nada que decidir — ver más abajo.
    let significadoResuelto = false;
    if (ctx.interactiveId) {
      // El id puede llevar sufijo '#<Id>' (deduplicación de filas del menú)
      const baseId = ctx.interactiveId.split('#')[0];
      // PASO 8: antes de preguntarle al mapeador estático (que solo conoce
      // ~20 ids fijos), intentar decodificar un id dinámico (plan/slot) — si
      // no es ninguno de los dos, decoded.kind es 'static' y se resuelve
      // exactamente igual que antes.
      const decoded = this.interactiveIdCodec.decode(baseId);
      // FASE C2 (2026-08-07): el título de la fila que tocó el cliente ("COBRE
      // 20MB", "Martes 11/08 12:20") ya viene en el webhook y llega hasta acá,
      // pero se descartaba: al modelo solo se le narraba el UUID.
      //
      // Consecuencia medida en producción: el cliente tocó COBRE (Bs. 89) y el
      // bot le confirmó "has elegido PLATINO de 200 Mbps por Bs. 399/mes",
      // mientras el sistema agendaba COBRE. El modelo no tenía forma de mapear
      // UUID → nombre: el resultado de get_installation_plans (que sí trae
      // id + name) no sobrevive al turno, porque la sesión guarda solo texto.
      //
      // Regla general: nunca pasarle un identificador al modelo sin su etiqueta
      // legible al lado. El nombre lo acierta siempre; el UUID lo inventa.
      const etiqueta = ctx.text?.trim();
      // plan / slot / account traen el dato ya resuelto por el codec. No son
      // texto libre: el cliente tocó una fila que nosotros generamos.
      significadoResuelto = ['plan', 'slot', 'account'].includes(decoded.kind);
      if (decoded.kind === 'plan') {
        effectiveText = etiqueta
          ? `El cliente eligió el plan "${etiqueta}" (id ${decoded.planId}).`
          : `El cliente eligió el plan con id ${decoded.planId}.`;
        // Auditoría 2026-08: además de narrarlo en texto (que el modelo debe
        // "recordar" varios turnos después al llamar create_installation),
        // se guarda en sesión como fuente de verdad — ver selectedPlanId en
        // session.service.ts. El modelo repetidamente inventaba un plan_id
        // parecido al nombre visible del plan en vez de copiar este UUID.
        await this.session.patchSession(ctx.phone, { selectedPlanId: decoded.planId });
      } else if (decoded.kind === 'slot') {
        // C2: mismo criterio — la etiqueta ("Martes 11/08 12:20") es lo que el
        // cliente vio y lo que el bot debe repetirle al confirmar.
        effectiveText = etiqueta
          ? `El cliente eligió el horario "${etiqueta}" (${decoded.date} ${decoded.time}).`
          : `El cliente eligió el horario ${decoded.date} ${decoded.time}.`;
      } else if (decoded.kind === 'proc') {
        // Camino determinista: el procedimiento NO pasa por el modelo. El
        // documento define el texto, los botones y las acciones; acá solo se
        // ejecuta lo que declara.
        await this.avanzarProcedimiento(decoded.clave, session, ctx.text ?? '');
        return;
      } else if (baseId === 'reagendar_instalacion') {
        // Los horarios se MUESTRAN, no se piden de memoria.
        //
        // Medido en produccion (2026-08-07): el bot dijo "indicame la nueva
        // fecha y hora", el cliente escribio "Mañana", y el backend rechazo el
        // 08/08 10:00 porque no era un horario disponible. Terminó en "hubo un
        // problema" tras dos turnos, cuando la lista de horarios reales estaba
        // a una consulta de distancia.
        await this.ofrecerHorariosDeReprogramacion(session);
        return;
      } else if (baseId === 'solicitar_instalacion') {
        // Bifurcacion decidida con DATOS, no por el modelo.
        //
        // El boton significaba "agendar o consultar" y el modelo elegia. Al
        // quitarle el "consultar" para desambiguarlo, quedo sin regla para el
        // caso de quien YA tiene una — y lleno el hueco escalando a un agente
        // con un motivo inventado ("el cliente solicito hablar con una
        // persona", cuando solo habia tocado un boton).
        //
        // No es ambiguedad: es un `if`. El codigo sabe si hay instalacion.
        await this.mostrarOAgendarInstalacion(session);
        return;
      } else if (decoded.kind === 'csat') {
        // Camino determinista: NO pasa por el modelo.
        //
        // Medido en producción (2026-08-07): el cliente tocó el botón, el
        // `csat:N` llegó perfecto y el turno murió con un 429 de Gemini. La
        // calificación se perdió. El id ya trae la nota resuelta — no hay nada
        // que interpretar, así que no tiene por qué depender del LLM.
        const res = await this.csatRecorder.record(session, decoded.score);
        await this.sender.send(session, res.mensaje);
        return;
      } else if (decoded.kind === 'account') {
        const elegido = await this.resolveAccountChoice(ctx.phone, session, decoded.clientId);
        if (!elegido) {
          // El id no corresponde a ninguna opción vigente (lista vieja, ya
          // resuelta, o botón de otra conversación) — se vuelve a preguntar.
          await this.accountChoice.sendChoices(session);
          return;
        }
        effectiveText = `El cliente confirmó continuar con el servicio ${elegido.tbnCode}.`;
      } else {
        effectiveText = this.intentMapper.resolve(baseId) ?? baseId;
      }
    } else if (ctx.type === 'audio') {
      effectiveText = await this.handleAudioBuffer(ctx.audioBuffer, session);
    } else if (ctx.type === 'location') {
      effectiveText = ctx.userContent;
    } else if (ctx.type === 'image') {
      effectiveText = ctx.imageCaption;
    } else {
      effectiveText = ctx.text;
    }

    if (!effectiveText?.trim()) return;

    // 2026-08-05: hay una elección de cuenta pendiente (teléfono con más de
    // un cliente asociado) que este turno no resolvió — se re-muestra la
    // lista antes que nada más (menú de bienvenida incluido, que además
    // mostraría un saludo genérico de prospecto con la identidad sin resolver).
    if (session.ambiguousClients && session.ambiguousClients.length > 0) {
      await this.accountChoice.sendChoices(session);
      return;
    }

    if (ctx.type !== 'location' && effectiveText) {
      let mapsCoords = parseGoogleMapsUrl(effectiveText);
      if (!mapsCoords) {
        const shortLink = extractGoogleMapsShortLink(effectiveText);
        if (shortLink) {
          const resolvedUrl = await this.mapsLinkResolver.resolveShortLink(shortLink);
          mapsCoords = resolvedUrl ? parseGoogleMapsUrl(resolvedUrl) : null;
        }
      }
      if (mapsCoords) {
        await this.session.patchSession(ctx.phone, {
          lastLocation:       { lat: mapsCoords.lat, lng: mapsCoords.lng },
          locationCapturedAt: Date.now(),
          locationSource:     'google_maps',
        });
        effectiveText =
          `Compartí mi ubicación de Google Maps: ` +
          `latitud ${mapsCoords.lat.toFixed(6)}, longitud ${mapsCoords.lng.toFixed(6)}`;
        this.logger.log(
          `Google Maps URL detectado — ${maskPhone(ctx.phone)}: (${mapsCoords.lat}, ${mapsCoords.lng})`,
        );
      }
    }

    const fullHistory = await this.session.getGeminiHistory(ctx.phone);
    const history     = fullHistory.slice(0, -1);

    const lastBotMsg = history.filter(m => m.role === 'model').at(-1)?.parts?.[0]?.text;
    this.agent.detectSentiment(effectiveText, lastBotMsg)
      .then((sentiment) => this.session.updateSentiment(ctx.phone, sentiment))
      .catch((err: unknown) => {
        this.logger.warn(`Sentimiento ${maskPhone(ctx.phone)}: ${(err as Error)?.message ?? String(err)}`);
      });

    if (ctx.isFirstContact) {
      await this.mainMenu.sendWelcome(session);
      // BUG-4: si el primer mensaje trae contenido accionable (GPS, imagen,
      // consulta real), se procesa en el mismo turno en vez de descartarlo.
      if (!this.firstContactPolicy.hasActionableContent(ctx)) return;
    } else if (this.firstContactPolicy.isBareGreeting(ctx)) {
      // PASO 6B: un saludo suelto en cualquier punto de la conversación
      // vuelve a mostrar el menú con botones — antes esto solo pasaba en el
      // primer contacto y luego el LLM narraba las opciones en texto plano.
      await this.mainMenu.sendWelcome(session);
      return;
    }

    // ── Intención de negocio evidente ───────────────────────────────────────
    // Medido en producción: "Hola quiero realizar la instalación" -> el modelo
    // ejecutó send_payment_qr. Entendió la frase; se equivocó al elegir entre
    // 25 herramientas. Cuando la intención es inequívoca, no se le pregunta.
    //
    // El router devuelve null ante cualquier duda —dos coincidencias, mensaje
    // largo, pregunta informativa— y ahí sí decide el modelo, que es donde
    // rinde.
    if (ctx.type === 'text' && effectiveText) {
      const intencion = detectarIntencionNegocio(effectiveText);
      if (intencion === 'instalacion') {
        this.logger.log(JSON.stringify({
          event: 'intencion_negocio_ruteada', intencion, phone: maskPhone(ctx.phone),
        }));
        await this.mostrarOAgendarInstalacion(session);
        return;
      }
    }

    // ── Procedimiento guiado ────────────────────────────────────────────────
    // Se decide ANTES de invocar al agente: si el mensaje abre un procedimiento
    // definido en un documento, el recorrido lo hace el código y Gemini queda
    // fuera. Es lo que hace determinista al flujo — se midió que el RAG por
    // similitud no puede secuenciar pasos (2 de 6).
    // No se exige que sea texto libre: el botón "🔧 Soporte técnico" del menú
    // llega como id interactivo estático y también tiene que abrir el flujo.
    // Medido en producción: con la restricción a texto, ese botón caía al
    // camino viejo y el RAG parafraseaba el bloque de entrada sin botones.
    //
    // Es seguro para cualquier otro id: la detección se protege sola con el
    // umbral, y "el cliente eligió el plan COBRE" no se parece a ninguna
    // entrada de procedimiento.
    //
    // Excepción (2026-08-08): si el id ya traía su significado resuelto
    // (plan/slot/account), no se evalúa la entrada. `detectarEntrada` calcula un
    // embedding — una llamada a Gemini — y acá no hay nada que decidir: el
    // cliente tocó una fila que generamos nosotros y el texto que llega es una
    // frase nuestra ("El cliente eligió el horario ..."), no algo que escribió.
    //
    // Medido en producción: el cliente tocó la fila "Martes 11/08 12:20" y se
    // gastó un embedding para concluir `arranca: false, similitud: 0.502`. Ese
    // gasto se repite en cada toque, y el turno siguiente murió con un 429
    // RESOURCE_EXHAUSTED de Vertex AI. Íbamos a 3-4 llamadas por turno.
    //
    // El botón "🔧 Soporte técnico" NO se ve afectado: es un id estático del
    // menú, no del codec, así que sigue evaluándose como hasta ahora.
    if (effectiveText && !significadoResuelto) {
      const enCurso = this.procedimiento.enCurso(session);
      // Ya está adentro y escribió en vez de tocar. Medido en producción: el
      // cliente escribió "Rojo" en lugar de tocar 🔴 Roja y el procedimiento se
      // perdió. Si el texto mapea a una rama, se avanza; si no, sigue el agente
      // (responde la consulta suelta) y el procedimiento queda esperando.
      if (enCurso) {
        const rama = await this.procedimiento.resolverRespuesta(session, effectiveText);
        if (rama) {
          await this.avanzarProcedimiento(rama, session, effectiveText);
          return;
        }
      }
      if (!enCurso) {
        const entrada = await this.procedimiento.detectarEntrada(effectiveText, session);
        if (entrada) {
          await this.avanzarProcedimiento(entrada, session, effectiveText);
          return;
        }
      }
    }

    const {
      executor, getMediaSent, isSuppressed, hasMutationSucceeded,
      getQuickReplies, getList, getRagChunkId, hasPendingConfirmation,
      hasStateReadBacking, hasEscalated, hasToolError,
      getConfirmationState,
    } = this.toolRegistry.buildExecutor(session);
    const toolDeclarations            = this.toolRegistry.getDeclarations();

    const cfg = await this.botConfigCache.getConfig();
    const noEntendidoCtx = `Si no entiendes la consulta del usuario, responde EXACTAMENTE: "${cfg.Mensajes.NoEntendido}"`;

    let response: string;
    let toolsCalled: string[];
    const runStartMs = Date.now();

    // MEJORA-1B: typing "escribiendo…" + aviso interino si el LLM tarda >umbral
    const stopIndicator = this.indicator.begin(ctx.phone, ctx.messageId);
    try {
      ({ response, toolsCalled } = await this.agent.run(
        effectiveText, session, history, executor, toolDeclarations, noEntendidoCtx,
        { hasMutationSucceeded, hasPendingConfirmation, hasToolError, hasStateReadBacking },
      ));
    } catch (err) {
      this.logger.error(`AgentService.run error: ${(err as Error).message}`);
      response    = '😔 Tuve un problema procesando tu consulta. Por favor intenta de nuevo.';
      toolsCalled = [];
    } finally {
      stopIndicator();
    }

    // FASE G2 (2026-08-07): el resumen de confirmación vale SOLO para el turno
    // siguiente. Si este turno emitió uno, se guarda; si no lo emitió ni lo
    // consumió, se invalida el que hubiera quedado de antes.
    //
    // Sin esta caducidad, un resumen mostrado y nunca confirmado seguía siendo
    // válido indefinidamente: en producción el cliente vio un resumen de
    // cancelación, se fue a hacer otras cosas, y tres minutos y varios turnos
    // después el modelo mandó confirmado:true y la instalación se canceló.
    const confirmacion = getConfirmationState();
    if (confirmacion.emitido) {
      await this.session.patchSession(ctx.phone, { pendingConfirmation: confirmacion.emitido });
    } else if (session.pendingConfirmation) {
      await this.session.patchSession(ctx.phone, { pendingConfirmation: null });
    }

    for (const media of getMediaSent()) {
      await this.persistence.persistMessage(
        session, 'bot', '[imagen]', MessageSource.INTENT,
        undefined, media.localUrl, media.mediaType,
      );
    }

    if (!isSuppressed()) {
      // MEJORA-1C: si alguna herramienta ofreció botones, la respuesta sale
      // con quick-replies; si se suprimió la respuesta, la herramienta ya
      // envió su propio mensaje y los botones se descartan. Tampoco se
      // adjuntan a un fallback de error (el usuario no vio el contenido
      // al que los botones responden).
      // PASO 8: mismo criterio, para listas dinámicas (planes, horarios) —
      // una lista tiene prioridad sobre botones si una tool ofreciera ambos
      // en el mismo turno (no debería pasar hoy, pero define un orden claro).
      const list = getList();
      const quickReplies = getQuickReplies();
      // FASE B2: si la respuesta se apoyó en la base de conocimiento, el id del
      // chunk viaja hasta `messages.chunk_id`. Es lo que permite responder
      // "¿este documento se está usando?" con una consulta, en vez de cruzar
      // logs a mano.
      const chunkId = getRagChunkId() ?? undefined;
      if (list && !isDegradedResponse(response)) {
        await this.sender.sendWithList(session, response, list, MessageSource.AGENT, chunkId);
      } else if (quickReplies.length > 0 && !isDegradedResponse(response)) {
        await this.sender.sendWithQuickReplies(session, response, quickReplies, MessageSource.AGENT, chunkId);
      } else {
        await this.sender.send(session, response, MessageSource.AGENT, chunkId);
      }
    }

    // MEJORA-1A: métricas por turno (fire-and-forget, nunca bloquea la respuesta)
    this.eventRecorder.recordAgentRun({
      phoneNumber:    ctx.phone,
      toolsCalled,
      durationMs:     Date.now() - runStartMs,
      responseLength: response.length,
      sentiment:      session.lastSentiment,
    });

    // No alcanza con que el modelo la haya nombrado: la escalación tiene que
    // haber ocurrido. Ver hasEscalated en el registry.
    if (hasEscalated()) {
      const deferred = !session.humanAvailable;
      // BUG-11: la respuesta del agente ya informó la transferencia al cliente;
      // solo se envía el mensaje de sistema si esa respuesta fue suprimida.
      await this.triggerEscalation(session, deferred, isSuppressed());
    }
  }

  /**
   * 2026-08-05: resuelve la elección de cuenta cuando el cliente toca uno de
   * los botones de AccountChoiceService (teléfono con más de un cliente
   * asociado). Devuelve la cuenta elegida si el id coincide con una opción
   * vigente en session.ambiguousClients (null si no — lista vieja, botón de
   * otra conversación, etc.). Actualiza tanto Redis como el objeto `session`
   * en memoria para que el resto de este mismo turno (menú, prompt, tools)
   * ya vea la identidad resuelta.
   */
  private async resolveAccountChoice(
    phone: string, session: SessionData, clientId: string,
  ): Promise<{ clientId: string; tbnCode: string } | null> {
    const opciones = session.ambiguousClients ?? [];
    const elegido   = opciones.find(c => c.clientId === clientId);
    if (!elegido) return null;

    await this.session.setClientData(phone, {
      clientId:           elegido.clientId,
      clientName:         elegido.clientName,
      clientStatus:       elegido.clientStatus,
      planId:             elegido.planId,
      planName:           elegido.planName,
      totalDebt:          elegido.totalDebt,
      tbnCode:            elegido.tbnCode,
      identityVerifiedAt: Date.now(),
    });
    await this.session.updateSession(phone, { ambiguousClients: null });

    const fresh = await this.session.getSession(phone);
    Object.assign(session, fresh);

    return { clientId: elegido.clientId, tbnCode: elegido.tbnCode };
  }

  private async handleAudioBuffer(audioBuffer: Buffer | null | undefined, session: SessionData): Promise<string | null> {
    // BUG-01: audioBuffer null = fallo TÉCNICO de descarga/almacenamiento del
    // medio (p.ej. storage caído). NO escalar por un fallo transitorio: pedir
    // que lo escriban por texto. (Antes cada nota de voz con storage caído
    // generaba una escalación innecesaria.)
    if (!audioBuffer) {
      await this.sender.send(
        session,
        '🎤 No pude procesar tu nota de voz por un problema técnico. ¿Me lo escribes por texto, por favor?',
        MessageSource.SYSTEM,
      );
      return null;
    }

    const transcript = await this.audioTranscriber.transcribeBuffer(audioBuffer, 'audio/ogg; codecs=opus');
    if (!transcript) {
      // El audio llegó pero es inaudible → escalar a un humano sí es razonable.
      await this.sender.send(
        session,
        '🎤 No pude transcribir tu nota de voz. Te voy a conectar con un agente para que pueda ayudarte. 👤',
        MessageSource.SYSTEM,
      );
      await this.triggerEscalation(session, !session.humanAvailable);
      return null;
    }

    return transcript;
  }

  async triggerEscalation(session: SessionData, deferred = false, notifyUser = true): Promise<void> {
    const cfg = await this.botConfigCache.getConfig();

    if (deferred) {
      if (notifyUser) {
        await this.whatsapp.sendText(session.phoneNumber, cfg.Horario.MensajeFueraHorario);
      }
      this.logger.log(JSON.stringify({
        event: 'escalation_deferred', phone: session.phoneNumber,
        clientName: session.clientName,
      }));
    } else {
      if (notifyUser) {
        await this.whatsapp.sendText(session.phoneNumber, cfg.Mensajes.EscaladoAgente);
      }
      await this.adminNotifier.notifyEscalation({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? undefined,
        reason:      'Escalado via agente IA',
      });
    }

    await this.session.escalate(session.phoneNumber);

    let summary = '';
    try {
      const history = await this.session.getGeminiHistory(session.phoneNumber);
      summary = await this.agent.summarizeConversation(history);
    } catch (err) {
      this.logger.warn(`No se pudo generar resumen de escalación: ${(err as Error).message}`);
    }

    await this.convRepo.update(
      { phoneNumber: session.phoneNumber },
      { isEscalated: true, escalatedAt: new Date(), ...(summary ? { summary } : {}) },
    );

    this.logger.log(JSON.stringify({
      event: 'escalation_triggered', phone: session.phoneNumber,
      clientName: session.clientName, deferred, hasSummary: !!summary,
    }));
  }

}
