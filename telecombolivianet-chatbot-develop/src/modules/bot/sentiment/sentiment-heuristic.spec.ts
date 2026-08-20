import { SentimentHeuristic } from './sentiment-heuristic';

describe('SentimentHeuristic (Opt-A: reglas antes del LLM)', () => {
  let h: SentimentHeuristic;

  beforeEach(() => {
    h = new SentimentHeuristic();
  });

  describe('detecta enojo evidente (sin gastar LLM)', () => {
    it.each([
      'esto es una ESTAFA, no sirve NADA!!!',
      'qué servicio más pésimo',
      'son unos ladrones',
      'este internet es una basura',
      'voy a denunciar a la empresa',
      'NO SIRVE NADA!!!',
    ])('angry: "%s"', (t) => {
      expect(h.classify(t)).toBe('angry');
    });
  });

  describe('resuelve neutral evidente (sin gastar LLM)', () => {
    it.each(['sí', 'no', 'ok', 'gracias', 'listo', 'hola', 'dale', 'perfecto', 'no gracias, todo bien'])(
      'neutral: "%s"', (t) => {
        expect(h.classify(t)).toBe('neutral');
      });
    it('texto vacío → neutral', () => {
      expect(h.classify('   ')).toBe('neutral');
    });
  });

  describe('deja al LLM los casos ambiguos (devuelve null)', () => {
    it.each([
      'llevo tres días esperando y nadie me responde',
      'me gustaría saber si el plata incluye tv',
      '¿por qué mi factura subió este mes?',
    ])('ambiguo: "%s"', (t) => {
      expect(h.classify(t)).toBeNull();
    });
  });

  describe('NO da falsos positivos', () => {
    it('"no sirve para nada" con contexto de queja → angry (ok)', () => {
      expect(h.classify('no sirve')).toBe('angry');
    });
    it('una frase larga informativa sin señales → null (que decida el LLM)', () => {
      expect(h.classify('quisiera cambiar la fecha de mi instalación para la próxima semana por favor'))
        .toBeNull();
    });
    it('mayúsculas cortas (sigla) NO es grito', () => {
      expect(h.classify('mi TV no anda')).toBe('neutral'); // corto, sin signos
    });
  });
});
