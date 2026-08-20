const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿Tiene forma de UUID? Solo valida formato, no confirma que el plan exista
 * en la base de datos — eso lo hace el backend al intentar usarlo.
 *
 * PASO 2 (2026-08): antes solo `create-installation.tool.ts` validaba esto;
 * `change-plan.tool.ts` no, y eso permitió que el LLM le pasara un plan_id
 * inventado (ej. "plan_platinium") directo al backend, produciendo el error
 * confuso "El plan que seleccionó no existe o está inactivo" en vez de pedirle
 * al LLM que llame primero a get_available_plans.
 */
export function isValidPlanId(planId: string | null | undefined): planId is string {
  return !!planId && UUID_REGEX.test(planId);
}
