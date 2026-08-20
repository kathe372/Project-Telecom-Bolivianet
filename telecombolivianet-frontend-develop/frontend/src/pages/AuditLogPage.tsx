import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Download, Search } from 'lucide-react';
import { auditService } from '@/services/auditService';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { AuditLogDto } from '@/types/auth.types';


const MODULES = [
  'Auth', 'Usuarios', 'Clientes', 'Tickets',
  'Facturación', 'Pagos', 'Instalaciones', 'Planes', 'Sistema',
];

const ACTIONS_BY_MODULE: Record<string, string[]> = {
  Auth:         ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'ACCOUNT_BLOCKED', 'PASSWORD_CHANGED'],
  Usuarios:     ['USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'ACCOUNT_UNLOCKED', 'USER_SOFT_DELETED', 'USER_PASSWORD_FORCE_RESET'],
  Clientes:     ['CLIENT_REGISTERED', 'CLIENT_UPDATED', 'CLIENT_SUSPENDED', 'CLIENT_REACTIVATED', 'CLIENT_CANCELLED', 'PLAN_CHANGED', 'PLAN_CHANGE_REQUESTED', 'PLAN_CHANGE_APPROVED', 'PLAN_CHANGE_REJECTED', 'CLIENT_QR_UPLOADED'],
  Tickets:      ['TICKET_CREATED', 'STATUS_CHANGED', 'TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_CLOSED', 'COMMENT_ADDED', 'WORKLOG_ADDED', 'VISIT_SCHEDULED', 'TICKET_ATTACHMENT_UPLOADED', 'TICKET_ATTACHMENT_DELETED'],
  Facturación:  ['EXTRAORDINARY_INVOICE_CREATED', 'INVOICE_STATUS_CHANGED', 'INVOICES_MARKED_ENVIADAS', 'CREDIT_APPLIED_TO_INVOICE', 'INVOICE_VOIDED', 'BILLING_JOB_RUN', 'OVERDUE_JOB_RUN', 'MANUAL_BILLING_RUN'],
  Pagos:        ['WHATSAPP_RECEIPT_APPROVED', 'WHATSAPP_RECEIPT_REJECTED', 'WHATSAPP_RECEIPT_DISCARDED', 'PAYMENT_REGISTERED_WITH_CREDIT', 'CREDIT_REIMBURSED'],
  Instalaciones:['INSTALACION_CREADA', 'INSTALACION_CANCELADA', 'INSTALACION_REPROGRAMADA', 'INSTALACION_COMPLETADA', 'INSTALACION_TECNICO_ASIGNADO'],
  Planes:       ['PLAN_CREATED', 'PLAN_UPDATED'],
  Sistema:      ['SETTINGS_UPDATED'],
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS:    'bg-green-100 text-green-800',
  LOGIN_FAILED:     'bg-red-100 text-red-800',
  LOGOUT:           'bg-gray-100 text-gray-600',
  ACCOUNT_BLOCKED:  'bg-red-100 text-red-800',
  ACCOUNT_UNLOCKED: 'bg-green-100 text-green-800',
  PASSWORD_CHANGED: 'bg-blue-100 text-blue-800',
  USER_CREATED:               'bg-purple-100 text-purple-800',
  USER_UPDATED:               'bg-yellow-100 text-yellow-800',
  USER_DEACTIVATED:           'bg-red-100 text-red-800',
  USER_REACTIVATED:           'bg-green-100 text-green-800',
  USER_SOFT_DELETED:          'bg-red-100 text-red-800',
  USER_PASSWORD_FORCE_RESET:  'bg-orange-100 text-orange-800',
  CLIENT_REGISTERED:    'bg-purple-100 text-purple-800',
  CLIENT_UPDATED:       'bg-yellow-100 text-yellow-800',
  CLIENT_SUSPENDED:     'bg-red-100 text-red-800',
  CLIENT_REACTIVATED:   'bg-green-100 text-green-800',
  CLIENT_CANCELLED:     'bg-red-100 text-red-800',
  PLAN_CHANGED:         'bg-blue-100 text-blue-800',
  PLAN_CHANGE_REQUESTED:'bg-blue-100 text-blue-800',
  PLAN_CHANGE_APPROVED: 'bg-green-100 text-green-800',
  PLAN_CHANGE_REJECTED: 'bg-red-100 text-red-800',
  CLIENT_QR_UPLOADED:   'bg-gray-100 text-gray-600',
  TICKET_CREATED:              'bg-purple-100 text-purple-800',
  STATUS_CHANGED:              'bg-blue-100 text-blue-800',
  TICKET_ASSIGNED:             'bg-indigo-100 text-indigo-800',
  TICKET_UPDATED:              'bg-yellow-100 text-yellow-800',
  TICKET_CLOSED:               'bg-gray-100 text-gray-600',
  COMMENT_ADDED:               'bg-sky-100 text-sky-800',
  WORKLOG_ADDED:               'bg-teal-100 text-teal-800',
  VISIT_SCHEDULED:             'bg-indigo-100 text-indigo-800',
  TICKET_ATTACHMENT_UPLOADED:  'bg-gray-100 text-gray-600',
  TICKET_ATTACHMENT_DELETED:   'bg-red-100 text-red-700',
  EXTRAORDINARY_INVOICE_CREATED: 'bg-purple-100 text-purple-800',
  INVOICE_STATUS_CHANGED:        'bg-blue-100 text-blue-800',
  INVOICES_MARKED_ENVIADAS:      'bg-green-100 text-green-800',
  CREDIT_APPLIED_TO_INVOICE:     'bg-teal-100 text-teal-800',
  INVOICE_VOIDED:                'bg-red-100 text-red-800',
  BILLING_JOB_RUN:               'bg-gray-100 text-gray-600',
  OVERDUE_JOB_RUN:               'bg-orange-100 text-orange-800',
  MANUAL_BILLING_RUN:            'bg-yellow-100 text-yellow-800',
  WHATSAPP_RECEIPT_APPROVED:      'bg-green-100 text-green-800',
  WHATSAPP_RECEIPT_REJECTED:      'bg-red-100 text-red-800',
  WHATSAPP_RECEIPT_DISCARDED:     'bg-gray-100 text-gray-600',
  PAYMENT_REGISTERED_WITH_CREDIT: 'bg-green-100 text-green-800',
  CREDIT_REIMBURSED:              'bg-teal-100 text-teal-800',
  INSTALACION_CREADA:           'bg-purple-100 text-purple-800',
  INSTALACION_CANCELADA:        'bg-red-100 text-red-800',
  INSTALACION_REPROGRAMADA:     'bg-orange-100 text-orange-800',
  INSTALACION_COMPLETADA:       'bg-green-100 text-green-800',
  INSTALACION_TECNICO_ASIGNADO: 'bg-indigo-100 text-indigo-800',
  PLAN_CREATED: 'bg-purple-100 text-purple-800',
  PLAN_UPDATED: 'bg-yellow-100 text-yellow-800',
  SETTINGS_UPDATED: 'bg-blue-100 text-blue-800',
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {action}
    </span>
  );
}

