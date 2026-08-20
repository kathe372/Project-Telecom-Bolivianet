import { Inject, Injectable, Logger } from '@nestjs/common';
import { IClientRepository, CLIENT_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { InvoiceDiscrepancyExplainer, InvoiceForComparison } from '../domain/invoice-discrepancy-explainer';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const PERIOD_RE = /^(\d{4})-(\d{2})$/;

function parsePeriod(value: string): { year: number; month: number } | null {
  const m = PERIOD_RE.exec(value.trim());
  if (!m) return null;
  const year  = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Mes calendario inmediatamente anterior — no un promedio, que diluiría
 *  silenciosamente un cambio de plan reciente. */
function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

@Injectable()
export class ExplainInvoiceDifferenceTool implements AgentTool {
  private readonly logger = new Logger(ExplainInvoiceDifferenceTool.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    private readonly explainer: InvoiceDiscrepancyExplainer,
  ) {}

  getName(): string { return 'explain_invoice_difference'; }
  requiresIdentification(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Explica por qué el monto de una factura es distinto a otra, usando el motivo ' +
        'REAL registrado en el sistema. SIEMPRE usar esta herramienta ante preguntas de ' +
        '"por qué mi factura de [mes] es mayor/menor" — NUNCA responder esa pregunta ' +
        'inventando impuestos, moras u otras razones sin llamarla primero. ' +
        'Convierte la fecha que mencione el cliente a formato YYYY-MM antes de llamar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          periodo_a_explicar: {
            type: 'STRING',
            description: 'Mes/año de la factura en cuestión, formato YYYY-MM, ej: "2026-05"',
          },
          periodo_base: {
            type: 'STRING',
            description:
              'Mes/año contra el que comparar, formato YYYY-MM. Si el cliente dice ' +
              '"es mayor que las anteriores" sin especificar cuál, omitir este campo — ' +
              'la herramienta usa por defecto el mes calendario inmediatamente anterior.',
          },
        },
        required: ['periodo_a_explicar'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const targetPeriod = parsePeriod((args.periodo_a_explicar as string) || '');
    if (!targetPeriod) {
      return { explained: false, error: 'periodo_a_explicar inválido. Usa el formato YYYY-MM, ej: "2026-05".' };
    }

    const baselineArg = (args.periodo_base as string | undefined)?.trim();
    const baselinePeriod = baselineArg ? parsePeriod(baselineArg) : previousMonth(targetPeriod.year, targetPeriod.month);
    if (!baselinePeriod) {
      return { explained: false, error: 'periodo_base inválido. Usa el formato YYYY-MM, ej: "2026-04".' };
    }

    try {
      const years = Array.from(new Set([targetPeriod.year, baselinePeriod.year]));
      const invoicesByYear = await Promise.all(
        years.map((year) => this.clientRepo.getClientInvoices(session.clientId!, year)),
      );
      const seen = new Set<string>();
      const allInvoices = invoicesByYear.flat().filter((inv) => {
        if (seen.has(inv.Id)) return false;
        seen.add(inv.Id);
        return true;
      });

      const findInvoice = (p: { year: number; month: number }) =>
        allInvoices.find((inv) => inv.Year === p.year && inv.Month === p.month);

      const targetInvoice   = findInvoice(targetPeriod);
      const baselineInvoice = findInvoice(baselinePeriod);

      const label = (p: { year: number; month: number }) => `${MONTHS[p.month - 1]} ${p.year}`;

      if (!targetInvoice) {
        return {
          explained: false,
          message: `No encuentro una factura de ${label(targetPeriod)} para este cliente.`,
        };
      }
      if (!baselineInvoice) {
        return {
          explained: false,
          message:
            `No encuentro una factura de ${label(baselinePeriod)} para comparar. ` +
            `Un agente puede revisar el historial completo.`,
        };
      }

      const toComparison = (
        inv: typeof targetInvoice, period: { year: number; month: number },
      ): InvoiceForComparison => ({
        period:   label(period),
        amount:   inv!.Amount,
        notes:    inv!.Notes ?? null,
        planName: inv!.PlanName ?? null,
      });

      const result = this.explainer.explain(
        toComparison(baselineInvoice, baselinePeriod),
        toComparison(targetInvoice, targetPeriod),
      );

      return { explained: result.hasExplanation, message: result.message };
    } catch (err: any) {
      this.logger.error(`ExplainInvoiceDifferenceTool error: ${err.message}`);
      return { explained: false, error: `No se pudo comparar las facturas: ${err.message}` };
    }
  }
}
