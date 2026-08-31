import { test, expect, APIRequestContext } from '@playwright/test';
import {
  comoAdmin, comoTecnico, sinSesion, estado, sobre, zz, zzNombre,
  documentoUnico, telefonoUnico,
} from './arnes';

/**
 * Módulo Cambios de plan — 30 casos.
 *
 * Era el hueco más incómodo de la medición de cobertura: cinco endpoints sin una
 * sola prueba de extremo a extremo, y son los que **mueven el precio que se
 * factura**.
 *
 * La regla de negocio de 2026-07 que se vigila aquí: un **downgrade** se aplica
 * a fin de mes —para no regalar el resto del mes ya cobrado— y un **upgrade**
 * puede aplicarse de inmediato, generando facturas proporcionales. Esa distinción
 * viaja en `?midMonth=`, y equivocarla cuesta dinero en una dirección o en la
 * otra.
 *
 * El flujo tiene tres pasos —solicitar, y luego aprobar o rechazar— con permisos
 * distintos en cada uno: solicitar lo puede hacer hasta el bot; decidir, solo un
 * administrador.
 */
test.describe('Cambios de plan', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string, planId: string;
  let planCaro: string, planBarato: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const e = estado(); clienteId = e.clienteId; planId = e.planId;

    // Dos planes con precios distintos: sin ellos no se puede distinguir un
    // upgrade de un downgrade, que es lo único que de verdad importa aquí.
    const caro = await admin.post('/api/plans', {
      data: { Name: zz('PlanCaro'), SpeedMb: 500, MonthlyPrice: 900 },
    });
    const barato = await admin.post('/api/plans', {
      data: { Name: zz('PlanBarato'), SpeedMb: 10, MonthlyPrice: 50 },
    });
    planCaro   = caro.status()   < 300 ? (await caro.json()).data.Id   : '';
    planBarato = barato.status() < 300 ? (await barato.json()).data.Id : '';
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  /**
   * Rechaza cuanto haya pendiente para el cliente.
   *
   * Hace falta porque el sistema admite **una sola solicitud pendiente por
   * cliente** (regla comprobada, y fijada en el caso 23). Sin esto, la primera
   * prueba que solicitara dejaría a todas las demás sin poder hacerlo.
   */
  async function limpiarPendientes(): Promise<void> {
    const s = await sobre(await admin.get(`/api/plan-changes/pending?clientId=${clienteId}`));
    for (const c of (s.data?.Items ?? s.data ?? [])) {
      await admin.patch(`/api/plan-changes/${c.Id}/reject`, {
        data: { Motivo: 'Limpieza previa de la suite E2E.' },
      });
    }
  }

  /** El plan que el cliente tiene ahora mismo. */
  async function planActual(): Promise<string> {
    const s = await sobre(await admin.get(`/api/clients/${clienteId}`));
    return s.data?.Plan?.Id ?? '';
  }

  /**
   * Un plan DISTINTO del que el cliente tiene ahora.
   *
   * Hace falta porque las pruebas de aprobación cambian el plan de verdad: tras
   * una ejecución el cliente se queda en el plan destino, y en la siguiente esa
   * misma solicitud se rechaza con «El cliente ya tiene ese plan». Fijar el
   * destino a mano hace la suite dependiente de su propia historia.
   */
  async function otroPlan(): Promise<string> {
    const actual = await planActual();
    for (const candidato of [planCaro, planBarato, planId]) {
      if (candidato && candidato !== actual) return candidato;
    }
    return '';
  }

  /**
   * Crea un cliente propio sobre el plan indicado.
   *
   * Las dos últimas pruebas necesitan controlar la DIRECCIÓN del cambio (subir o
   * bajar de precio), y eso exige saber de qué plan se parte. Reutilizar el
   * cliente compartido no sirve: las propias pruebas le cambian el plan.
   */
  async function clienteEn(plan: string): Promise<string> {
    const r = await admin.post('/api/clients', {
      data: {
        FullName: zzNombre('ClientePlan'), IdentityCard: documentoUnico(),
        PhoneMain: telefonoUnico(), PhoneSecondary: null,
        Zone: 'ZZ Zona', Street: 'Calle', LocationRef: null,
        GpsLatitude: null, GpsLongitude: null,
        WinboxNumber: documentoUnico(), InstallationDate: new Date().toISOString(),
        InstalledByUserId: estado().adminId, PlanId: plan,
        HasTvCable: false, OnuSerialNumber: null,
        InstallationCost: 0, PaidInstallation: true, PaidFirstMonth: false,
        PaymentMethod: 'Efectivo', Bank: null, PhysicalReceiptNumber: null,
      },
    });
    return r.status() < 300 ? (await r.json()).data.Id : '';
  }

  /** Deja UNA solicitud pendiente y devuelve su id (o '' si no se pudo). */
  async function solicitar(destino?: string): Promise<string> {
    await limpiarPendientes();
    const hacia = destino ?? await otroPlan();
    if (!hacia) return '';
    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: hacia, Notes: 'Solicitud de la suite E2E.' },
    });
    if (r.status() >= 300) return '';
    const j = await r.json();
    return j.data?.ChangeId ?? '';
  }

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · consultar pendientes sin sesión se rechaza', async () => {
    expect((await anon.get('/api/plan-changes/pending')).status()).toBe(401);
  });

  test('02 · solicitar un cambio sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: planId, Notes: null },
    });
    expect(r.status()).toBe(401);
  });

  test('03 · aprobar sin sesión se rechaza', async () => {
    expect((await anon.patch(`/api/plan-changes/${INEXISTENTE}/approve`)).status()).toBe(401);
  });

  test('04 · rechazar sin sesión se rechaza', async () => {
    const r = await anon.patch(`/api/plan-changes/${INEXISTENTE}/reject`, {
      data: { Motivo: 'motivo suficientemente largo' },
    });
    expect(r.status()).toBe(401);
  });

  test('05 · el historial de un cliente sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/clients/${clienteId}/plan-changes`)).status()).toBe(401);
  });

  test('06 · un Técnico SÍ puede ver los cambios pendientes', async () => {
    // Los necesita: es quien va a ejecutar el cambio en campo.
    expect((await tecnico.get('/api/plan-changes/pending')).status()).toBe(200);
  });

  test('07 · un Técnico SÍ puede solicitar un cambio', async () => {
    await limpiarPendientes();
    const destino = await otroPlan();
    expect(destino, 'hace falta un plan distinto del actual').toBeTruthy();
    const r = await tecnico.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: destino, Notes: 'Pedido por el cliente.' },
    });
    expect(r.status()).toBeLessThan(400);
  });

  test('08 · un Técnico NO puede APROBAR un cambio', async () => {
    // Solicitar y decidir son cosas distintas: aprobar cambia lo que se cobra.
    const r = await tecnico.patch(`/api/plan-changes/${INEXISTENTE}/approve`);
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede RECHAZAR un cambio', async () => {
    const r = await tecnico.patch(`/api/plan-changes/${INEXISTENTE}/reject`, {
      data: { Motivo: 'motivo suficientemente largo' },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico SÍ puede ver el historial de un cliente', async () => {
    expect((await tecnico.get(`/api/clients/${clienteId}/plan-changes`)).status()).toBe(200);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('11 · los pendientes responden con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/plan-changes/pending'));
    expect(s.success).toBe(true);
  });

  test('12 · los pendientes devuelven una colección', async () => {
    const s = await sobre(await admin.get('/api/plan-changes/pending'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('13 · los pendientes se pueden filtrar por cliente', async () => {
    const r = await admin.get(`/api/plan-changes/pending?clientId=${clienteId}`);
    expect(r.status()).toBe(200);
  });

  test('14 · filtrar por un cliente inexistente devuelve vacío, no error', async () => {
    const s = await sobre(await admin.get(`/api/plan-changes/pending?clientId=${INEXISTENTE}`));
    const items = s.data?.Items ?? s.data ?? [];
    expect(Array.isArray(items) && items.length === 0).toBe(true);
  });

  test('15 · el historial responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get(`/api/clients/${clienteId}/plan-changes`));
    expect(s.success).toBe(true);
  });

  test('16 · el historial de un cliente inexistente no rompe el servidor', async () => {
    const r = await admin.get(`/api/clients/${INEXISTENTE}/plan-changes`);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Solicitud ─────────────────────────────────────────────────────────────

  test('17 · solicitar un cambio a un plan válido devuelve 201 con el id', async () => {
    await limpiarPendientes();
    const destino = await otroPlan();
    expect(destino, 'hace falta un plan distinto del actual').toBeTruthy();
    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: destino, Notes: 'Cambia de plan.' },
    });
    expect(r.status()).toBe(201);
    expect((await r.json()).data?.ChangeId).toBeTruthy();
  });

  test('18 · la solicitud aparece luego entre las pendientes', async () => {
    // Contraprueba del 201: que devuelva un id no significa que quedara nada.
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la solicitud');
    const s = await sobre(await admin.get(`/api/plan-changes/pending?clientId=${clienteId}`));
    const items = s.data?.Items ?? s.data ?? [];
    expect(items.some((c: any) => c.Id === id)).toBe(true);
  });

  test('19 · un plan destino inexistente se rechaza', async () => {
    await limpiarPendientes();
    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: INEXISTENTE, Notes: null },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('20 · un cliente inexistente se rechaza', async () => {
    await limpiarPendientes();
    const r = await admin.post(`/api/clients/${INEXISTENTE}/plan-change`, {
      data: { NewPlanId: planId, Notes: null },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('21 · un cuerpo vacío se rechaza sin romper el servidor', async () => {
    await limpiarPendientes();
    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('22 · solicitar el cambio al plan que YA tiene se rechaza', async () => {
    // Un cambio a lo mismo no es un cambio: dejaría una solicitud que al
    // aprobarse no haría nada, y facturas proporcionales de cero.
    await limpiarPendientes();
    const s = await sobre(await admin.get(`/api/clients/${clienteId}`));
    // El plan viene anidado (`Plan.Id`), no como `PlanId` suelto.
    const actual = s.data?.Plan?.Id;
    expect(actual, 'el cliente debe tener un plan asignado').toBeTruthy();
    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: actual, Notes: null },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22b · un cliente NO puede tener DOS solicitudes pendientes', async () => {
    // Regla descubierta al escribir estas pruebas: si se admitieran dos, no
    // habría forma de saber cuál gana al aprobarlas, y el cliente podría acabar
    // en un plan que nadie eligió.
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la primera solicitud');

    const r = await admin.post(`/api/clients/${clienteId}/plan-change`, {
      data: { NewPlanId: await otroPlan(), Notes: 'Segunda, no debería entrar.' },
    });
    expect(r.status()).toBe(400);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('pendiente');
  });

  // ── Aprobación y rechazo ──────────────────────────────────────────────────

  test('23 · aprobar una solicitud inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/plan-changes/${INEXISTENTE}/approve`);
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('24 · rechazar una solicitud inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/plan-changes/${INEXISTENTE}/reject`, {
      data: { Motivo: 'motivo suficientemente largo' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('25 · rechazar sin motivo se rechaza', async () => {
    // Rechazar deja al cliente con el plan que no quería: sin motivo escrito,
    // nadie puede explicarle por qué cuando llame.
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la solicitud');
    const r = await admin.patch(`/api/plan-changes/${id}/reject`, { data: { Motivo: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('26 · rechazar con un motivo demasiado corto se rechaza', async () => {
    // El validador exige al menos 10 caracteres: "no" no es un motivo.
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la solicitud');
    const r = await admin.patch(`/api/plan-changes/${id}/reject`, { data: { Motivo: 'no' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('27 · rechazar con motivo válido funciona, y la saca de pendientes', async () => {
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la solicitud');

    const r = await admin.patch(`/api/plan-changes/${id}/reject`, {
      data: { Motivo: 'El cliente se retractó por teléfono.' },
    });
    expect(r.status()).toBeLessThan(300);

    const s = await sobre(await admin.get(`/api/plan-changes/pending?clientId=${clienteId}`));
    const items = s.data?.Items ?? s.data ?? [];
    expect(items.some((c: any) => c.Id === id),
      'una solicitud rechazada no puede seguir figurando como pendiente').toBe(false);
  });

  test('28 · una solicitud ya rechazada NO se puede aprobar después', async () => {
    // Si se pudiera, el cambio se aplicaría a espaldas de la decisión tomada.
    const id = await solicitar();
    test.skip(!id, 'no se pudo crear la solicitud');
    await admin.patch(`/api/plan-changes/${id}/reject`, {
      data: { Motivo: 'Rechazada para la prueba de doble decisión.' },
    });
    const r = await admin.patch(`/api/plan-changes/${id}/approve`);
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('29 · aprobar SIN midMonth difiere el cambio a fin de mes', async () => {
    // La regla de 2026-07: por defecto el cambio no se aplica hoy. El mensaje de
    // respuesta es la única señal observable desde fuera de cuál de las dos
    // ramas se tomó, y por eso se comprueba.
    const id = await solicitar();
    expect(id, 'no se pudo crear la solicitud').toBeTruthy();
    const s = await sobre(await admin.patch(`/api/plan-changes/${id}/approve`));
    expect((s.message ?? '').toLowerCase()).toContain('1ro del mes siguiente');
  });

  test('30 · un UPGRADE con midMonth=true sí se aplica de inmediato', async () => {
    // Subir de plan a mitad de mes es legítimo: el cliente pasa a pagar más y se
    // generan facturas proporcionales. Cliente propio, para partir de un plan
    // barato conocido y que el cambio sea inequívocamente hacia arriba.
    expect(planBarato && planCaro, 'hacen falta los dos planes').toBeTruthy();
    const cid = await clienteEn(planBarato);
    expect(cid, 'no se pudo crear el cliente de la prueba').toBeTruthy();

    const cr = await admin.post(`/api/clients/${cid}/plan-change`, {
      data: { NewPlanId: planCaro, Notes: 'Sube de plan.' },
    });
    expect(cr.status()).toBe(201);
    const id = (await cr.json()).data.ChangeId;

    const s = await sobre(await admin.patch(`/api/plan-changes/${id}/approve?midMonth=true`));
    expect((s.message ?? '').toLowerCase()).toContain('inmediatamente');
  });

  test('30b · un DOWNGRADE con midMonth=true se RECHAZA', async () => {
    // La otra mitad de la regla, y la que de verdad protege el dinero: bajar de
    // plan a mitad de mes regalaría el resto del mes ya cobrado. El sistema lo
    // impide aunque se lo pidan explícitamente.
    //
    // Esta prueba nació de un fallo mío: la anterior pedía midMonth sobre un
    // plan más barato y daba por hecho que se aplicaría. El sistema respondió
    // que no, y tenía razón.
    expect(planBarato && planCaro, 'hacen falta los dos planes').toBeTruthy();
    const cid = await clienteEn(planCaro);
    expect(cid, 'no se pudo crear el cliente de la prueba').toBeTruthy();

    const cr = await admin.post(`/api/clients/${cid}/plan-change`, {
      data: { NewPlanId: planBarato, Notes: 'Baja de plan.' },
    });
    expect(cr.status()).toBe(201);
    const id = (await cr.json()).data.ChangeId;

    const r = await admin.patch(`/api/plan-changes/${id}/approve?midMonth=true`);
    expect(r.status()).toBe(400);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('fin de mes');
  });
});
