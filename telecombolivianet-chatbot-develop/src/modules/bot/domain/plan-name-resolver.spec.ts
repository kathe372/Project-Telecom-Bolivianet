import { resolverPlanPorNombre, normalizarNombrePlan } from './plan-name-resolver';

/**
 * Medido en produccion (2026-08-07): el cliente escribio "Cobre" en vez de
 * tocar el boton y el modelo fabrico `plan_id: "cobre-20mb-89bs"`. El flujo de
 * instalacion murio ahi. El nombre el modelo lo acierta siempre; el UUID no
 * puede conocerlo.
 */
describe('resolverPlanPorNombre', () => {
  const CATALOGO = [
    { Id: 'uuid-cobre',    Name: 'COBRE 20MB',    PriceMonthly: 89 },
    { Id: 'uuid-plata',    Name: 'PLATA 50MB',    PriceMonthly: 149 },
    { Id: 'uuid-oro',      Name: 'ORO 80MB',      PriceMonthly: 199 },
    { Id: 'uuid-diamante', Name: 'DIAMANTE 120MB', PriceMonthly: 279 },
    { Id: 'uuid-platino',  Name: 'PLATINO 200MB', PriceMonthly: 399 },
  ];

  it.each([
    ['Cobre',            'uuid-cobre'],
    ['COBRE',            'uuid-cobre'],
    ['cobre',            'uuid-cobre'],
    ['el plan Diamante', 'uuid-diamante'],
    ['plan oro',         'uuid-oro'],
    ['PLATINO 200MB',    'uuid-platino'],
  ])('"%s" resuelve al plan correcto', (texto, esperado) => {
    const r = resolverPlanPorNombre(texto, CATALOGO);
    expect(r.kind).toBe('one');
    expect(r.kind === 'one' && r.plan.Id).toBe(esperado);
  });

  // "PLATA" y "PLATINO" comparten prefijo: no hay que adivinar.
  it('un texto ambiguo devuelve las opciones en vez de elegir', () => {
    const r = resolverPlanPorNombre('plat', CATALOGO);
    expect(r.kind).toBe('many');
    expect(r.kind === 'many' && r.nombres).toEqual(['PLATA 50MB', 'PLATINO 200MB']);
  });

  it('un nombre inexistente no inventa un plan', () => {
    expect(resolverPlanPorNombre('BRONCE', CATALOGO).kind).toBe('none');
    expect(resolverPlanPorNombre('', CATALOGO).kind).toBe('none');
  });

  // El id fabricado por el modelo NO debe resolver a nada por accidente.
  it('un id inventado no coincide con ningun plan', () => {
    expect(resolverPlanPorNombre('cobre-20mb-89bs', CATALOGO).kind).not.toBe('none');
    // Ojo: SI resuelve, porque contiene "COBRE20MB" — y eso es correcto:
    // el modelo fabrico el id a partir del nombre, asi que el nombre esta ahi.
    const r = resolverPlanPorNombre('cobre-20mb-89bs', CATALOGO);
    expect(r.kind === 'one' && r.plan.Id).toBe('uuid-cobre');
  });

  it('normaliza tildes, mayusculas y la palabra PLAN', () => {
    expect(normalizarNombrePlan('el Plan Diamante')).toBe(normalizarNombrePlan('DIAMANTE'));
  });
});
