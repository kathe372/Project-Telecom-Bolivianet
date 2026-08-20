import { AgentToolRegistry } from './agent-tool-registry.service';
import { ActionConfirmationGuard } from '../guards/action-confirmation.guard';
import { AgentTool } from './agent-tool.interface';
import { SessionData } from '../../session/session.service';


const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  phoneNumber:         '59170000001',
  clientId:            null,
  clientName:          null,
  clientStatus:        null,
  planId:              null,
  planName:            null,
  totalDebt:           0,
  tbnCode:             null,
  activeTicketId:      null,
  activeInstallationId: null,
  pendingAction:       null,
  pendingTechIssue:    null,
  pendingCsatTicketId: null,
  isEscalated:         false,
  lastSentiment:       'neutral',
  angryCount:          0,
  lastLocation:        null,
  pendingImageId:      null,
  pendingImageCaption: null,
  messages:            [],
  ...overrides,
});


function makeTool(
  name: string,
  opts: { requiresId?: boolean; result?: unknown } = {},
): AgentTool {
  return {
    getName:                 () => name,
    requiresIdentification: () => opts.requiresId ?? false,
    getDeclaration:          () => ({ name, description: `stub ${name}` }),
    execute:                 jest.fn().mockResolvedValue(opts.result ?? { ok: true }),
  };
}


