import { Inject, Injectable, Logger } from '@nestjs/common';
import { IClientRepository, CLIENT_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { isUnpaid, outstandingAmount, totalOutstanding } from '../domain/invoice-debt';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Injectable()
export class GetClientDebtTool implements AgentTool {
  private readonly logger = new Logger(GetClientDebtTool.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'get_client_debt'; }
  requiresIdentification(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Consulta las facturas pendientes del cliente. ' +
        'Usar cuando pregunte por deuda, cuánto debe, facturas, o períodos pendientes.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    try {
      const currentYear = new Date().getFullYear();

      const [currentInvoices, prevInvoices] = await Promise.all([
        this.clientRepo.getClientInvoices(session.clientId!, currentYear),
        this.clientRepo.getClientInvoices(session.clientId!, currentYear - 1),
      ]);

      // El backend devuelve las facturas de instalación en CUALQUIER año, así que
      // las dos consultas se solapan. Se deduplica por Id: la clave anterior
      // (`Year-Month`) colapsaba la mensualidad y la instalación del mismo mes,
      // haciendo desaparecer una de las dos de la deuda.
      const seen = new Set<string>();
      const allInvoices = [...prevInvoices, ...currentInvoices].filter((inv) => {
        if (seen.has(inv.Id)) return false;
        seen.add(inv.Id);
        return true;
      });

      const invoices = allInvoices
        .filter(isUnpaid)
        .sort((a, b) => a.Year !== b.Year ? a.Year - b.Year : a.Month - b.Month);

      if (invoices.length === 0) {
        await this.sessionService.updateSession(session.phoneNumber, { totalDebt: 0 });
        return {
          hasPendingDebt: false,
          totalDebt: 0,
          message: 'El cliente está al día — no tiene facturas pendientes.',
        };
      }

      const total = totalOutstanding(invoices);
      await this.sessionService.updateSession(session.phoneNumber, { totalDebt: total });

      const detail = invoices.map((inv) => ({
        period:  `${MONTHS[Math.max(0, Math.min(11, inv.Month - 1))]} ${inv.Year}`,
        amount:  outstandingAmount(inv),
        status:  inv.Status,
        dueDate: inv.DueDate,
      }));

      return {
        hasPendingDebt: true,
        totalDebt:      total,
        pendingCount:   invoices.length,
        invoices:       detail,
        // MEJORA-1C: acciones rápidas junto al detalle de deuda
        _quickReplies: [
          { id: 'solicitar_qr',     title: '📲 Pagar con QR' },
          { id: 'solicitar_agente', title: '👤 Hablar con agente' },
        ],
      };
    } catch (err: any) {
      this.logger.error(`GetClientDebtTool error: ${err.message}`);
      return { error: `No se pudo consultar la deuda: ${err.message}` };
    }
  }
}
