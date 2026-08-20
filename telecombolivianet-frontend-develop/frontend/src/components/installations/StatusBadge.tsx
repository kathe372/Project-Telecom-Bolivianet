import { STATUS_LABEL, STATUS_COLOR } from '@/services/installationService';

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status;
  const color = STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
