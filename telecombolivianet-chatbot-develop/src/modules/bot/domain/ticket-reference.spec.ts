import { customerFacingTicketRef } from './ticket-reference';

describe('customerFacingTicketRef', () => {
  it('usa TicketNumber cuando está presente', () => {
    const ref = customerFacingTicketRef({ Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8', TicketNumber: 'TK-2026-0047' });
    expect(ref).toBe('TK-2026-0047');
  });

  it('cae al fragmento corto del GUID cuando TicketNumber es null', () => {
    const ref = customerFacingTicketRef({ Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8', TicketNumber: null });
    expect(ref).toBe('TK-9F2A1C3B');
  });

  it('cae al fragmento corto del GUID cuando TicketNumber es undefined', () => {
    const ref = customerFacingTicketRef({ Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });
    expect(ref).toBe('TK-9F2A1C3B');
  });

  it('cae al fragmento corto del GUID cuando TicketNumber es cadena vacía', () => {
    const ref = customerFacingTicketRef({ Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8', TicketNumber: '  ' });
    expect(ref).toBe('TK-9F2A1C3B');
  });

  it('nunca devuelve el GUID completo de 36 caracteres', () => {
    const id = '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8';
    const ref = customerFacingTicketRef({ Id: id, TicketNumber: null });
    expect(ref).not.toContain(id);
    expect(ref.length).toBeLessThan(id.length);
  });
});