function ExpandableRow({ log }: { log: AuditLogDto }) {
  const [open, setOpen] = useState(false);
  const hasData = log.PreviousData || log.NewData;

  return (
    <>
      <tr
        className={`hover:bg-gray-50 transition-colors ${hasData ? 'cursor-pointer' : ''}`}
        onClick={() => hasData && setOpen((v) => !v)}
      >
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          {new Date(log.CreatedAt).toLocaleString('es-BO')}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">{log.UserName}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{log.Module}</td>
        <td className="px-4 py-3"><ActionBadge action={log.Action} /></td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{log.Description}</td>
        <td className="px-4 py-3 text-xs text-gray-400">{log.IpAddress ?? '-'}</td>
        <td className="px-4 py-3 text-center">
          {hasData && (
            open
              ? <ChevronDown className="w-4 h-4 text-gray-400 inline" />
              : <ChevronRight className="w-4 h-4 text-gray-400 inline" />
          )}
        </td>
      </tr>
      {open && hasData && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              {log.PreviousData && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Datos anteriores</p>
                  <pre className="text-xs bg-red-50 border border-red-100 rounded p-2 overflow-x-auto">
                    {JSON.stringify(JSON.parse(log.PreviousData), null, 2)}
                  </pre>
                </div>
              )}
              {log.NewData && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Datos nuevos</p>
                  <pre className="text-xs bg-green-50 border border-green-100 rounded p-2 overflow-x-auto">
                    {JSON.stringify(JSON.parse(log.NewData), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditLogPage() {
  usePageTitle('Registro de Auditoría');
  const [logs,    setLogs]    = useState<AuditLogDto[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');

  const PAGE_SIZE = 50;

  const availableActions = filterModule
    ? (ACTIONS_BY_MODULE[filterModule] ?? [])
    : Object.values(ACTIONS_BY_MODULE).flat();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await auditService.getAll({
        module:     filterModule || undefined,
        action:     filterAction || undefined,
        search:     filterSearch || undefined,
        from:       filterFrom   || undefined,
        to:         filterTo     || undefined,
        pageNumber: page,
        pageSize:   PAGE_SIZE,
      });
      setLogs(res.Items);
      setTotal(res.TotalCount);
    } catch {
      setError('Error al cargar el registro de auditoría.');
    } finally {
      setLoading(false);
    }
  }, [page, filterModule, filterAction, filterSearch, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleClear = () => {
    setFilterModule(''); setFilterAction(''); setFilterSearch('');
    setFilterFrom(''); setFilterTo(''); setPage(1);
  };

  const handleExport = () => {
    auditService.exportCsv({
      module: filterModule || undefined,
      action: filterAction || undefined,
      search: filterSearch || undefined,
      from:   filterFrom   || undefined,
      to:     filterTo     || undefined,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Registro de auditoría</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Log inmutable de todas las acciones del sistema · {total} registros
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {}
      <div className="card p-4 mb-5 space-y-3">
        {}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9 w-full"
            placeholder="Buscar por descripción o usuario..."
            value={filterSearch}
            onChange={e => { setFilterSearch(e.target.value); setPage(1); }}
          />
        </div>
        {}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label text-xs">Módulo</label>
            <select
              className="input-field text-sm"
              value={filterModule}
              onChange={e => { setFilterModule(e.target.value); setFilterAction(''); setPage(1); }}
            >
              <option value="">Todos los módulos</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Acción</label>
            <select
              className="input-field text-sm"
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(1); }}
            >
              <option value="">Todas las acciones</option>
              {availableActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Desde</label>
            <input type="date" className="input-field text-sm"
              value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="label text-xs">Hasta</label>
            <input type="date" className="input-field text-sm"
              value={filterTo}
              onChange={e => { setFilterTo(e.target.value); setPage(1); }} />
          </div>
          <button onClick={handleClear} className="btn-secondary text-sm">
            Limpiar filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha / Hora', 'Usuario', 'Módulo', 'Acción', 'Descripción', 'IP', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No hay registros con los filtros aplicados
                    </td>
                  </tr>
                ) : logs.map((log) => (
                  <ExpandableRow key={log.Id} log={log} />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Página {page} de {totalPages} · {total} registros</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Anterior</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
