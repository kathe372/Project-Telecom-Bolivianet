import { ClientInfoSection } from './client-info.section';
import { buildClientSession, buildSession } from '../../../test/factories/session.factory';

describe('ClientInfoSection — BUG-04 frescura de ubicación en el prompt', () => {
  const section = new ClientInfoSection();
  const LOC = { lat: -17.389, lng: -66.156 };

  it('ubicación FRESCA (5 min) → la afirma en el prompt', () => {
    const session = buildClientSession({
      lastLocation: LOC, locationCapturedAt: Date.now() - 5 * 60_000,
    });
    const prompt = section.render(session);
    expect(prompt).toContain('Ubicación GPS compartida: lat=-17.389, lng=-66.156');
    expect(prompt).not.toContain('puede estar desactualizada');
  });

  it('ubicación CADUCADA (40 min) → NO la afirma; avisa que pida de nuevo', () => {
    const session = buildClientSession({
      lastLocation: LOC, locationCapturedAt: Date.now() - 40 * 60_000,
    });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Ubicación GPS compartida: lat=');
    expect(prompt).toContain('puede estar desactualizada');
  });

  it('sin ubicación → no menciona nada de ubicación', () => {
    const session = buildClientSession({ lastLocation: null, locationCapturedAt: null });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Ubicación GPS compartida');
    expect(prompt).not.toContain('puede estar desactualizada');
  });
});

describe('ClientInfoSection — datos de prospecto guardados con save_prospect_data', () => {
  const section = new ClientInfoSection();

  it('prospecto con nombre/CI/dirección ya guardados → los reinyecta frescos e indica no volver a pedirlos', () => {
    const session = buildSession({
      prospectName: 'Jhael Katherine Arce Chavez', prospectIdentityCard: '8041022',
      prospectAddress: 'La Huerta, Cochabamba',
    });
    const prompt = section.render(session);
    expect(prompt).toContain('Datos YA guardados para la instalación');
    expect(prompt).toContain('nombre: Jhael Katherine Arce Chavez');
    expect(prompt).toContain('CI: 8041022');
    expect(prompt).toContain('dirección: La Huerta, Cochabamba');
    expect(prompt).toContain('NO los vuelvas a pedir');
  });

  it('prospecto con solo un dato guardado (parcial) → solo muestra ese', () => {
    const session = buildSession({ prospectName: 'Jhael', prospectIdentityCard: null, prospectAddress: null });
    const prompt = section.render(session);
    expect(prompt).toContain('nombre: Jhael');
    expect(prompt).not.toContain('CI:');
    expect(prompt).not.toContain('dirección:');
  });

  it('prospecto sin nada guardado → no menciona la sección', () => {
    const session = buildSession({ prospectName: null, prospectIdentityCard: null, prospectAddress: null });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Datos YA guardados');
  });

  it('cliente REGISTRADO (no prospecto) → nunca muestra el hint aunque tuviera datos residuales', () => {
    const session = buildClientSession({ prospectName: 'Residual', prospectIdentityCard: '111' });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Datos YA guardados');
  });
});

describe('ClientInfoSection — plansShown (evita repreguntar "¿querés ver los planes?")', () => {
  const section = new ClientInfoSection();

  it('prospecto que ya vio los planes → avisa que no hay que preguntar de nuevo', () => {
    const session = buildSession({ plansShown: true });
    const prompt = section.render(session);
    expect(prompt).toContain('Los planes YA se le mostraron a este cliente');
    expect(prompt).toContain('NO le preguntes si quiere verlos de nuevo');
  });

  it('prospecto que NO vio los planes todavía → no menciona nada', () => {
    const session = buildSession({ plansShown: false });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Los planes YA se le mostraron');
  });
});

describe('ClientInfoSection — selectedPlanId (2026-08-05: el bot volvía a pedir el plan)', () => {
  const section = new ClientInfoSection();
  const PLAN_ID = '00000000-0000-0000-0001-000000000097';

  it('prospecto con plan ya elegido → avisa que no hay que volver a pedirlo', () => {
    const session = buildSession({ selectedPlanId: PLAN_ID });
    const prompt = section.render(session);
    expect(prompt).toContain('Plan YA elegido por el cliente');
    expect(prompt).toContain('NO le vuelvas a preguntar qué plan quiere');
  });

  it('prospecto sin plan elegido todavía → no menciona nada', () => {
    const session = buildSession({ selectedPlanId: null });
    const prompt = section.render(session);
    expect(prompt).not.toContain('Plan YA elegido');
  });

  it('sobrevive a la pérdida de contexto: plan elegido + nombre/CI/telefono ya guardados juntos', () => {
    // Reproduce el bug reportado: tras 3 turnos pidiendo nombre/CI/teléfono de
    // respaldo, el turno donde se tocó el botón del plan ya no está en el
    // historial — este hint es lo único que le recuerda al modelo que ya hay
    // un plan elegido.
    const session = buildSession({
      selectedPlanId: PLAN_ID,
      prospectName: 'Jhael', prospectIdentityCard: '8041022', prospectBackupPhone: '70000001',
    });
    const prompt = section.render(session);
    expect(prompt).toContain('Plan YA elegido');
    expect(prompt).toContain('Datos YA guardados para la instalación');
  });

  it('cliente REGISTRADO con plan elegido (ej. instalación adicional) → también avisa', () => {
    const session = buildClientSession({ selectedPlanId: PLAN_ID });
    const prompt = section.render(session);
    expect(prompt).toContain('Plan YA elegido por el cliente');
  });
});
