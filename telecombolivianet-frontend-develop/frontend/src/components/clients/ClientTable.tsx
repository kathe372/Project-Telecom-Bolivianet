import { Eye, PauseCircle, PlayCircle, UserX, ChevronUp } from 'lucide-react';
import type { ClientListItemDto, ClientFilterDto } from '@/types/client.types';
import type { PagedResult } from '@/types/auth.types';
import { formatBs } from '@/utils/currency';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Activo:     'badge-active',
    Suspendido: 'badge-blocked',
    DadoDeBaja: 'badge-inactive',
  };
  const labels: Record<string, string> = {
    Activo: 'Activo', Suspendido: 'Suspendido', DadoDeBaja: 'Dado de baja',
  };
  return <span className={map[status] ?? 'badge-inactive'}>{labels[status] ?? status}</span>;
}

interface ClientTableProps {
  result:      PagedResult<ClientListItemDto> | null;
  filter:      ClientFilterDto;
  isAdmin:     () => boolean;
  onSort:      (key: string) => void;
  onViewClient:(id: string) => void;
  onSuspend:   (id: string, name: string) => void;
  onReactivate:(id: string, name: string) => void;
  onCancel:    (id: string, name: string) => void;
  onPage:      (p: number) => void;
}

export function ClientTable({
  result, filter, isAdmin,
  onSort, onViewClient, onSuspend, onReactivate, onCancel, onPage,
}: ClientTableProps) {
  const totalPages = result ? Math.ceil(result.TotalCount / (filter.PageSize ?? 20)) : 0;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {[
                { key: 'code', label: 'TBN' },
                { key: 'name', label: 'Cliente' },
                { key: 'zone', label: 'Zona' },
                { key: null,   label: 'Teléfono' },
                { key: null,   label: 'Plan' },
                { key: null,   label: 'TV' },
                { key: null,   label: 'Estado' },
                { key: 'debt', label: 'Deuda' },
                { key: null,   label: 'Acciones' },
              ].map(({ key, label }) => (
                <th
                  key={label}
                  onClick={() => key && onSort(key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider
                    ${key ? 'cursor-pointer hover:text-gray-900 select-none' : ''}`}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    {key && filter.SortBy === key && <ChevronUp className="w-3 h-3" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!result?.Items.length ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  No se encontraron clientes con los filtros aplicados
                </td>
              </tr>
            ) : result.Items.map(c => (
              <tr
                key={c.Id}
                className="table-row cursor-pointer"
                onClick={() => onViewClient(c.Id)}
              >
                <td className="px-4 py-3 font-mono text-xs font-medium text-blue-700">
                  {c.TbnCode}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{c.FullName}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{c.Zone}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{c.PhoneMain}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{c.PlanName}</td>
                <td className="px-4 py-3 text-center text-xs">
                  {c.HasTvCable ? '✓' : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.Status} />
                  {c.Status === 'Suspendido' && c.SuspendedAt && (
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      desde {new Date(c.SuspendedAt).toLocaleDateString('es-BO')}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.TotalDebt > 0 ? (
                    <span className="text-red-700 font-medium text-xs">
                      {formatBs(c.TotalDebt)}
                      <span className="text-gray-400 font-normal"> ({c.PendingMonths}m)</span>
                    </span>
                  ) : (
                    <span className="text-green-700 text-xs font-medium">Al día</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      title="Vista rápida"
                      onClick={() => onViewClient(c.Id)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {isAdmin() && c.Status === 'Activo' && (
                      <button
                        title="Suspender servicio"
                        onClick={() => onSuspend(c.Id, c.FullName)}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin() && c.Status === 'Suspendido' && (
                      <button
                        title="Reactivar servicio"
                        onClick={() => onReactivate(c.Id, c.FullName)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin() && c.Status !== 'DadoDeBaja' && (
                      <button
                        title="Dar de baja"
                        onClick={() => onCancel(c.Id, c.FullName)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>Página {filter.PageNumber} de {totalPages} · {result?.TotalCount} clientes</span>
          <div className="flex gap-2">
            <button
              disabled={(filter.PageNumber ?? 1) <= 1}
              onClick={() => onPage((filter.PageNumber ?? 1) - 1)}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
            >Anterior</button>
            <button
              disabled={(filter.PageNumber ?? 1) >= totalPages}
              onClick={() => onPage((filter.PageNumber ?? 1) + 1)}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
            >Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
