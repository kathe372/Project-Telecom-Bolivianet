export interface PlanBasico { Id: string; Name: string; PriceMonthly: number }

export type ResolucionPlan =
  | { kind: 'one'; plan: PlanBasico }
  | { kind: 'many'; nombres: string[] }
  | { kind: 'none' };

/**
 * Normaliza un nombre de plan para compararlo: sin tildes, en mayúsculas, sin
 * la palabra "PLAN" y sin separadores. Así "plan Diamante", "DIAMANTE" y
 * "diamante 120mb" caen en la misma forma.
 */
export function normalizarNombrePlan(valor: string): string {
  return (valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    // Además de "PLAN" se quitan artículos y posesivos: sin esto "el plan
    // Diamante" quedaba como "ELDIAMANTE" y no coincidía con ningún catálogo.
    // Lo descubrió un test al extraer esta pieza — la versión original dentro
    // de change_plan arrastra la misma limitación.
    .replace(/\b(PLAN(ES)?|EL|LA|LOS|LAS|UN|UNA|MI|MIS|AL|DEL|DE)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Resuelve un plan por NOMBRE contra el catálogo real.
 *
 * Por qué existe como pieza compartida (2026-08-07): el modelo no puede conocer
 * el UUID de un plan — el resultado de get_available_plans no sobrevive al
 * turno — así que cuando el cliente escribe "COBRE" en vez de tocar el botón,
 * lo inventa. Medido en producción: `plan_id: "cobre-20mb-89bs"`, fabricado a
 * partir del nombre y el precio. El flujo de instalación moría ahí.
 *
 * `change_plan` ya resolvía por nombre y funcionaba; `get_installation_slots` y
 * `create_installation` sólo validaban el formato del UUID y le pedían al
 * modelo que se corrigiera solo — que es justo lo que aprendimos que no hace.
 *
 * El nombre, en cambio, el modelo lo acierta siempre: es lo que dijo el cliente.
 */
export function resolverPlanPorNombre(
  texto: string, planes: PlanBasico[],
): ResolucionPlan {
  const buscado = normalizarNombrePlan(texto);
  if (!buscado) return { kind: 'none' };

  const coincidencias = planes.filter((p) => {
    const nombre = normalizarNombrePlan(p.Name);
    return nombre === buscado || buscado.includes(nombre) || nombre.includes(buscado);
  });

  if (coincidencias.length === 1) return { kind: 'one', plan: coincidencias[0] };
  if (coincidencias.length > 1)   return { kind: 'many', nombres: coincidencias.map((p) => p.Name) };
  return { kind: 'none' };
}
