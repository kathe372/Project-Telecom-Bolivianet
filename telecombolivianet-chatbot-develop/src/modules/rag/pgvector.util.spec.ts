import { toSqlVector } from './pgvector.util';

describe('toSqlVector (DRY del formato pgvector)', () => {
  it('formatea un vector como literal [a,b,c]', () => {
    expect(toSqlVector([1, 2, 3])).toBe('[1,2,3]');
  });

  it('maneja decimales y negativos', () => {
    expect(toSqlVector([0.5, -0.25, 1.75])).toBe('[0.5,-0.25,1.75]');
  });

  it('vector vacío → []', () => {
    expect(toSqlVector([])).toBe('[]');
  });
});
