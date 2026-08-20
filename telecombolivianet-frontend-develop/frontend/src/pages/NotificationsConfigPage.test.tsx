import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationsConfigPage from './NotificationsConfigPage';
import {
  getNotifConfigs, getPlantillas, getSegments, updateNotifConfigs,
} from '@/services/notificationService';

vi.mock('@/services/notificationService', () => ({
  getNotifConfigs:    vi.fn(),
  updateNotifConfigs: vi.fn(),
  getPlantillas:      vi.fn(),
  updatePlantilla:    vi.fn(),
  restorePlantilla:   vi.fn(),
  getSegments:        vi.fn(),
  createSegment:      vi.fn(),
  updateSegment:      vi.fn(),
  deleteSegment:      vi.fn(),
  previewSegment:     vi.fn(),
  bulkSend:           vi.fn(),
  previewPlantilla:   vi.fn(),
  ALL_VARIABLES: [
    { variable: '{{nombre}}', descripcion: 'Nombre del cliente' },
    { variable: '{{deuda}}',  descripcion: 'Deuda total' },
  ],
  NOTIF_TYPE_LABELS: { SUSPENSION: 'Suspensión', RECORDATORIO: 'Recordatorio' },
  NOTIF_TYPES_ACTIVOS: ['SUSPENSION', 'RECORDATORIO'],
  HSM_STATUS_COLORS: {
    Aprobada:  'bg-green-50 text-green-700 border-green-200',
    Pendiente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    Rechazada: 'bg-red-50 text-red-700 border-red-200',
  },
  CATEGORIA_LABELS: {
    Cobro: 'Cobro', Bienvenida: 'Bienvenida', Tecnico: 'Técnico',
    Ticket: 'Ticket', General: 'General',
  },
}));

const CONFIGS = {
  Configs: [{
    Tipo: 'SUSPENSION', Activo: true, DelaySegundos: 0,
    HoraInicio: '08:00', HoraFin: '20:00', DiasAntes: null, PlantillaId: null,
  }],
  HoraServidorLocal: '12:34',
};

const PLANTILLAS = [{
  Id: 'plt1', Tipo: 'SUSPENSION', Texto: 'Hola {{nombre}}, su servicio será suspendido.',
  Categoria: 'Cobro', HsmStatus: 'Aprobada',
  MetaTemplateName: null, MetaLanguageCode: 'es', MetaParamOrder: null,
}];

const SEGMENTS = [{
  Id: 'seg1', Nombre: 'Morosos', Descripcion: 'Clientes con deuda',
  Reglas: [{ Condiciones: [{ Campo: 'deuda', Operador: '>', Valor: '100' }] }],
  ClientesEstimados: 5,
}];

async function renderAndWait() {
  render(<NotificationsConfigPage />);
  expect(await screen.findByText('Notificaciones WhatsApp')).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  (getNotifConfigs as ReturnType<typeof vi.fn>).mockResolvedValue(CONFIGS);
  (getPlantillas as ReturnType<typeof vi.fn>).mockResolvedValue(PLANTILLAS);
  (getSegments as ReturnType<typeof vi.fn>).mockResolvedValue(SEGMENTS);
  (updateNotifConfigs as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('NotificationsConfigPage — TC-FE-NOTIF-01 a TC-FE-NOTIF-06 (red de seguridad refactor C)', () => {
  it('TC-FE-NOTIF-01 — carga y muestra pestaña Triggers con hora del servidor', async () => {
    await renderAndWait();
    expect(screen.getByText(/Hora servidor Bolivia: 12:34/)).toBeInTheDocument();
    expect(screen.getByText('Suspensión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar triggers/ })).toBeInTheDocument();
  });

  it('TC-FE-NOTIF-02 — muestra error si la carga inicial falla', async () => {
    (getNotifConfigs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<NotificationsConfigPage />);
    expect(await screen.findByText('Error al cargar la configuración.')).toBeInTheDocument();
  });

  it('TC-FE-NOTIF-03 — pestaña Plantillas muestra editor con el texto de la plantilla', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Plantillas/ }));
    expect(await screen.findByDisplayValue(/su servicio será suspendido/)).toBeInTheDocument();
    expect(screen.getByText('Todas las categorías')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar plantilla/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restaurar por defecto/ })).toBeInTheDocument();
  });

  it('TC-FE-NOTIF-04 — pestaña Segmentos lista segmentos y abre formulario nuevo', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Segmentos/ }));
    expect(await screen.findByText('Morosos')).toBeInTheDocument();
    expect(screen.getByText(/~5 clientes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo segmento/ }));
    expect(await screen.findByPlaceholderText('Nombre del segmento*')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calcular clientes/ })).toBeInTheDocument();
  });

  it('TC-FE-NOTIF-05 — pestaña Envío Masivo muestra selección y plantilla a enviar', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Envío Masivo/ }));
    expect(await screen.findByText('Tipo de notificación')).toBeInTheDocument();
    expect(screen.getByText('Segmento destinatarios')).toBeInTheDocument();
    expect(screen.getByText('Plantilla que se enviará:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar envío masivo/ })).toBeInTheDocument();
    expect(screen.getByText(/Morosos/)).toBeInTheDocument();
  });

  it('TC-FE-NOTIF-06 — guardar triggers llama al servicio y muestra éxito', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Guardar triggers/ }));
    await waitFor(() => expect(updateNotifConfigs).toHaveBeenCalledWith(CONFIGS.Configs, false));
    expect(await screen.findByText('Triggers actualizados correctamente.')).toBeInTheDocument();
  });
});
