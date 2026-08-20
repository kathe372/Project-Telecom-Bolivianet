import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('./api', () => ({
  default: {
    get:    vi.fn(),
    put:    vi.fn(),
    post:   vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';
import {
  NOTIF_TYPES_ACTIVOS,
  NOTIF_TYPE_LABELS,
  ALL_VARIABLES,
  HSM_STATUS_COLORS,
  CATEGORIA_LABELS,
  getPlantillas,
  updatePlantilla,
  updateHsmStatus,
  restorePlantilla,
  getNotifConfigs,
  updateNotifConfigs,
  previewPlantilla,
} from './notificationService';


describe('NOTIF_TYPES_ACTIVOS', () => {
  it('contiene exactamente 9 tipos activos', () => {
    expect(NOTIF_TYPES_ACTIVOS).toHaveLength(9);
  });

  it('no incluye RECORDATORIO_R2 (deshabilitado)', () => {
    expect(NOTIF_TYPES_ACTIVOS).not.toContain('RECORDATORIO_R2');
  });

  it('no incluye RECORDATORIO_R3 (deshabilitado)', () => {
    expect(NOTIF_TYPES_ACTIVOS).not.toContain('RECORDATORIO_R3');
  });

  it('no incluye RECORDATORIO_R1 (gestionado por el programador de recordatorios)', () => {
    expect(NOTIF_TYPES_ACTIVOS).not.toContain('RECORDATORIO_R1');
  });

  it('incluye todos los tipos esperados', () => {
    const expected = [
      'SUSPENSION',
      'REACTIVACION',
      'CONFIRMACION_PAGO',
      'FACTURA_VENCIDA',
      'TICKET_CREADO',
      'TICKET_ASIGNADO',
      'TICKET_RESUELTO',
      'CAMBIO_PLAN',
      'CAMBIO_PRECIO',
    ];
    expected.forEach((t) => expect(NOTIF_TYPES_ACTIVOS).toContain(t));
  });
});


describe('NOTIF_TYPE_LABELS', () => {
  it('R1 tiene etiqueta "Recordatorio de Pago"', () => {
    expect(NOTIF_TYPE_LABELS.RECORDATORIO_R1).toBe('Recordatorio de Pago');
  });

  it('R2 indica que está deshabilitado', () => {
    expect(NOTIF_TYPE_LABELS.RECORDATORIO_R2).toContain('deshabilitado');
  });

  it('R3 indica que está deshabilitado', () => {
    expect(NOTIF_TYPE_LABELS.RECORDATORIO_R3).toContain('deshabilitado');
  });

  it('CONFIRMACION_PAGO tiene etiqueta correcta', () => {
    expect(NOTIF_TYPE_LABELS.CONFIRMACION_PAGO).toBe('Confirmación de Pago');
  });

  it('SUSPENSION tiene etiqueta correcta', () => {
    expect(NOTIF_TYPE_LABELS.SUSPENSION).toBe('Suspensión de Servicio');
  });

  it('REACTIVACION tiene etiqueta correcta', () => {
    expect(NOTIF_TYPE_LABELS.REACTIVACION).toBe('Reactivación de Servicio');
  });
});


describe('HSM_STATUS_COLORS', () => {
  it('Aprobada usa clases verdes', () => {
    expect(HSM_STATUS_COLORS.Aprobada).toContain('green');
  });

  it('Pendiente usa clases amarillas', () => {
    expect(HSM_STATUS_COLORS.Pendiente).toContain('yellow');
  });

  it('Rechazada usa clases rojas', () => {
    expect(HSM_STATUS_COLORS.Rechazada).toContain('red');
  });

  it('todos los estados tienen valor definido', () => {
    (['Aprobada', 'Pendiente', 'Rechazada'] as const).forEach((s) => {
      expect(HSM_STATUS_COLORS[s]).toBeTruthy();
    });
  });
});


describe('CATEGORIA_LABELS', () => {
  it('Cobro → "Cobro"', () => {
    expect(CATEGORIA_LABELS.Cobro).toBe('Cobro');
  });

  it('Ticket → "Ticket"', () => {
    expect(CATEGORIA_LABELS.Ticket).toBe('Ticket');
  });

  it('Tecnico → "Técnico" (con tilde)', () => {
    expect(CATEGORIA_LABELS.Tecnico).toBe('Técnico');
  });
});


describe('ALL_VARIABLES', () => {
  const vars = ALL_VARIABLES.map((v) => v.variable);

  it('contiene {{nombre}}', () => {
    expect(vars).toContain('{{nombre}}');
  });

  it('contiene {{deuda}}', () => {
    expect(vars).toContain('{{deuda}}');
  });

  it('contiene {{meses_deuda_detalle}}', () => {
    expect(vars).toContain('{{meses_deuda_detalle}}');
  });

  it('contiene {{monto}} y {{periodo}} para confirmación de pago', () => {
    expect(vars).toContain('{{monto}}');
    expect(vars).toContain('{{periodo}}');
  });

  it('contiene variables de ticket', () => {
    expect(vars).toContain('{{num_ticket}}');
    expect(vars).toContain('{{tecnico}}');
  });

  it('todas las entradas tienen variable y descripcion no vacíos', () => {
    ALL_VARIABLES.forEach(({ variable, descripcion }) => {
      expect(variable.trim()).toBeTruthy();
      expect(descripcion.trim()).toBeTruthy();
    });
  });

  it('variables tienen formato {{...}}', () => {
    ALL_VARIABLES.forEach(({ variable }) => {
      expect(variable).toMatch(/^\{\{.+\}\}$/);
    });
  });
});


describe('getNotifConfigs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama GET /config/notifications', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { Configs: [], HoraServidorLocal: '08:00' } } });

    await getNotifConfigs();

    expect(api.get).toHaveBeenCalledWith('/config/notifications');
  });

  it('devuelve data.data de la respuesta', async () => {
    const payload = { Configs: [], HoraServidorLocal: '08:00' };
    (api.get as Mock).mockResolvedValueOnce({ data: { data: payload } });

    const result = await getNotifConfigs();

    expect(result).toEqual(payload);
  });
});

