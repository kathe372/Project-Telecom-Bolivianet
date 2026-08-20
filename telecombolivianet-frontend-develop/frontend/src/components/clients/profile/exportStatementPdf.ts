import type { ClientDetailDto, InvoiceGridDto } from '@/types/client.types';

/**
 * Abre una ventana con el extracto de pagos del cliente en HTML y lanza el
 * diálogo de impresión del navegador (impresión a PDF).
 */
export function exportStatementPdf(client: ClientDetailDto, grid: InvoiceGridDto) {
  const fmtMethod = (m: string) =>
    ({ Efectivo: 'Efectivo', DepositoBancario: 'Depósito Bancario', QR: 'QR' }[m] ?? m);

  const rows = grid.Payments.map(p => `
    <tr${p.IsVoided ? ' style="color:#9ca3af;text-decoration:line-through"' : ''}>
      <td>${new Date(p.PaidAt).toLocaleDateString('es-BO')}</td>
      <td>${new Date(p.RegisteredAt).toLocaleDateString('es-BO')}</td>
      <td>Bs. ${p.Amount.toFixed(2)}</td>
      <td>${fmtMethod(p.Method)}</td>
      <td>${p.Bank ?? '—'}</td>
      <td>${p.BankReference ?? '—'}</td>
      <td>${p.PhysicalReceiptNumber ?? '—'}</td>
      <td>${p.RegisteredByName}</td>
      <td>${p.FromWhatsApp ? 'WhatsApp' : 'Manual'}</td>
      <td>${p.IsVoided ? 'Anulado' : 'Válido'}</td>
      <td>${p.CoveredMonths.join(', ')}</td>
    </tr>`).join('');

  const totalPagado = grid.Payments
    .filter(p => !p.IsVoided)
    .reduce((s, p) => s + p.Amount, 0);

  const html = `<html><head><meta charset="utf-8"><title>Extracto — ${client.TbnCode}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:10px;margin:20px}
      h2{font-size:14px;margin:0 0 4px}
      .subtitle{font-size:11px;color:#6b7280;margin:0 0 12px}
      .info{display:flex;gap:32px;margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:4px}
      .info-group p{margin:2px 0}
      .info-group .label{color:#6b7280;font-size:9px;text-transform:uppercase}
      .info-group .val{font-size:11px;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #e5e7eb;padding:4px 6px;text-align:left}
      th{background:#1e3a8a;color:#fff;font-size:9px}
      .total{margin-top:10px;text-align:right;font-weight:bold;font-size:11px}
      .footer{margin-top:16px;font-size:8px;color:#9ca3af;text-align:center}
    </style></head><body>
    <h2>Extracto de Pagos — TelecomBoliviaNet</h2>
    <p class="subtitle">Generado: ${new Date().toLocaleString('es-BO')}</p>
    <div class="info">
      <div class="info-group">
        <p class="label">Cliente</p>
        <p class="val">${client.FullName}</p>
      </div>
      <div class="info-group">
        <p class="label">Código TBN</p>
        <p class="val">${client.TbnCode}</p>
      </div>
      <div class="info-group">
        <p class="label">Plan</p>
        <p class="val">${client.Plan?.Name ?? '—'}</p>
      </div>
      <div class="info-group">
        <p class="label">Zona</p>
        <p class="val">${client.Zone}</p>
      </div>
      <div class="info-group">
        <p class="label">Deuda actual</p>
        <p class="val" style="color:#dc2626">Bs. ${client.TotalDebt.toFixed(2)}</p>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Fecha Pago</th><th>Fecha Registro</th><th>Monto</th><th>Método</th>
        <th>Banco</th><th>Referencia</th><th>N° Comprobante</th>
        <th>Registrado por</th><th>Origen</th><th>Estado</th><th>Meses cubiertos</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="total">Total cobrado (pagos válidos): Bs. ${totalPagado.toFixed(2)}</p>
    <p class="footer">TelecomBoliviaNet · Cochabamba, Bolivia · Documento generado automáticamente</p>
    </body></html>`;

  const w = window.open('', '_blank');
  w?.document.write(html);
  w?.document.close();
  w?.print();
}
