import { MapPin } from 'lucide-react';
import type { ClientDetailDto } from '@/types/client.types';
import { formatBs } from '@/utils/currency';
import { InfoRow } from './profileHelpers';

export function InfoTab({ client }: { client: ClientDetailDto }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Datos personales</h3>
        <InfoRow label="Nombre completo"    value={client.FullName} />
        <InfoRow label="Carnet identidad"   value={client.IdentityCard} />
        <InfoRow label="Teléfono principal" value={client.PhoneMain} />
        <InfoRow label="Teléfono secundario" value={client.PhoneSecondary} />
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Ubicación</h3>
        <InfoRow label="Zona / Barrio"  value={client.Zone} />
        <InfoRow label="Calle y número" value={client.Street} />
        <InfoRow label="Referencia"     value={client.LocationRef} />
        {client.GpsLatitude && client.GpsLongitude && (
          <div className="py-2 text-sm border-b border-gray-50">
            <span className="text-gray-500">Coordenadas</span>
            <a href={`https://maps.google.com/?q=${client.GpsLatitude},${client.GpsLongitude}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline text-xs mt-0.5">
              <MapPin className="w-3 h-3" />
              {client.GpsLatitude}, {client.GpsLongitude} — Ver en mapa
            </a>
          </div>
        )}
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Servicio</h3>
        <InfoRow label="Plan"               value={client.Plan?.DisplayLabel} />
        <InfoRow label="TV cable"           value={client.HasTvCable ? 'Sí' : 'No'} />
        <InfoRow label="Winbox"             value={client.WinboxNumber} />
        <InfoRow label="Serie ONU"          value={client.OnuSerialNumber} />
        <InfoRow label="Fecha instalación"
          value={new Date(client.InstallationDate).toLocaleDateString('es-BO')} />
        <InfoRow label="Técnico instalador" value={client.InstalledByName} />
        <InfoRow label="Caja NAP" value={client.CajaNap ?? 'Sin asignar'} />
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Resumen financiero</h3>
        <InfoRow label="Deuda total"
          value={formatBs(client.TotalDebt)} />
        <InfoRow label="Meses pendientes" value={String(client.PendingMonths)} />
        <InfoRow label="Último pago"
          value={client.LastPaymentDate
            ? new Date(client.LastPaymentDate).toLocaleDateString('es-BO')
            : 'Sin pagos'} />
        <InfoRow label="Instalación"
          value={client.InstallationPaid ? 'Pagada' : 'Pendiente'} />
        <InfoRow label="Registrado"
          value={new Date(client.CreatedAt).toLocaleDateString('es-BO')} />
      </div>
    </div>
  );
}
