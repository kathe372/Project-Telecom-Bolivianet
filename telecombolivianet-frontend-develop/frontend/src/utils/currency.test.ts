import { describe, it, expect } from 'vitest';
import { formatBs, formatBsAmount } from './currency';

describe('currency — formatBsAmount / formatBs', () => {
  it('formatBsAmount: 0 decimales por defecto con separador de miles es-BO', () => {
    expect(formatBsAmount(1234)).toBe('1.234');
    expect(formatBsAmount(0)).toBe('0');
    expect(formatBsAmount(1000000)).toBe('1.000.000');
  });

  it('formatBsAmount: 2 decimales fija mínimo y máximo', () => {
    expect(formatBsAmount(1234.5, 2)).toBe('1.234,50');
    expect(formatBsAmount(1234, 2)).toBe('1.234,00');
    expect(formatBsAmount(0, 2)).toBe('0,00');
  });

  it('formatBs: prefija "Bs." canónico', () => {
    expect(formatBs(1234)).toBe('Bs. 1.234');
    expect(formatBs(350.75, 2)).toBe('Bs. 350,75');
  });

  it('preserva la salida del patrón dominante (minimumFractionDigits: 0)', () => {
    // Equivalencia con el patrón antiguo esparcido por el frontend
    const legacy = (1234).toLocaleString('es-BO', { minimumFractionDigits: 0 });
    expect(formatBsAmount(1234)).toBe(legacy);
  });
});
