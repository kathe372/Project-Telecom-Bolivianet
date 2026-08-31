import { test as setup, expect, request as apiRequest } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { USUARIOS } from '../apoyo';
import { ARCHIVO, BASE, EstadoApi, documentoUnico, telefonoUnico, zz, zzNombre } from './arnes';

/**
 * Prepara TODO lo que las pruebas de API van a reutilizar: dos sesiones y los
 * datos base.
 *
 * Se hace una sola vez, y esa es la razón de que exista: iniciar sesión en cada
 * prueba agotaría en segundos el presupuesto de 10 peticiones cada 5 minutos por
 * IP de los endpoints de autenticación (DISP-01). Aquí se gastan 2.
 *
 * Los datos base (un plan y un cliente) se crean por la API real, no por SQL:
 * si su creación se rompiera, esta preparación falla y se ve de inmediato, en
 * lugar de que fallen doscientas pruebas sin explicar por qué.
 */
setup('preparar sesiones y datos base de API', async () => {
  // ── Reutilizar la preparación anterior si sigue viva ──────────────────────
  // El token dura 8 horas. Volver a pedirlo en cada ejecución gasta dos de las
  // diez peticiones que admite la ventana de 5 minutos, y basta con ejecutar la
  // suite tres veces seguidas para quedarse fuera. Se comprueba el token contra
  // un endpoint real: si responde, no hay nada que rehacer.
  if (existsSync(ARCHIVO)) {
    const previo: EstadoApi = JSON.parse(readFileSync(ARCHIVO, 'utf-8'));

    // Se comprueban LOS DOS tokens, no solo el del administrador. El del
    // técnico se invalida en cada ejecución: `17-cierre-sesion.spec.ts` lo usa
    // para probar que cerrar sesión funciona de verdad, y eso lo mete en la
    // lista negra. Sondear solo el del administrador dejaba pasar un token de
    // técnico ya muerto, y todos los casos de rol fallaban con 401.
    const vivo = async (token: string) => {
      const sonda = await apiRequest.newContext({
        baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      });
      const r = await sonda.get('/api/profile');
      await sonda.dispose();
      return r.status() === 200;
    };

    if (await vivo(previo.tokenAdmin) && await vivo(previo.tokenTecnico)) return;
  }

  const anonimo = await apiRequest.newContext({ baseURL: BASE });

  async function entrar(email: string, password: string) {
    const r = await anonimo.post('/api/auth/login', { data: { Email: email, Password: password } });
    expect(r.status(), `no se pudo iniciar sesión como ${email}`).toBe(200);
    const j = await r.json();
    return { token: j.data.Token as string, id: j.data.UserId as string };
  }

  const admin   = await entrar(USUARIOS.admin.email,   USUARIOS.admin.password);
  const tecnico = await entrar(USUARIOS.tecnico.email, USUARIOS.tecnico.password);
  await anonimo.dispose();

  const api = await apiRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` },
  });

  // ── Plan base ─────────────────────────────────────────────────────────────
  const planNombre = zz('Plan');
  const rPlan = await api.post('/api/plans', {
    data: { Name: planNombre, SpeedMb: 50, MonthlyPrice: 200 },
  });
  expect(rPlan.status(), 'no se pudo crear el plan base').toBeLessThan(300);
  const planId = (await rPlan.json()).data.Id as string;

  // ── Cliente base ──────────────────────────────────────────────────────────
  const telefono = telefonoUnico();
  const rCliente = await api.post('/api/clients', {
    data: {
      FullName: zzNombre('Cliente'),
      IdentityCard: documentoUnico(),
      PhoneMain: telefono,
      PhoneSecondary: null,
      Zone: 'ZZ-E2E Zona',
      Street: 'Calle de prueba',
      LocationRef: null,
      GpsLatitude: null,
      GpsLongitude: null,
      WinboxNumber: documentoUnico(),
      InstallationDate: new Date().toISOString(),
      InstalledByUserId: admin.id,
      PlanId: planId,
      HasTvCable: false,
      OnuSerialNumber: null,
      InstallationCost: 0,
      PaidInstallation: true,
      PaidFirstMonth: false,
      PaymentMethod: null,
      Bank: null,
      PhysicalReceiptNumber: null,
    },
  });
  expect(rCliente.status(), `no se pudo crear el cliente base: ${await rCliente.text()}`)
    .toBeLessThan(300);
  const cliente = (await rCliente.json()).data;

  await api.dispose();

  const est: EstadoApi = {
    tokenAdmin:   admin.token,
    tokenTecnico: tecnico.token,
    adminId:      admin.id,
    tecnicoId:    tecnico.id,
    planId,
    planNombre,
    clienteId:       cliente.Id,
    clienteTbn:      cliente.TbnCode ?? cliente.ClientCode ?? '',
    clienteTelefono: telefono,
  };
  writeFileSync(ARCHIVO, JSON.stringify(est, null, 2));
});
