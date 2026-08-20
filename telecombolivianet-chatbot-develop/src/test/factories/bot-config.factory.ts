import type { BotConfig } from '../../modules/bot/bot-config-cache.service';

export const buildBotConfig = (overrides?: Partial<BotConfig>): BotConfig => ({
  Menu: {
    TituloMenu:    '¿En qué puedo ayudarte hoy?',
    TituloBoton:   'Ver opciones',
    TituloSeccion: 'Servicios disponibles',
    Opciones: [
      { Numero: '1', Etiqueta: '💳 Mi deuda',        Intent: 'CONSULTA_DEUDA',   Activa: true, SoloCliente: true  },
      { Numero: '6', Etiqueta: '👤 Hablar con agente', Intent: 'SOLICITAR_AGENTE', Activa: true, SoloCliente: false },
    ],
  },
  Horario: {
    HoraInicio:          '08:00',
    HoraFin:             '18:00',
    DiasActivos:         [true, true, true, true, true, false, false],
    MensajeFueraHorario:
      'Tu solicitud quedó registrada. Un agente te contactará en nuestro horario de atención: lunes a viernes de 8:00 a 18:00. 🙏',
  },
  Mensajes: {
    Bienvenida:          '¡Hola {nombre}! 👋 Soy el asistente de TelecomBoliviaNet.',
    BienvenidaProspecto: '¡Hola! 👋 Soy el asistente de TelecomBoliviaNet.',
    NoEntendido:         'Disculpa, no entendí tu consulta.',
    EscaladoAgente:      'Te estoy conectando con un agente. Un momento... 🔄',
  },
  ...overrides,
});

export const buildBotConfigOutsideHours = (overrides?: Partial<BotConfig>): BotConfig =>
  buildBotConfig({
    Horario: {
      HoraInicio:          '09:00',
      HoraFin:             '17:00',
      DiasActivos:         [false, false, false, false, false, false, false],
      MensajeFueraHorario: 'Fuera de horario.',
    },
    ...overrides,
  });
