import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Wrench, Boxes, UserX, UserPlus,
  CheckCircle2, XCircle, Plus,
  ChevronLeft, ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import {
  getInstallations,
  type InstallationListItemDto, type InstallationFilterDto,
} from '@/services/installationService';
import { usePageTitle } from '@/hooks/usePageTitle';
import { StatusBadge } from '@/components/installations/StatusBadge';
import { CancelModal } from '@/components/installations/CancelModal';
import { NoShowModal } from '@/components/installations/NoShowModal';
import { AssignBoxModal } from '@/components/installations/AssignBoxModal';
import { CompleteModal } from '@/components/installations/CompleteModal';
import { NewInstallationModal } from '@/components/installations/NewInstallationModal';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '',            label: 'Todos los estados' },
  { value: 'Pendiente',   label: 'Pendiente' },
  { value: 'EnProceso',   label: 'En proceso' },
  { value: 'Completada',  label: 'Completada' },
  { value: 'Cancelada',   label: 'Cancelada' },
  { value: 'Reprogramada',label: 'Reprogramada' },
  { value: 'NoRealizada', label: 'No realizada' },
];

export default function InstallationsPage() {
  usePageTitle('Instalaciones');
  const navigate = useNavigate();
  const [items,   setItems]   = useState<InstallationListItemDto[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [filterStatus, setFilterStatus] = useState('');
  const [filterFecha,  setFilterFecha]  = useState('');
  const [soloProspectos, setSoloProspectos] = useState(false);

  const [cancelTarget,   setCancelTarget]   = useState<InstallationListItemDto | null>(null);
  const [completarTarget, setCompletarTarget] = useState<InstallationListItemDto | null>(null);
  const [boxTarget, setBoxTarget] = useState<InstallationListItemDto | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<InstallationListItemDto | null>(null);
  const [showNueva, setShowNueva] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filter: InstallationFilterDto = {
        page,
        pageSize: PAGE_SIZE,
        ...(filterStatus && { status: filterStatus }),
        ...(filterFecha  && { fecha: filterFecha }),
        ...(soloProspectos && { soloProspectos: true }),
      };
      const res = await getInstallations(filter);
      setItems(res.Items);
      setTotal(res.TotalCount);
    } catch {
      setError('No se pudo cargar la lista de instalaciones.');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterFecha, soloProspectos]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleDone = () => {
    setCancelTarget(null);
    setCompletarTarget(null);
    setBoxTarget(null);
    setNoShowTarget(null);
    setShowNueva(false);
    load();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Instalaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestión de instalaciones agendadas — {total} en total
          </p>
        </div>
        <button
          onClick={() => setShowNueva(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Nueva instalación
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="date"
          value={filterFecha}
          onChange={(e) => { setFilterFecha(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none border rounded-lg px-3 py-2">
          <input
            type="checkbox"
            className="rounded"
            checked={soloProspectos}
            onChange={(e) => { setSoloProspectos(e.target.checked); setPage(1); }}
          />
          Prospectos por recontactar
        </label>

        {(filterStatus || filterFecha || soloProspectos) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterFecha(''); setSoloProspectos(false); setPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No hay instalaciones que coincidan con los filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Fecha</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Hora</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  <span className="flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />Técnico</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Caja NAP</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((inst) => (
                <tr key={inst.Id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{inst.ClienteNombre}</p>
                    <p className="text-xs text-gray-400">
                      {inst.ClienteTbn}
                      {inst.ClientePhone && inst.ClientePhone !== '—' && (
                        <>
                          {' · '}
                          <a
                            href={`https://wa.me/${inst.ClientePhone.replace(/\D/g, '')}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-green-700 hover:underline"
                          >
                            {inst.ClientePhone}
                          </a>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{inst.PlanNombre}</td>
                  <td className="px-4 py-3 text-gray-700">{inst.Fecha}</td>
                  <td className="px-4 py-3 text-gray-700">{inst.HoraInicio}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inst.Status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {inst.TecnicoNombre ?? (
                      <span className="text-amber-600">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {inst.BoxCodigo ?? (
                      inst.Status === 'Completada'
                        ? <span className="text-amber-600">Sin caja</span>
                        : <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {inst.Status === 'Completada' && (
                        <button
                          onClick={() => setBoxTarget(inst)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                          title={inst.BoxCodigo ? `Reasignar caja NAP (actual: ${inst.BoxCodigo})` : 'Asignar caja NAP'}
                        >
                          <Boxes className="w-4 h-4" />
                        </button>
                      )}
                      {inst.Status === 'Completada' && inst.ClienteTbn === 'PROSPECTO' && (
                        <button
                          onClick={() => navigate(`/clients/new?installationId=${inst.Id}`)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 rounded"
                          title="Registrar como cliente (conversión de prospecto)"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                      {(inst.Status === 'Pendiente' || inst.Status === 'EnProceso') && (
                        <>
                          <button
                            onClick={() => setCompletarTarget(inst)}
                            className="p-1.5 text-gray-400 hover:text-green-600 rounded"
                            title="Marcar como completada"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setNoShowTarget(inst)}
                            className="p-1.5 text-gray-400 hover:text-orange-600 rounded"
                            title="No se pudo realizar (cliente ausente, etc.)"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {inst.Status !== 'Completada' && inst.Status !== 'Cancelada' && (
                        <button
                          onClick={() => setCancelTarget(inst)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          title="Cancelar instalación"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 rounded bg-blue-50 text-blue-700 font-medium">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showNueva && (
        <NewInstallationModal
          onClose={() => setShowNueva(false)}
          onDone={handleDone}
        />
      )}
      {cancelTarget && (
        <CancelModal
          instalacion={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={handleDone}
        />
      )}
      {completarTarget && (
        <CompleteModal
          instalacion={completarTarget}
          onClose={() => setCompletarTarget(null)}
          onDone={handleDone}
        />
      )}
      {boxTarget && (
        <AssignBoxModal
          instalacion={boxTarget}
          onClose={() => setBoxTarget(null)}
          onDone={handleDone}
        />
      )}
      {noShowTarget && (
        <NoShowModal
          instalacion={noShowTarget}
          onClose={() => setNoShowTarget(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
