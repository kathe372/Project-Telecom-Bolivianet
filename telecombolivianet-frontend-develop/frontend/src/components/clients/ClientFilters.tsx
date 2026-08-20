import { useRef } from 'react';
import { Search } from 'lucide-react';
import type { ClientFilterDto, PlanDto } from '@/types/client.types';

interface ClientFiltersProps {
  filter:      ClientFilterDto;
  searchText:  string;
  plans:       PlanDto[];
  onFilter:    (f: ClientFilterDto) => void;
  onSearchText:(v: string) => void;
}

export function ClientFilters({ filter, searchText, plans, onFilter, onSearchText }: ClientFiltersProps) {
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    onSearchText(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(
      () => onFilter({ ...filter, Search: val, PageNumber: 1 }),
      350,
    );
  };

  const handleReset = () => {
    onSearchText('');
    onFilter({ Search: '', Status: 'all', DebtFilter: 'all', SortBy: 'code', PageNumber: 1, PageSize: 20 });
  };

  return (
    <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-48">
        <label className="label text-xs">Buscar</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Nombre, CI, TBN, Winbox, teléfono, zona…"
            className="input-field pl-9"
            value={searchText}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label text-xs">Estado</label>
        <select
          className="input-field"
          value={filter.Status ?? 'all'}
          onChange={e => onFilter({ ...filter, Status: e.target.value, PageNumber: 1 })}
        >
          <option value="all">Todos</option>
          <option value="Activo">Activo</option>
          <option value="Suspendido">Suspendido</option>
          <option value="DadoDeBaja">Dado de baja</option>
        </select>
      </div>

      <div>
        <label className="label text-xs">Plan</label>
        <select
          className="input-field"
          value={filter.PlanId ?? ''}
          onChange={e => onFilter({ ...filter, PlanId: e.target.value || undefined, PageNumber: 1 })}
        >
          <option value="">Todos</option>
          {plans.map(p => (
            <option key={p.Id} value={p.Id}>{p.Name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label text-xs">Deuda</label>
        <select
          className="input-field"
          value={filter.DebtFilter ?? 'all'}
          onChange={e => onFilter({ ...filter, DebtFilter: e.target.value, PageNumber: 1 })}
        >
          <option value="all">Todos</option>
          <option value="paid">Al día</option>
          <option value="debt">Con deuda</option>
        </select>
      </div>

      <button onClick={handleReset} className="btn-secondary text-sm">
        Limpiar
      </button>
    </div>
  );
}