describe('updateNotifConfigs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama PUT /config/notifications con body Configs', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    const configs = [{ Tipo: 'RECORDATORIO_R1' as const, Activo: true, DelaySegundos: 0, HoraInicio: '08:00', HoraFin: '20:00', Inmediato: false, DiasAntes: 5, PlantillaId: null }];
    await updateNotifConfigs(configs);

    expect(api.put).toHaveBeenCalledWith(
      '/config/notifications',
      { Configs: configs },
      { headers: {} },
    );
  });

  it('agrega header X-Confirm-Suspension cuando confirmSuspension=true', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await updateNotifConfigs([], true);

    expect(api.put).toHaveBeenCalledWith(
      '/config/notifications',
      { Configs: [] },
      { headers: { 'X-Confirm-Suspension': 'true' } },
    );
  });
});

describe('getPlantillas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama GET /config/notifications/templates sin parámetros', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [] } });

    await getPlantillas();

    expect(api.get).toHaveBeenCalledWith(
      '/config/notifications/templates',
      { params: {} },
    );
  });

  it('incluye categoria en params cuando se proporciona', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [] } });

    await getPlantillas('Cobro');

    expect(api.get).toHaveBeenCalledWith(
      '/config/notifications/templates',
      { params: { categoria: 'Cobro' } },
    );
  });

  it('incluye hsmStatus en params cuando se proporciona', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [] } });

    await getPlantillas(undefined, 'Aprobada');

    expect(api.get).toHaveBeenCalledWith(
      '/config/notifications/templates',
      { params: { hsmStatus: 'Aprobada' } },
    );
  });
});

describe('updatePlantilla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama PUT /config/notifications/templates/:tipo con cuerpo correcto', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await updatePlantilla(
      'RECORDATORIO_R1',
      'Estimado/a {{nombre}}...',
      'Cobro',
      'Aprobada',
      'aviso_pago_pendiente',
      'es',
      '["nombre","meses_deuda_detalle","deuda"]',
    );

    expect(api.put).toHaveBeenCalledWith(
      '/config/notifications/templates/RECORDATORIO_R1',
      {
        Texto:            'Estimado/a {{nombre}}...',
        Categoria:        'Cobro',
        HsmStatus:        'Aprobada',
        MetaTemplateName: 'aviso_pago_pendiente',
        MetaLanguageCode: 'es',
        MetaParamOrder:   '["nombre","meses_deuda_detalle","deuda"]',
      },
    );
  });

  it('usa defaults cuando no se pasan argumentos opcionales', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await updatePlantilla('SUSPENSION', 'texto');

    expect(api.put).toHaveBeenCalledWith(
      '/config/notifications/templates/SUSPENSION',
      expect.objectContaining({
        Categoria:        'General',
        HsmStatus:        'Pendiente',
        MetaTemplateName: null,
        MetaLanguageCode: 'es',
        MetaParamOrder:   null,
      }),
    );
  });
});

describe('updateHsmStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama PATCH /config/notifications/templates/:tipo/hsm', async () => {
    (api.patch as Mock).mockResolvedValueOnce({});

    await updateHsmStatus('RECORDATORIO_R1', 'Aprobada');

    expect(api.patch).toHaveBeenCalledWith(
      '/config/notifications/templates/RECORDATORIO_R1/hsm',
      { HsmStatus: 'Aprobada' },
    );
  });
});

describe('restorePlantilla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama POST /config/notifications/templates/:tipo/restore', async () => {
    (api.post as Mock).mockResolvedValueOnce({});

    await restorePlantilla('RECORDATORIO_R1');

    expect(api.post).toHaveBeenCalledWith(
      '/config/notifications/templates/RECORDATORIO_R1/restore',
    );
  });
});

describe('previewPlantilla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama POST con Texto y ClienteId null cuando no se pasa clienteId', async () => {
    (api.post as Mock).mockResolvedValueOnce({
      data: { data: { TextoRenderizado: 'hola', VariablesNoEncontradas: [] } },
    });

    await previewPlantilla('Hola {{nombre}}');

    expect(api.post).toHaveBeenCalledWith(
      '/config/notifications/templates/preview',
      { Texto: 'Hola {{nombre}}', ClienteId: null },
    );
  });

  it('devuelve TextoRenderizado y VariablesNoEncontradas', async () => {
    const payload = { TextoRenderizado: 'Hola Carlos', VariablesNoEncontradas: [] };
    (api.post as Mock).mockResolvedValueOnce({ data: { data: payload } });

    const result = await previewPlantilla('Hola {{nombre}}');

    expect(result).toEqual(payload);
  });
});
