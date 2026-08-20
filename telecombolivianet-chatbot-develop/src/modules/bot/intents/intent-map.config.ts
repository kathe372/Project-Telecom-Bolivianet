export const DEFAULT_INTENT_MAP: Record<string, string> = {
  reagendar_si:           'Sí, quiero reagendar mi instalación',
  reagendar_no:           'No, gracias. No quiero reagendar.',
  consulta_deuda:         'Quiero consultar mi deuda y facturas pendientes',
  solicitar_qr:           'Quiero obtener el código QR para pagar',
  sin_conexion:           'Tengo un problema técnico con mi internet',
  velocidad_lenta:        'Mi internet está muy lento',
  problema_router:        'Tengo problemas con mi router o módem',
  // 2026-08-07: decía "Quiero agendar O CONSULTAR mi instalación" — dos cosas
  // opuestas en una sola opción. El modelo elegía consultar: el cliente tocaba
  // "📅 Instalación" para contratar y recibía "no tenés ninguna instalación
  // agendada", una respuesta a algo que no preguntó (y encima falsa, por el
  // problema de la búsqueda por teléfono).
  //
  // Ahora la intención es una sola. Si además ya tuviera una agendada, se lo
  // avisa check_coverage en el primer paso — ya no hace falta consultar antes
  // "por las dudas".
  solicitar_instalacion:  'Quiero contratar el servicio y agendar una instalación',
  // No mencionar "cobertura" acá: el botón "Planes" es una consulta
  // informativa (get_available_plans, sin ubicación) — si el texto incluye
  // "cobertura" el agente lo interpreta como el flujo de instalación
  // (check_coverage) y pide ubicación en vez de mostrar los planes directo.
  consulta_planes:        'Quiero información sobre los planes de internet disponibles y sus precios',
  confirmar_instalacion:  'Confirmo que estaré presente para mi instalación programada de mañana',
  solicitar_agente:       'Quiero hablar con un agente humano',
  consulta_periodo:       'Quiero saber información sobre el periodo de pago',
  menu:                   'Ver el menú de opciones disponibles',
  cable_cortado:          'El cable de fibra parece estar cortado o dañado',
  sin_senal_tv:           'No tengo señal en el televisor por cable',
  problema_decoder:       'Tengo problemas con el decodificador de TV',
  solicitar_reactivacion: 'Quiero solicitar la reactivación de mi servicio',
  problema_resuelto:      'Sí, el problema ya se resolvió, todo funciona bien',
  problema_persiste:      'No, el problema persiste, sigue igual',
  // PASO 12: confirmación en dos pasos antes de crear una instalación nueva —
  // el id crudo re-ingresa como esta frase, y create_installation solo agenda
  // de verdad cuando el LLM lo vuelve a llamar con confirmado=true.
  confirmar_nueva_instalacion: 'Sí, confirmo, agenda la instalación con esos datos',
  cambiar_nueva_instalacion:   'Quiero cambiar algo antes de agendar (el plan, la fecha, la hora o la dirección)',
  cancelar_nueva_instalacion:  'No quiero agendar la instalación, cancela este proceso',
  // 2026-08-07: FALTABA. `mostrarOAgendarInstalacion` ofrece este botón junto a
  // "📅 Reprogramar", pero el id no estaba acá ni tenía ruta determinista, así
  // que degradaba a su etiqueta pelada ("❌ Cancelar") — un texto sin ningún
  // contexto. Medido en producción: el cliente tocó "❌ Cancelar" para anular su
  // instalación y el bot le abrió el procedimiento de soporte técnico
  // ("¿de qué color está la luz del módem?").
  //
  // Estaban mapeados TODOS los ids de cancelación menos el que la inicia.
  cancelar_instalacion:                 'Quiero cancelar mi instalación ya agendada',
  // PASO 13: mismo patrón de confirmación en dos pasos, para reprogramar y
  // cancelar una instalación ya agendada.
  confirmar_reprogramacion_instalacion: 'Sí, confirmo, reprograma mi instalación a ese horario',
  cancelar_reprogramacion_instalacion:  'No, dejá mi instalación en el horario que ya tenía',
  confirmar_cancelacion_instalacion:    'Sí, confirmo, cancela mi instalación',
  mantener_instalacion_agendada:        'No, no quiero cancelar, mantené mi instalación agendada',
  // PASO 16 Fase C: mismo patrón de confirmación en dos pasos, para agendar
  // una visita técnica sobre un ticket de soporte.
  confirmar_visita_tecnica: 'Sí, confirmo, agenda la visita técnica a ese horario',
  cancelar_visita_tecnica:  'No quiero agendar la visita técnica, cancela este proceso',
};
