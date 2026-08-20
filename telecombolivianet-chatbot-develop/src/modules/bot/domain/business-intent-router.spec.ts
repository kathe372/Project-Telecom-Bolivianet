import { detectarIntencionNegocio } from './business-intent-router';

/**
 * Medido en produccion (2026-08-07): "Hola quiero realizar la instalación" ->
 * el bot ejecuto send_payment_qr. Entendio la frase; se equivoco al elegir
 * entre 25 herramientas, arrastrando que el cliente habia pedido el QR minutos
 * antes.
 */
describe('detectarIntencionNegocio', () => {
  describe('rutea lo evidente', () => {
    it.each([
      ['quiero realizar la instalación',      'instalacion'],
      ['Hola quiero la instalacion',          'instalacion'],
      ['necesito contratar internet',         'instalacion'],
      ['quiero agendar una instalación',      'instalacion'],
      ['cuánto debo',                         'deuda'],
      ['cuanto adeudo?',                      'deuda'],
      ['mi deuda',                            'deuda'],
      ['tengo facturas pendientes?',          'deuda'],
      ['quiero pagar',                        'pagar'],
      ['pasame el qr',                        'pagar'],
      ['mandame el código QR',                'pagar'],
      ['qué planes tienen',                   'planes'],
      ['planes disponibles',                  'planes'],
    ])('"%s" → %s', (texto, esperado) => {
      expect(detectarIntencionNegocio(texto)).toBe(esperado);
    });
  });

  // Adivinar entre dos opciones plausibles es el error que ya cometimos hoy con
  // el mapeo de si/no, que elegia el primer boton por descarte.
  describe('NO rutea cuando hay duda', () => {
    it('dos intenciones a la vez las decide el modelo', () => {
      expect(detectarIntencionNegocio('quiero pagar mi deuda')).toBeNull();
    });

    it.each([
      '¿el router viene incluido con la instalación?',
      '¿cuánto cuesta la instalación?',
      '¿el plan oro tiene wifi?',
      'hola',
      'gracias',
      '',
    ])('"%s" no se rutea', (texto) => {
      expect(detectarIntencionNegocio(texto)).toBeNull();
    });

    // Un mensaje largo trae matices que conviene que lea el modelo.
    it('un mensaje largo se deja al modelo aunque mencione la intencion', () => {
      const largo = 'hola buenas tardes queria consultarles si por casualidad ustedes '
                  + 'hacen la instalación en la zona de Vinto o solamente en Quillacollo';
      expect(detectarIntencionNegocio(largo)).toBeNull();
    });
  });

  // Estas son consultas informativas: las responde el RAG con la documentacion,
  // no el flujo de alta.
  it('mencionar la palabra no alcanza para disparar el flujo', () => {
    expect(detectarIntencionNegocio('la instalación es gratis?')).toBeNull();
    expect(detectarIntencionNegocio('cuando fue mi instalación?')).toBeNull();
  });
});
