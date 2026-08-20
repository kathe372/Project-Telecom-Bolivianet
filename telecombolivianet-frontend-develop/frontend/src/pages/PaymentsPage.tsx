import { useEffect, useState, useCallback } from 'react';
import {
  Search, Loader2, Eye,
  TrendingUp, FileSpreadsheet, FileText,
  Play, ImageIcon,
} from 'lucide-react';
import { paymentService } from '@/services/paymentService';
import type {
  PaymentListItemDto, CollectionReportDto,
} from '@/types/payment.types';
import type { PagedResult } from '@/types/auth.types';
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatBs, formatBsAmount } from '@/utils/currency';

const methodBadge = (m: string) => {
  const map: Record<string, string> = {
    Efectivo:         'bg-green-100 text-green-800',
    DepositoBancario: 'bg-blue-100 text-blue-800',
    QR:               'bg-purple-100 text-purple-800',
  };
  const label: Record<string, string> = {
    Efectivo:'Efectivo', DepositoBancario:'Depósito', QR:'QR'
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[m] ?? 'bg-gray-100 text-gray-600'}`}>
      {label[m] ?? m}
    </span>
  );
};

export default function PaymentsPage() {
  usePageTitle('Pagos');
  const [tab, setTab] = useState<'payments' | 'report'>('payments');

  const [payments, setPayments] = useState<PagedResult<PaymentListItemDto> | null>(null);
  const [loadingP, setLoadingP] = useState(true);
  const [search, setSearch]   = useState('');
  const [method, setMethod]   = useState('');
  const [origin, setOrigin]   = useState('');
  const [from,   setFrom]     = useState('');
  const [to,     setTo]       = useState('');
  const [pageP,  setPageP]    = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [report,   setReport]  = useState<CollectionReportDto | null>(null);
  const [loadingR, setLoadingR] = useState(false);
  const [rFrom,    setRFrom]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [rTo, setRTo] = useState(() => new Date().toISOString().split('T')[0]);

  const loadPayments = useCallback(async () => {
    setLoadingP(true);
    try {
      const res = await paymentService.getAll({
        search: search || undefined, method: method || undefined,
        origin: origin || undefined, from: from || undefined, to: to || undefined,
        pageNumber: pageP, pageSize: 25,
      });
      setPayments(res);
    } catch {  }
    finally { setLoadingP(false); }
  }, [search, method, origin, from, to, pageP]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const loadReport = async () => {
    setLoadingR(true);
    try { setReport(await paymentService.getCollectionReport(rFrom, rTo)); }
    catch {  }
    finally { setLoadingR(false); }
  };
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab]);

  const fmtMethod = (m: string) =>
    ({ Efectivo: 'Efectivo', DepositoBancario: 'Depósito', QR: 'QR' }[m] ?? m);

  const exportReportPdf = () => {
    if (!report) return;
    const rows = report.Payments.map(p => {
      const estado = p.IsVoided ? 'Anulado' : 'Válido';
      const origen = p.FromWhatsApp ? 'WhatsApp' : 'Manual';
      return `<tr${p.IsVoided ? ' style="color:#9ca3af;text-decoration:line-through"' : ''}>`+
        `<td>${p.TbnCode}</td><td>${p.ClientName}</td><td>${p.PlanName}</td>`+
        `<td>Bs. ${p.Amount.toFixed(2)}</td><td>${fmtMethod(p.Method)}</td>`+
        `<td>${p.Bank ?? '—'}</td><td>${p.BankReference ?? '—'}</td>`+
        `<td>${new Date(p.PaidAt).toLocaleDateString('es-BO')}</td>`+
        `<td>${new Date(p.RegisteredAt).toLocaleDateString('es-BO')}</td>`+
        `<td>${p.RegisteredByName}</td><td>${origen}</td><td>${estado}</td>`+
        `<td style="font-size:10px">${p.CoveredMonths.join(', ')}</td></tr>`;
    }).join('');

    const html = `<html><head><meta charset="utf-8"><title>Cobranza ${rFrom} – ${rTo}</title>`+
      `<style>body{font-family:Arial,sans-serif;font-size:10px}h2{font-size:13px;margin-bottom:4px}`+
      `p{margin:2px 0 8px}table{width:100%;border-collapse:collapse}`+
      `th,td{border:1px solid #ddd;padding:3px 5px;text-align:left}`+
      `th{background:#1e3a8a;color:#fff;font-size:9px}</style></head><body>`+
      `<h2>Reporte de Cobranza: ${rFrom} al ${rTo}</h2>`+
      `<p>Total cobrado: <strong>Bs. ${report.TotalCollected.toFixed(2)}</strong> · `+
      `Pagos: ${report.TotalPayments} · Promedio: Bs. ${report.AveragePayment.toFixed(2)} · `+
      `Efectivo: Bs. ${report.CollectedCash.toFixed(2)} · `+
      `Depósito: Bs. ${report.CollectedDeposit.toFixed(2)} · `+
      `QR: Bs. ${report.CollectedQr.toFixed(2)}</p>`+
      `<table><thead><tr>`+
      `<th>TBN</th><th>Cliente</th><th>Plan</th><th>Monto</th><th>Método</th>`+
      `<th>Banco</th><th>Referencia</th><th>Fecha Pago</th><th>Fecha Registro</th>`+
      `<th>Registrado por</th><th>Origen</th><th>Estado</th><th>Meses cubiertos</th>`+
      `</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    w?.document.write(html); w?.document.close(); w?.print();
  };

  const exportReportCsv = () => {
    if (!report) return;
    const header = 'TBN,Cliente,Plan,Monto,Método,Banco,Referencia,"Fecha Pago","Fecha Registro","Registrado por",Origen,Estado,"Meses cubiertos"\n';
    const rows = report.Payments.map(p =>
      [
        p.TbnCode,
        `"${p.ClientName}"`,
        `"${p.PlanName}"`,
        p.Amount.toFixed(2),
        fmtMethod(p.Method),
        p.Bank ?? '',
        p.BankReference ?? '',
        new Date(p.PaidAt).toLocaleDateString('es-BO'),
        new Date(p.RegisteredAt).toLocaleDateString('es-BO'),
        `"${p.RegisteredByName}"`,
        p.FromWhatsApp ? 'WhatsApp' : 'Manual',
        p.IsVoided ? 'Anulado' : 'Válido',
        `"${p.CoveredMonths.join(', ')}"`,
      ].join(',')
    );
    const blob = new Blob(['﻿' + header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Cobranza_${rFrom}_${rTo}.csv`; a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Pagos</h1>
      </div>

      <div className="flex border-b border-gray-200 mb-5 gap-1">
        {[
          { key: 'payments', label: 'Todos los pagos',    icon: <TrendingUp className="w-4 h-4" /> },
          { key: 'report',   label: 'Reporte de cobranza', icon: <FileSpreadsheet className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {}
      {tab === 'payments' && (
        <>
          {}
          <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-40">
              <label className="label text-xs">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" className="input-field pl-9"
                  placeholder="Nombre o código TBN…"
                  value={search} onChange={e => { setSearch(e.target.value); setPageP(1); }} />
              </div>
            </div>
            <div>
              <label className="label text-xs">Método</label>
              <select className="input-field" value={method}
                onChange={e => { setMethod(e.target.value); setPageP(1); }}>
                <option value="">Todos</option>
                <option value="Efectivo">Efectivo</option>
                <option value="DepositoBancario">Depósito</option>
                <option value="QR">QR</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Origen</label>
              <select className="input-field" value={origin}
                onChange={e => { setOrigin(e.target.value); setPageP(1); }}>
                <option value="">Todos</option>
                <option value="Manual">Manual</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Desde</label>
              <input type="date" className="input-field"
                value={from} onChange={e => { setFrom(e.target.value); setPageP(1); }} />
            </div>
            <div>
              <label className="label text-xs">Hasta</label>
              <input type="date" className="input-field"
                value={to} onChange={e => { setTo(e.target.value); setPageP(1); }} />
            </div>
            <button onClick={() => { setSearch(''); setMethod(''); setOrigin(''); setFrom(''); setTo(''); setPageP(1); }}
              className="btn-secondary text-sm">Limpiar</button>
          </div>

          {loadingP ? (
            <div className="flex justify-center h-48 items-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando pagos...
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['TBN','Cliente','Plan','Monto','Método','Banco','Fecha pago','Por','Origen','Meses','Estado','Acciones']
                        .map(h => (
                          <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!payments?.Items.length ? (
                      <tr><td colSpan={10} className="text-center py-10 text-gray-400">
                        No hay pagos con los filtros aplicados
                      </td></tr>
                    ) : payments.Items.map(p => (
                      <tr key={p.Id} className={`hover:bg-gray-50 transition-colors${p.IsVoided ? ' opacity-50' : ''}`}>
                        <td className="px-3 py-3 font-mono text-xs text-blue-700 font-medium">{p.TbnCode}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{p.ClientName}</td>
                        <td className="px-3 py-3 text-xs text-gray-500">{p.PlanName}</td>
                        <td className="px-3 py-3 font-medium">{formatBs(p.Amount)}</td>
                        <td className="px-3 py-3">{methodBadge(p.Method)}</td>
                        <td className="px-3 py-3 text-xs text-gray-500">{p.Bank ?? '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          {new Date(p.PaidAt).toLocaleDateString('es-BO')}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">{p.RegisteredByName}</td>
                        <td className="px-3 py-3 text-xs">
                          {p.FromWhatsApp
                            ? <span className="text-green-700">📱 WhatsApp</span>
                            : <span className="text-gray-500">🖥️ Manual</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 max-w-32 truncate">
                          {p.CoveredMonths.join(', ')}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {p.IsVoided
                            ? <span className="inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Anulado</span>
                            : <span className="inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Válido</span>}
                        </td>
                        <td className="px-3 py-3">
                          <button title="Ver detalle" onClick={() => setDetailId(p.Id)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          {p.ReceiptImageUrl && (
                            <a href={p.ReceiptImageUrl} target="_blank" rel="noreferrer"
                              title="Ver comprobante"
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors inline-flex">
                              <ImageIcon className="w-4 h-4" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {payments && Math.ceil(payments.TotalCount / 25) > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                  <span>Página {pageP} de {Math.ceil(payments.TotalCount / 25)} · {payments.TotalCount} pagos</span>
                  <div className="flex gap-2">
                    <button disabled={pageP <= 1} onClick={() => setPageP(p => p-1)}
                      className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Anterior</button>
                    <button disabled={pageP >= Math.ceil(payments.TotalCount / 25)} onClick={() => setPageP(p => p+1)}
                      className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Siguiente</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {}
      {tab === 'report' && (
        <div>
          <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">Desde</label>
              <input type="date" className="input-field" value={rFrom}
                onChange={e => setRFrom(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Hasta</label>
              <input type="date" className="input-field" value={rTo}
                onChange={e => setRTo(e.target.value)} />
            </div>
            <button onClick={loadReport} disabled={loadingR} className="btn-primary text-sm">
              {loadingR ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loadingR ? 'Generando...' : 'Generar reporte'}
            </button>
            {report && (
              <>
                <button onClick={exportReportCsv} className="btn-secondary text-sm">
                  <FileSpreadsheet className="w-4 h-4" /> Excel (CSV)
                </button>
                <button onClick={exportReportPdf} className="btn-secondary text-sm">
                  <FileText className="w-4 h-4" /> PDF
                </button>
              </>
            )}
          </div>

          {report && (
            <>
              {}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                  { label: 'Total cobrado',  val: formatBs(report.TotalCollected), color: 'text-green-700' },
                  { label: 'N.º de pagos',   val: String(report.TotalPayments), color: 'text-blue-700' },
                  { label: 'Promedio',       val: formatBs(report.AveragePayment), color: 'text-purple-700' },
                  { label: 'Efectivo / Dep. / QR',
                    val: `${formatBsAmount(report.CollectedCash)} / ${formatBsAmount(report.CollectedDeposit)} / ${formatBsAmount(report.CollectedQr)}`,
                    color: 'text-amber-700' },
                ].map(c => (
                  <div key={c.label} className="card p-4">
                    <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                    <p className={`text-lg font-bold ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>

              {}
              {report.ByUser.length > 0 && (
                <div className="card p-5 mb-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Por técnico</h3>
                  <div className="space-y-2">
                    {report.ByUser.map(u => (
                      <div key={u.UserName} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{u.UserName}</span>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>{u.Count} pagos</span>
                          <span className="font-medium text-gray-900">
                            {formatBs(u.Total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['TBN','Cliente','Plan','Monto','Método','Banco','Referencia','Fecha Pago','Fecha Registro','Registrado por','Origen','Estado','Meses cubiertos'].map(h => (
                          <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {report.Payments.map(p => (
                        <tr key={p.Id} className={`hover:bg-gray-50${p.IsVoided ? ' opacity-50' : ''}`}>
                          <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{p.TbnCode}</td>
                          <td className="px-3 py-2.5 text-gray-900">{p.ClientName}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{p.PlanName}</td>
                          <td className="px-3 py-2.5 font-medium">{formatBs(p.Amount)}</td>
                          <td className="px-3 py-2.5">{methodBadge(p.Method)}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{p.Bank ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{p.BankReference ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{new Date(p.PaidAt).toLocaleDateString('es-BO')}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{new Date(p.RegisteredAt).toLocaleDateString('es-BO')}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{p.RegisteredByName}</td>
                          <td className="px-3 py-2.5 text-xs">
                            {p.FromWhatsApp
                              ? <span className="text-green-700">📱 WA</span>
                              : <span className="text-gray-500">🖥️</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {p.IsVoided
                              ? <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Anulado</span>
                              : <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Válido</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs truncate">{p.CoveredMonths.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {}
      {detailId && (
        <PaymentDetailModal
          paymentId={detailId}
          onVoided={() => { setDetailId(null); loadPayments(); }}
          onClose={() => setDetailId(null)}
        />
      )}

    </div>
  );
}
