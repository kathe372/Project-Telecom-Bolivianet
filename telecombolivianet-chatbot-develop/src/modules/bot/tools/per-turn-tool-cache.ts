/**
 * BUG-13: caché de resultados de herramientas de SOLO LECTURA dentro de un
 * mismo turno ReAct. El modelo tiende a re-llamar get_available_plans varias
 * veces en un turno; cada llamada repetida cuesta latencia y una petición al
 * backend sin aportar información nueva (los datos no cambian en segundos).
 * El caché vive y muere con el executor del turno — nunca entre mensajes.
 */
export class PerTurnToolCache {

  private static readonly CACHEABLE_TOOLS = new Set([
    'get_available_plans',
    'get_installation_slots',
    'check_coverage',
  ]);

  private readonly cache = new Map<string, unknown>();

  isCacheable(toolName: string): boolean {
    return PerTurnToolCache.CACHEABLE_TOOLS.has(toolName);
  }

  get(toolName: string, args: Record<string, unknown>): unknown | undefined {
    return this.cache.get(this.key(toolName, args));
  }

  set(toolName: string, args: Record<string, unknown>, result: unknown): void {
    this.cache.set(this.key(toolName, args), result);
  }

  private key(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}:${JSON.stringify(args ?? {})}`;
  }
}