describe('AgentToolRegistry', () => {

  it('registra todas las herramientas por nombre', () => {
    const t1 = makeTool('tool_a');
    const t2 = makeTool('tool_b');
    const registry = new AgentToolRegistry([t1, t2], new ActionConfirmationGuard());

    const decls = registry.getDeclarations();

    expect(decls).toHaveLength(2);
    expect(decls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tool_a' }),
        expect.objectContaining({ name: 'tool_b' }),
      ]),
    );
  });

  it('getDeclarations retorna el mismo objeto que getDeclaration() del tool', () => {
    const tool = makeTool('my_tool');
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());

    expect(registry.getDeclarations()[0]).toEqual(tool.getDeclaration());
  });


  it('executor llama al tool correcto con los args dados', async () => {
    const tool = makeTool('get_debt', { result: { totalDebt: 150 } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    const result = await executor('get_debt', { foo: 'bar' });

    expect(tool.execute).toHaveBeenCalledWith({ foo: 'bar' }, expect.objectContaining({ clientId: 'C-001' }));
    expect(result).toEqual({ totalDebt: 150 });
  });

  it('executor lanza Error para herramienta desconocida', async () => {
    const registry = new AgentToolRegistry([makeTool('known_tool')], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession());

    await expect(executor('ghost_tool', {})).rejects.toThrow('Herramienta desconocida: ghost_tool');
  });


  it('retorna error uniforme si el tool requiere ID y session.clientId es null', async () => {
    const tool = makeTool('secure_tool', { requiresId: true });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession({ clientId: null }));

    const result = await executor('secure_tool', {});

    expect(result).toEqual({ error: expect.stringContaining('identif') });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('ejecuta el tool si requiere ID y el cliente está identificado', async () => {
    const tool = makeTool('secure_tool', { requiresId: true, result: { data: 'ok' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession({ clientId: 'C-123' }));

    const result = await executor('secure_tool', {});

    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: 'ok' });
  });

  it('ejecuta el tool sin ID si no lo requiere', async () => {
    const tool = makeTool('public_tool', { requiresId: false });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession({ clientId: null }));

    await executor('public_tool', {});

    expect(tool.execute).toHaveBeenCalledTimes(1);
  });


  it('getMediaSent acumula imágenes devueltas con _localUrl', async () => {
    const tool = makeTool('img_tool', { result: { _localUrl: '/uploads/img.jpg', ok: true } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getMediaSent } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('img_tool', {});

    expect(getMediaSent()).toEqual([
      { localUrl: '/uploads/img.jpg', mediaType: 'image' },
    ]);
  });

  it('getMediaSent acumula múltiples imágenes de llamadas sucesivas', async () => {
    const tool = makeTool('img_tool', { result: { _localUrl: '/img/a.jpg' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getMediaSent } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('img_tool', {});
    await executor('img_tool', {});

    expect(getMediaSent()).toHaveLength(2);
  });

  it('getMediaSent está vacío cuando no hay _localUrl en la respuesta', async () => {
    const tool = makeTool('text_tool', { result: { message: 'sin imagen' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getMediaSent } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('text_tool', {});

    expect(getMediaSent()).toHaveLength(0);
  });


  it('cada llamada a buildExecutor crea un mediaSent independiente', async () => {
    const tool = makeTool('img_tool', { result: { _localUrl: '/img/x.jpg' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());

    const { executor: ex1, getMediaSent: ms1 } = registry.buildExecutor(makeSession({ clientId: 'C-1' }));
    const { executor: _ex2, getMediaSent: ms2 } = registry.buildExecutor(makeSession({ clientId: 'C-2' }));

    await ex1('img_tool', {});

    expect(ms1()).toHaveLength(1);
    expect(ms2()).toHaveLength(0);
  });


  // ── PASO 3: _suppressResponse dividido en _mediaDelivered / _noOp ──────────

  it('PASO 3: _noOp NO suprime la respuesta del turno', async () => {
    const tool = makeTool('dedup_tool', { result: { deduped: true, _noOp: true } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, isSuppressed } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('dedup_tool', {});

    expect(isSuppressed()).toBe(false);
  });

  it('PASO 3: _mediaDelivered SÍ suprime la respuesta del turno', async () => {
    const tool = makeTool('media_tool', { result: { sent: true, _mediaDelivered: true } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, isSuppressed } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('media_tool', {});

    expect(isSuppressed()).toBe(true);
  });

  it('PASO 3: _suppressResponse (campo viejo) sigue suprimiendo — retrocompatibilidad', async () => {
    const tool = makeTool('legacy_tool', { result: { sent: true, _suppressResponse: true } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, isSuppressed } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('legacy_tool', {});

    expect(isSuppressed()).toBe(true);
  });

  it('PASO 3: sin ninguna de las dos banderas, no suprime (comportamiento normal)', async () => {
    const tool = makeTool('normal_tool', { result: { data: 'ok' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, isSuppressed } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('normal_tool', {});

    expect(isSuppressed()).toBe(false);
  });


  // ── PASO 8: getList (_list) ─────────────────────────────────────────────

  it('PASO 8: getList devuelve null cuando ningún tool ofreció una lista', async () => {
    const tool = makeTool('text_tool', { result: { data: 'ok' } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getList } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('text_tool', {});

    expect(getList()).toBeNull();
  });

  it('PASO 8: getList expone la lista devuelta por el tool en _list', async () => {
    const list = { buttonLabel: 'Ver planes', sections: [{ title: 'Planes', rows: [{ id: 'plan:1', title: 'Plan A' }] }] };
    const tool = makeTool('list_tool', { result: { available: true, _list: list } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getList } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('list_tool', {});

    expect(getList()).toEqual(list);
  });

  // Los tres tests de arriba miran getList() — el lado del orquestador. Ninguno
  // miraba lo que el executor le DEVUELVE al modelo, y ahí estaba la fuga:
  // el JSON de la lista llegaba al cliente pegado debajo del texto porque el
  // modelo lo veía en el resultado y lo copiaba.
  it('el modelo NO recibe _list, pero el orquestador sí', async () => {
    const list = { buttonLabel: 'Ver planes', sections: [{ title: 'Planes', rows: [{ id: 'plan:1', title: 'COBRE' }] }] };
    const tool = makeTool('list_tool', { result: { covered: 'true', _list: list } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor, getList } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    const paraElModelo = await executor('list_tool', {}) as Record<string, unknown>;

    expect(paraElModelo['_list']).toBeUndefined();
    expect(paraElModelo['covered']).toBe('true');   // los datos siguen ahí
    expect(getList()).toEqual(list);                // el canal sigue funcionando
  });

  it('tampoco lo recibe en la segunda llamada del turno, servida por la caché', async () => {
    const list = { buttonLabel: 'Ver horarios', sections: [{ title: 'Horarios', rows: [{ id: 'slot:1', title: '09:00' }] }] };
    const tool = makeTool('get_installation_slots', { result: { available: true, _list: list } });
    const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('get_installation_slots', {});
    const segunda = await executor('get_installation_slots', {}) as Record<string, unknown>;

    // La caché guarda el resultado crudo y devuelve antes del saneo del final:
    // sin sanear también en esa salida, la fuga vuelve en cuanto el modelo
    // repite una herramienta de lectura.
    expect(segunda['_list']).toBeUndefined();
  });

  it('PASO 8: la última herramienta que ofrece _list define la del turno', async () => {
    const listA = { buttonLabel: 'A', sections: [{ title: 'A', rows: [{ id: 'a', title: 'A' }] }] };
    const listB = { buttonLabel: 'B', sections: [{ title: 'B', rows: [{ id: 'b', title: 'B' }] }] };
    const toolA = makeTool('tool_a', { result: { _list: listA } });
    const toolB = makeTool('tool_b', { result: { _list: listB } });
    const registry = new AgentToolRegistry([toolA, toolB], new ActionConfirmationGuard());
    const { executor, getList } = registry.buildExecutor(makeSession({ clientId: 'C-001' }));

    await executor('tool_a', {});
    await executor('tool_b', {});

    expect(getList()).toEqual(listB);
  });

  // ── FASE B2 (2026-08-07) — trazabilidad del RAG ───────────────────────────
  // search_knowledge_base ya devolvía `chunkId`, pero nadie lo recogía: el
  // orquestador enviaba la respuesta sin él y `messages.chunk_id` quedaba en
  // NULL incluso en los turnos donde el RAG SÍ había contestado. Era imposible
  // saber desde el sistema qué documento respondió.
  describe('B2 — chunkId del RAG', () => {
    it('expone el chunkId devuelto por search_knowledge_base', async () => {
      const tool = makeTool('search_knowledge_base', {
        result: { found: true, answer: 'En comodato.', chunkId: 'chunk-42', similarity: 0.88 },
      });
      const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
      const { executor, getRagChunkId } = registry.buildExecutor(makeSession());

      expect(getRagChunkId()).toBeNull();
      await executor('search_knowledge_base', { query: 'router' });
      expect(getRagChunkId()).toBe('chunk-42');
    });

    it('sin RAG en el turno, el chunkId queda en null', async () => {
      const tool = makeTool('get_client_debt', { result: { totalDebt: 150 } });
      const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
      const { executor, getRagChunkId } = registry.buildExecutor(makeSession({ clientId: 'C-1' }));

      await executor('get_client_debt', {});
      expect(getRagChunkId()).toBeNull();
    });

    it('un RAG sin resultado no inventa chunkId', async () => {
      const tool = makeTool('search_knowledge_base', { result: { found: false, message: 'no hay' } });
      const registry = new AgentToolRegistry([tool], new ActionConfirmationGuard());
      const { executor, getRagChunkId } = registry.buildExecutor(makeSession());

      await executor('search_knowledge_base', { query: 'x' });
      expect(getRagChunkId()).toBeNull();
    });
  });

});

// ── FASE G2 (2026-08-07) — la confirmación en dos pasos con estado real ──────
// Antes era solo una instrucción del prompt. Medido en producción: el modelo
// mandó `cancel_installation {motivo, confirmado:true}` en el MISMO turno en
// que el cliente dio el motivo, y la instalación se canceló de verdad sin que
// nadie confirmara — pese a estar prohibido en tres lugares del prompt.
describe('G2 — el paso 2 exige un paso 1 real', () => {
  const toolConPasos = (name: string) => ({
    getName:                () => name,
    requiresIdentification: () => false,
    isMutating:             () => true,
    getDeclaration:         () => ({ name }),
    execute: jest.fn(async (args: Record<string, unknown>) =>
      args.confirmado === true
        ? { cancelled: true, message: 'hecho' }
        : { cancelled: false, pending: true, message: '¿Confirmás?' }),
  });

  it('confirmado:true SIN resumen previo se rechaza y no toca el backend', async () => {
    const tool = toolConPasos('cancel_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession());

    const r: any = await executor('cancel_installation', { motivo: 'x', confirmado: true });

    expect(r.error).toContain('no hay ningún resumen pendiente');
    expect(r.error).toContain('ERROR TUYO');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('paso 1 y paso 2 en el MISMO turno no alcanzan (es el caso que rompió en producción)', async () => {
    const tool = toolConPasos('cancel_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const { executor } = registry.buildExecutor(makeSession());

    await executor('cancel_installation', { motivo: 'x' });                  // paso 1
    const r: any = await executor('cancel_installation', { motivo: 'x', confirmado: true });

    expect(r.error).toContain('no hay ningún resumen pendiente');
    expect(tool.execute).toHaveBeenCalledTimes(1);                           // solo el paso 1
  });

  it('con el resumen del turno anterior en sesión, el paso 2 procede', async () => {
    const tool = toolConPasos('cancel_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const sesion = makeSession({
      pendingConfirmation: { tool: 'cancel_installation', argsHash: 'x', at: Date.now() },
    } as any);
    const { executor, getConfirmationState } = registry.buildExecutor(sesion);

    const r: any = await executor('cancel_installation', { motivo: 'x', confirmado: true });

    expect(r.cancelled).toBe(true);
    expect(getConfirmationState().consumido).toBe(true);
  });

  it('un resumen de OTRA herramienta no sirve para confirmar esta', async () => {
    const tool = toolConPasos('cancel_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const sesion = makeSession({
      pendingConfirmation: { tool: 'schedule_ticket_visit', argsHash: 'x', at: Date.now() },
    } as any);
    const { executor } = registry.buildExecutor(sesion);

    const r: any = await executor('cancel_installation', { motivo: 'x', confirmado: true });

    expect(r.error).toContain('schedule_ticket_visit');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('un resumen viejo (>10 min) ya no vale', async () => {
    const tool = toolConPasos('cancel_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const sesion = makeSession({
      pendingConfirmation: {
        tool: 'cancel_installation', argsHash: 'x', at: Date.now() - 11 * 60_000,
      },
    } as any);
    const { executor } = registry.buildExecutor(sesion);

    const r: any = await executor('cancel_installation', { motivo: 'x', confirmado: true });

    expect(r.error).toContain('venció');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('el paso 1 expone el estado para que el orquestador lo persista', async () => {
    const tool = toolConPasos('create_installation');
    const registry = new AgentToolRegistry([tool as any], new ActionConfirmationGuard());
    const { executor, getConfirmationState } = registry.buildExecutor(makeSession());

    expect(getConfirmationState().emitido).toBeNull();
    await executor('create_installation', { fecha: '2026-08-11', hora: '10:00' });

    const emitido = getConfirmationState().emitido!;
    expect(emitido.tool).toBe('create_installation');
    expect(emitido.argsHash).toEqual(expect.any(String));
  });

  // 2026-08-07, medido en produccion: el cliente pregunto "¿el router es mio o
  // prestado?" y el bot respondio "voy a escalar tu consulta a un agente" SIN
  // llamar a search_knowledge_base. La respuesta estaba indexada y recuperaba
  // en primera posicion.
  //
  // Y no termino ahi: la escalacion marca is_escalated y el bot deja de
  // responder. Los dos mensajes siguientes del cliente no generaron ni un
  // agent_run. Un error de criterio se volvio perdida de servicio.
  describe('escalar por "no se responder" exige haber consultado la base', () => {
    const toolEscalar = {
      getName: () => 'escalate_to_agent',
      getDeclaration: () => ({ name: 'escalate_to_agent' }),
      requiresIdentification: () => false,
      isMutating: () => true,
      execute: jest.fn().mockResolvedValue({ queued: true, deferred: false }),
    };
    const toolBuscar = {
      getName: () => 'search_knowledge_base',
      getDeclaration: () => ({ name: 'search_knowledge_base' }),
      requiresIdentification: () => false,
      isMutating: () => false,
      execute: jest.fn().mockResolvedValue({ found: false, answer: '' }),
    };

    const armar = () => {
      const reg = new AgentToolRegistry(
        [toolEscalar, toolBuscar] as any,
        new ActionConfirmationGuard(),
      );
      return reg.buildExecutor({
        phoneNumber: '59171000001', clientId: 'c-1',
        messages: [{ role: 'user', content: 'el router es mio o prestado' }],
      } as any);
    };

    beforeEach(() => jest.clearAllMocks());

    it('busca EL MISMO y devuelve la respuesta, sin escalar', async () => {
      toolBuscar.execute.mockResolvedValue({ found: true, answer: 'El router es en comodato.' });
      const { executor } = armar();

      const r: any = await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      expect(toolEscalar.execute).not.toHaveBeenCalled();
      // La busqueda la hace el registry con la ultima pregunta del cliente:
      // no depende de que el modelo obedezca la instruccion.
      expect(toolBuscar.execute).toHaveBeenCalledWith(
        { query: 'el router es mio o prestado' }, expect.anything(),
      );
      expect(r.answer).toBe('El router es en comodato.');
      expect(r.nota_para_el_agente).toMatch(/NO escales/);
    });

    // Esta es la regresion que importa: la primera version rechazaba UNA sola
    // vez para no colgar al cliente en un bucle, y el modelo simplemente
    // reintento escalar. El segundo intento paso por esa puerta.
    it('reintentar escalar sin buscar NO lo deja pasar', async () => {
      toolBuscar.execute.mockResolvedValue({ found: true, answer: 'El router es en comodato.' });
      const { executor } = armar();

      await executor('escalate_to_agent', { motivo: 'no_se_responder' });
      const r: any = await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      // Tras la busqueda automatica, la segunda ya tiene respaldo y pasa —
      // pero con la informacion en la mano, no a ciegas.
      expect(toolBuscar.execute).toHaveBeenCalledTimes(1);
      expect(r.queued).toBe(true);
    });

    // Verificado en produccion: el bot respondio correctamente desde la base y
    // el mensaje quedo guardado con chunk_id NULL — indistinguible de una
    // alucinacion en la auditoria. El retorno temprano se saltaba la captura.
    it('la respuesta encontrada por el registry conserva su trazabilidad', async () => {
      toolBuscar.execute.mockResolvedValue({
        found: true, answer: 'El router es en comodato.', chunkId: 'chunk-comodato-1',
      });
      const { executor, getRagChunkId } = armar();

      await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      expect(getRagChunkId()).toBe('chunk-comodato-1');
    });


    // Medido en produccion: el bot respondio CORRECTAMENTE sobre el comodato y
    // la conversacion quedo escalada igual, en silencio. El orquestador miraba
    // `toolsCalled.includes(ESCALATE_TOOL)` — el NOMBRE de la herramienta — y
    // la interceptacion dejaba el nombre en la lista sin haber escalado nada.
    it('interceptar la escalacion NO cuenta como haber escalado', async () => {
      toolBuscar.execute.mockResolvedValue({ found: true, answer: 'Es en comodato.' });
      const { executor, hasEscalated } = armar();

      await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      expect(hasEscalated()).toBe(false);
    });

    it('una escalacion real si cuenta', async () => {
      const { executor, hasEscalated } = armar();

      await executor('escalate_to_agent', { motivo: 'pedido_explicito' });

      expect(hasEscalated()).toBe(true);
    });

    it('si la base tampoco tiene nada, habilita la escalacion', async () => {
      toolBuscar.execute.mockResolvedValue({ found: false });
      const { executor } = armar();

      const r: any = await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      expect(r.found).toBe(false);
      expect(r.nota_para_el_agente).toMatch(/Ahora s[ií] pod[eé]s escalar/);
    });

    it('despues de buscar, la deja pasar', async () => {
      const { executor } = armar();

      await executor('search_knowledge_base', { query: 'router comodato' });
      const r: any = await executor('escalate_to_agent', { motivo: 'no_se_responder' });

      expect(toolEscalar.execute).toHaveBeenCalled();
      expect(r.queued).toBe(true);
    });

    it.each(['pedido_explicito', 'cliente_molesto', 'cobertura_no_verificada'])(
      'no estorba cuando el motivo es %s',
      async (motivo) => {
        const { executor } = armar();

        const r: any = await executor('escalate_to_agent', { motivo });

        expect(toolEscalar.execute).toHaveBeenCalled();
        expect(r.queued).toBe(true);
      },
    );


  });


  // 2026-08-07, medido en produccion: "Mi internet esta lento" ->
  // toolsCalled ["check_recurring_issue"] y 869 caracteres de pasos INVENTADOS.
  // El resultado de la tool traia `siguiente_paso_obligatorio` ordenando llamar
  // a search_knowledge_base, y el modelo simplemente no la llamo.
  //
  // La premisa de D1 ("una instruccion dentro del resultado se obedece mejor
  // que el prompt") no es confiable. La busqueda se hace sin pedir permiso.
  describe('soporte tecnico: los pasos salen de la base, no del modelo', () => {
    const toolCheck = {
      getName: () => 'check_recurring_issue',
      getDeclaration: () => ({ name: 'check_recurring_issue' }),
      requiresIdentification: () => true,
      isMutating: () => false,
      execute: jest.fn(),
    };
    const toolBuscar2 = {
      getName: () => 'search_knowledge_base',
      getDeclaration: () => ({ name: 'search_knowledge_base' }),
      requiresIdentification: () => false,
      isMutating: () => false,
      execute: jest.fn(),
    };

    const armar2 = () => new AgentToolRegistry(
      [toolCheck, toolBuscar2] as any, new ActionConfirmationGuard(),
    ).buildExecutor({
      phoneNumber: '59171000001', clientId: 'c-1',
      messages: [{ role: 'user', content: 'mi internet esta lento' }],
    } as any);

    beforeEach(() => jest.clearAllMocks());

    it('un problema NUEVO trae los pasos documentados ya resueltos', async () => {
      toolCheck.execute.mockResolvedValue({ recurrent: false, recentCount: 0 });
      toolBuscar2.execute.mockResolvedValue({
        found: true, answer: 'El primer paso es reiniciar el router.', chunkId: 'ch-4',
      });
      const { executor, getRagChunkId } = armar2();

      const r: any = await executor('check_recurring_issue', { issue_type: 'lentitud' });

      expect(toolBuscar2.execute).toHaveBeenCalled();
      expect(r.pasos_documentados).toBe('El primer paso es reiniciar el router.');
      expect(r.siguiente_paso_obligatorio).toMatch(/PROHIBIDO redactar pasos propios/);
      // La trazabilidad tiene que sobrevivir: sin chunk_id, una respuesta buena
      // es indistinguible de una inventada en la auditoria.
      expect(getRagChunkId()).toBe('ch-4');
    });

    it('si la base no tiene pasos, manda a crear el ticket en vez de inventar', async () => {
      toolCheck.execute.mockResolvedValue({ recurrent: false, recentCount: 0 });
      toolBuscar2.execute.mockResolvedValue({ found: false });
      const { executor } = armar2();

      const r: any = await executor('check_recurring_issue', { issue_type: 'lentitud' });

      expect(r.pasos_documentados).toBeUndefined();
      expect(r.siguiente_paso_obligatorio).toMatch(/NO inventes/);
      expect(r.siguiente_paso_obligatorio).toMatch(/create_support_ticket/);
    });

    // Un problema recurrente NO lleva autodiagnostico: va directo a ticket.
    it('un problema recurrente no dispara la busqueda', async () => {
      toolCheck.execute.mockResolvedValue({ recurrent: true, recentCount: 2 });
      const { executor } = armar2();

      await executor('check_recurring_issue', { issue_type: 'lentitud' });

      expect(toolBuscar2.execute).not.toHaveBeenCalled();
    });
  });


  // 2026-08-07: un prospecto recorrio ocho pasos del alta y al confirmar la
  // herramienta devolvio "ya tenes una instalacion agendada" — accionable. El
  // guard lo reemplazo por "Aun no pude completar esa accion", que no dice
  // nada. Tapar una mentira es el trabajo del guard; tapar la verdad, no.
  describe('un error explicado por la tool no debe pisarse', () => {
    const armarCon = (resultado: unknown) => {
      const tool = {
        getName: () => 'create_installation',
        getDeclaration: () => ({ name: 'create_installation' }),
        requiresIdentification: () => false,
        isMutating: () => true,
        execute: jest.fn().mockResolvedValue(resultado),
      };
      const reg = new AgentToolRegistry([tool] as any, new ActionConfirmationGuard());
      return reg.buildExecutor({ phoneNumber: '59171000001' } as any);
    };

    it('marca el turno cuando la tool devuelve error', async () => {
      const { executor, hasToolError } = armarCon({ error: 'Ya tenés una instalación agendada.' });
      await executor('create_installation', {});
      expect(hasToolError()).toBe(true);
    });

    it('tambien con created:false', async () => {
      const { executor, hasToolError } = armarCon({ created: false, message: 'duplicada' });
      await executor('create_installation', {});
      expect(hasToolError()).toBe(true);
    });

    it('un resultado exitoso no lo marca', async () => {
      const { executor, hasToolError } = armarCon({ created: true, ticketNumber: 'X' });
      await executor('create_installation', {});
      expect(hasToolError()).toBe(false);
    });
  });


  // Un error de AUTOCORRECCION ("ESTE ES UN ERROR TUYO, corregilo vos") no es
  // un mensaje para el cliente. Si no lleva `errorInterno: true`, el guard se
  // aparta y el modelo termina diciendole al cliente "hubo un problema,
  // intenta mas tarde" — justo lo que ese texto le prohibe.
  //
  // Medido en produccion (2026-08-07): paso exactamente eso con get_installation_slots.
  //
  // Este escaner lee el codigo de todas las tools, igual que el de OUTCOME_FLAGS,
  // para que la proxima que agregue un error de autocorreccion no lo olvide.
  describe('todo error de autocorreccion debe marcarse como interno', () => {
    const fs   = require('fs');
    const path = require('path');

    it('ninguna tool devuelve "ERROR TUYO" sin errorInterno', () => {
      const dir = path.join(__dirname);
      const archivos = fs.readdirSync(dir)
        .filter((f: string) => f.endsWith('.tool.ts') && !f.endsWith('.spec.ts'));

      const olvidadas: string[] = [];
      for (const archivo of archivos) {
        const src: string = fs.readFileSync(path.join(dir, archivo), 'utf8');
        let desde = 0;
        for (;;) {
          const i = src.indexOf('ERROR TUYO', desde);
          if (i < 0) break;
          desde = i + 1;
          // El bloque `return { ... }` que contiene ese texto.
          const ini = src.lastIndexOf('return {', i);
          const fin = src.indexOf('};', i);
          if (ini < 0 || fin < 0) continue;
          if (!src.slice(ini, fin).includes('errorInterno')) olvidadas.push(archivo);
        }
      }

      expect(olvidadas).toEqual([]);
      // Autocomprobacion: si el escaner no lee nada, pasaria en verde sin medir.
      expect(archivos.length).toBeGreaterThan(15);
    });
  });


  // 18 (2026-08-07): el bot dijo "No tenes ninguna instalacion agendada"
  // —una negacion, respaldada por una consulta que acababa de correr— y el
  // guard la marco como afirmacion sin respaldo, porque el respaldo exigia
  // found===true. Consultar y no encontrar es un resultado, no un silencio.
  describe('una consulta sin resultados tambien respalda', () => {
    const armarConsulta = (resultado: unknown) => {
      const tool = {
        getName: () => 'get_active_installation',
        getDeclaration: () => ({ name: 'get_active_installation' }),
        requiresIdentification: () => false,
        isMutating: () => false,
        execute: jest.fn().mockResolvedValue(resultado),
      };
      return new AgentToolRegistry([tool] as any, new ActionConfirmationGuard())
        .buildExecutor({ phoneNumber: '59171000001' } as any);
    };

    it('found:false respalda igual que found:true', async () => {
      const { executor, hasStateReadBacking } = armarConsulta({ found: false });
      await executor('get_active_installation', {});
      expect(hasStateReadBacking()).toBe(true);
    });

    it('found:true sigue respaldando', async () => {
      const { executor, hasStateReadBacking } = armarConsulta({ found: true, fecha: 'x' });
      await executor('get_active_installation', {});
      expect(hasStateReadBacking()).toBe(true);
    });

    // Un fallo tecnico NO es una consulta respondida.
    // El respaldo no puede depender del nombre del campo: check_coverage
    // devuelve `covered`, no `found`, y por eso su consulta no contaba. El bot
    // dijo "ya tenes una instalacion agendada" —cierto— y el guard lo tapo.
    it('una consulta que no usa `found` tambien respalda', async () => {
      const { executor, hasStateReadBacking } = armarConsulta({
        covered: 'true', instalacion_pendiente: true,
      });
      await executor('get_active_installation', {});
      expect(hasStateReadBacking()).toBe(true);
    });

    it('un error no respalda nada', async () => {
      const { executor, hasStateReadBacking } = armarConsulta({ error: 'timeout' });
      await executor('get_active_installation', {});
      expect(hasStateReadBacking()).toBe(false);
    });
  });

});
