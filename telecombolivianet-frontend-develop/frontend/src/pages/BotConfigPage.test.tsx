import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BotConfigPage from './BotConfigPage';
import { chatbotService } from '@/services/chatbotService';

vi.mock('@/services/chatbotService', () => ({
  chatbotService: {
    getBotConfig:     vi.fn(),
    updateBotConfig:  vi.fn(),
    resetBotConfig:   vi.fn(),
    getCompanyQrInfo: vi.fn(),
    uploadCompanyQr:  vi.fn(),
    ragListDocuments: vi.fn(),
    ragUploadDocument: vi.fn(),
    ragDeleteDocument: vi.fn(),
  },
  DIAS_SEMANA: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  INTENTS_DISPONIBLES: [
    { value: 'SOLICITAR_AGENTE', label: 'Hablar con agente' },
    { value: 'CONSULTAR_DEUDA',  label: 'Consultar deuda' },
  ],
}));

vi.mock('@/services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: new Blob() }) },
}));

const makeConfig = (over: Partial<Record<string, unknown>> = {}) => ({
  Menu: {
    TituloBoton: 'Ver opciones',
    TituloSeccion: 'Servicios',
    Opciones: [{
      Numero: '1', Etiqueta: 'Consultar deuda', Intent: 'CONSULTAR_DEUDA',
      Activa: true, Descripcion: 'Revisa tu saldo', SoloCliente: true,
    }],
  },
  Horario: {
    HoraInicio: '08:00', HoraFin: '20:00',
    DiasActivos: [true, true, true, true, true, true, true],
    MensajeFueraHorario: 'Estamos fuera de horario.',
  },
  Mensajes: {
    Bienvenida: 'Hola {nombre}', BienvenidaProspecto: 'Bienvenido',
    NoEntendido: 'No entendí', EscaladoAgente: 'Te comunico con un agente',
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (chatbotService.getBotConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
  (chatbotService.updateBotConfig as ReturnType<typeof vi.fn>).mockImplementation(async (c: unknown) => c);
  (chatbotService.getCompanyQrInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
    HasQr: false, Path: null, UpdatedAt: null, ExpiresAt: null, DaysRemaining: null,
  });
  (chatbotService.ragListDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

async function renderAndWait() {
  render(<BotConfigPage />);
  expect(await screen.findByText('Configuración del Bot WhatsApp')).toBeInTheDocument();
}

describe('BotConfigPage — TC-FE-BOT-01 a TC-FE-BOT-08 (red de seguridad refactor C3)', () => {
  it('TC-FE-BOT-01 — carga y muestra pestaña Menú con opciones', async () => {
    await renderAndWait();
    expect(screen.getByText('Botón de apertura')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Etiqueta (máx 24 chars)')).toHaveValue('Consultar deuda');
    expect(screen.getByText(/1 activas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar configuración/ })).toBeInTheDocument();
  });

  it('TC-FE-BOT-02 — muestra error (no spinner infinito) si la carga falla', async () => {
    (chatbotService.getBotConfig as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<BotConfigPage />);
    // Bug detectado en auditoría: con config=null el error era inalcanzable y quedaba el spinner para siempre
    expect(await screen.findByText('Error al cargar la configuración.')).toBeInTheDocument();
  });

  it('TC-FE-BOT-03 — valida que haya al menos una opción activa antes de guardar', async () => {
    (chatbotService.getBotConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig({
      Menu: {
        TituloBoton: 'Ver opciones', TituloSeccion: 'Servicios',
        Opciones: [{ Numero: '1', Etiqueta: 'X', Intent: 'CONSULTAR_DEUDA', Activa: false, Descripcion: '', SoloCliente: false }],
      },
    }));
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuración/ }));
    expect(await screen.findByText('Debe haber al menos una opción activa en el menú.')).toBeInTheDocument();
    expect(chatbotService.updateBotConfig).not.toHaveBeenCalled();
  });

  it('TC-FE-BOT-04 — pestaña Horario muestra rango, días y simulación de estado', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'Horario' }));
    expect(await screen.findByText('Hora inicio (formato 24h)')).toBeInTheDocument();
    expect(screen.getByText(/el bot estaría/)).toBeInTheDocument();
    expect(screen.getByText('Días activos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Estamos fuera de horario.')).toBeInTheDocument();
  });

  it('TC-FE-BOT-05 — pestaña Mensajes muestra las 4 plantillas editables', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'Mensajes' }));
    expect(await screen.findByText('Bienvenida (cliente identificado)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hola {nombre}')).toBeInTheDocument();
    expect(screen.getByText('Escalado a agente')).toBeInTheDocument();
  });

  it('TC-FE-BOT-06 — pestaña QR carga info y muestra vacío sin QR', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'QR de pago' }));
    await waitFor(() => expect(chatbotService.getCompanyQrInfo).toHaveBeenCalled());
    expect(await screen.findByText('No hay QR configurado todavía.')).toBeInTheDocument();
    expect(screen.getByText('Subir QR de pago')).toBeInTheDocument();
  });

  it('TC-FE-BOT-07 — pestaña Documentos IA lista vacía y formulario de subida', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'Documentos IA' }));
    await waitFor(() => expect(chatbotService.ragListDocuments).toHaveBeenCalled());
    expect(await screen.findByText('No hay documentos cargados.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Título del documento (obligatorio)')).toBeInTheDocument();
  });

  it('TC-FE-BOT-08 — guardar configuración válida llama al servicio y muestra éxito', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuración/ }));
    await waitFor(() => expect(chatbotService.updateBotConfig).toHaveBeenCalled());
    expect(await screen.findByText('Configuración guardada correctamente.')).toBeInTheDocument();
  });
});
