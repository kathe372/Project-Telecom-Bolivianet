import { TextChunker } from './text-chunker';

describe('TextChunker', () => {
  let chunker: TextChunker;

  beforeEach(() => {
    chunker = new TextChunker();
  });

  describe('BUG-R1: guarda anti-bucle infinito', () => {
    it('lanza error si overlap >= size (evita que start no avance)', () => {
      expect(() => chunker.split('palabra '.repeat(50), 10, 10)).toThrow(/overlap/);
      expect(() => chunker.split('palabra '.repeat(50), 10, 20)).toThrow(/overlap/);
    });

    it('lanza error si size <= 0', () => {
      expect(() => chunker.split('texto', 0, 0)).toThrow(/size/);
    });

    it('con overlap < size NO se cuelga y produce chunks', () => {
      const out = chunker.split('palabra '.repeat(250).trim(), 100, 20);
      expect(out.length).toBeGreaterThan(1);
    });
  });

  describe('formato FAQ (bloques de pregunta ¿)', () => {
    const faq =
      '¿Cuál es el horario? Atendemos de lunes a viernes de 8 a 20 horas sin excepción. ' +
      '¿Cómo pago mi factura? Puede pagar por QR o en oficinas durante horario laboral. ' +
      '¿Hay costo de instalación? La instalación es gratuita dentro de zonas con cobertura de fibra.';

    it('parte por preguntas cuando hay >= 3 bloques ¿', () => {
      const out = chunker.split(faq, 100, 20);
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.join(' ')).toContain('horario');
      expect(out.join(' ')).toContain('instalación');
    });

    it('cada bloque de pregunta se conserva íntegro (no se parte a media pregunta)', () => {
      const out = chunker.split(faq, 15, 5); // size chico → un chunk por pregunta
      expect(out.some((c) => c.startsWith('¿Cuál es el horario?'))).toBe(true);
    });
  });

  describe('texto plano (ventana de palabras)', () => {
    it('usa ventana de palabras cuando no es formato FAQ', () => {
      const texto = Array.from({ length: 250 }, (_, i) => `palabra${i}`).join(' ');
      const out = chunker.split(texto, 100, 20);
      expect(out.length).toBe(4); // 250 palabras, paso 80 → 0,80,160,240
    });

    it('descarta fragmentos demasiado cortos (< 20 chars)', () => {
      expect(chunker.split('hola', 100, 20)).toEqual([]);
    });
  });
});
