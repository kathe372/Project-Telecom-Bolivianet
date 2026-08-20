import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Loader2, AlertCircle, X } from 'lucide-react';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { ClientFilters } from '@/components/clients/ClientFilters';
import { ClientTable } from '@/components/clients/ClientTable';
import { clientService, planService } from '@/services/clientService';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useClientActions } from '@/hooks/useClientActions';
import type { ClientListItemDto, ClientFilterDto, PlanDto } from '@/types/client.types';
import type { PagedResult } from '@/types/auth.types';

export default function ClientsPage() {
  usePageTitle('Clientes');
  const navigate = useNavigate();
  const isAdmin  = useAuthStore(s => s.isAdmin);

  const [result,     setResult]     = useState<PagedResult<ClientListItemDto> | null>(null);
  const [plans,      setPlans]      = useState<PlanDto[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [searchText, setSearchText] = useState('');

  const [filter, setFilter] = useState<ClientFilterDto>({
    Search: '', Status: 'all', DebtFilter: 'all',
    SortBy: 'code', PageNumber: 1, PageSize: 20,
  });

  const loadClients = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setResult(await clientService.getAll(filter));
    } catch {
      setError('Error al cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    planService.getAll(true).then(setPlans).catch(() => {});
  }, []);
  useEffect(() => { loadClients(); }, [loadClients]);

  const {
    confirmDialog, confirmRunning, actionError,
    closeConfirm, clearActionError,
    handleSuspend, handleReactivate, handleCancel,
  } = useClientActions(loadClients);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{result?.TotalCount ?? 0} clientes registrados</p>
        </div>
        <button onClick={() => navigate('/clients/new')} className="btn-primary">
          <UserPlus className="w-4 h-4" /> Registrar cliente
        </button>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {actionError && (
          <div className="flex items-center justify-between gap-2 text-red-700 bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl mb-4 text-sm animate-fade-in">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{actionError}</span>
            <button onClick={clearActionError} className="text-red-400 hover:text-red-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <ClientFilters
          filter={filter}
          searchText={searchText}
          plans={plans}
          onFilter={setFilter}
          onSearchText={setSearchText}
        />

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : (
          <ClientTable
            result={result}
            filter={filter}
            isAdmin={isAdmin}
            onSort={key => setFilter(f => ({ ...f, SortBy: key }))}
            onViewClient={id => navigate(`/clients/${id}`)}
            onSuspend={handleSuspend}
            onReactivate={handleReactivate}
            onCancel={handleCancel}
            onPage={p => setFilter(f => ({ ...f, PageNumber: p }))}
          />
        )}

        <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
      </div>
    </>
  );
}
