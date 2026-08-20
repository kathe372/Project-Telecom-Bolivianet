/**
 * Formateo de moneda en bolivianos (locale es-BO). Centraliza el `toLocaleString`
 * antes disperso en ~15 sitios, unificando separadores, decimales y redondeo.
 */

/**
 * Número localizado sin prefijo. Para contextos que ya escriben "Bs." aparte
 * (tablas, PDF) o usan una variante de prefijo.
 *   formatBsAmount(1234)    -> "1.234"
 *   formatBsAmount(1234.5, 2) -> "1.234,50"
 */
export function formatBsAmount(value: number, decimals: 0 | 2 = 0): string {
  return value.toLocaleString('es-BO',
    decimals === 2
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0 });
}

/**
 * Monto con prefijo canónico "Bs.".
 *   formatBs(1234)     -> "Bs. 1.234"
 *   formatBs(1234.5, 2) -> "Bs. 1.234,50"
 */
export function formatBs(value: number, decimals: 0 | 2 = 0): string {
  return `Bs. ${formatBsAmount(value, decimals)}`;
}
