import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

export function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-4">
          <ShieldOff className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso denegado</h1>
        <p className="text-gray-500 mb-6">No tienes permisos para ver esta página.</p>
        <Link to="/dashboard" className="btn-primary">
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}

export function TicketsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Tickets de soporte</h1>
      <p className="text-sm text-gray-400">Se implementa en el Sprint 6 (Módulo 7).</p>
    </div>
  );
}

export function InvoicesPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Facturas</h1>
      <p className="text-sm text-gray-400">Se implementa en el Sprint 3 (Módulo 3).</p>
    </div>
  );
}

export function ClientsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Clientes</h1>
      <p className="text-sm text-gray-400">Se implementa en el Sprint 2 (Módulo 2).</p>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Configuración</h1>
      <p className="text-sm text-gray-400">Se implementa en el Sprint 1 (parte avanzada).</p>
    </div>
  );
}
