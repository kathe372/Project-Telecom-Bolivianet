import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, PauseCircle, Clock } from 'lucide-react';
import type { TicketStatus } from '@/types/ticket.types';


interface Props {
  slaDeadline:          string | null;
  slaPausedAt:          string | null;
  slaTotalPausedMinutes: number;
  status:               TicketStatus;
  slaCompliant:         boolean | null;
  createdAt:            string;
}

function formatTimeLeft(ms: number): string {
  const absMs  = Math.abs(ms);
  const totalMin = Math.floor(absMs / 60000);
  const h      = Math.floor(totalMin / 60);
  const m      = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function getBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500';
  if (pct > 75)  return 'bg-orange-400';
  if (pct > 50)  return 'bg-yellow-400';
  return 'bg-green-500';
}

function getTextColor(pct: number): string {
  if (pct > 100) return 'text-red-600';
  if (pct > 75)  return 'text-orange-500';
  if (pct > 50)  return 'text-yellow-600';
  return 'text-green-600';
}

export function SlaProgressBar({
  slaDeadline, slaPausedAt, slaTotalPausedMinutes,
  status, slaCompliant, createdAt,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === 'Cerrado' || status === 'Resuelto') {
    if (slaCompliant === null) return null;
    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
        ${slaCompliant
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-red-50 border border-red-200 text-red-700'}`}>
        {slaCompliant
          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
          : <XCircle      className="w-4 h-4 shrink-0" />}
        SLA {slaCompliant ? 'cumplido' : 'incumplido'}
      </div>
    );
  }

  if (!slaDeadline) return null;

  const deadlineMs  = new Date(slaDeadline).getTime();
  const createdMs   = new Date(createdAt).getTime();
  const totalMs     = deadlineMs - createdMs - slaTotalPausedMinutes * 60_000;
  const elapsedMs   = now - createdMs - slaTotalPausedMinutes * 60_000;
  const remainingMs = deadlineMs - now;
  const pct         = Math.max(0, Math.min(200, (elapsedMs / totalMs) * 100));
  const barWidth    = Math.min(100, pct);
  const isOverdue   = remainingMs < 0;

  if (status === 'PendienteCliente') {
    return (
      <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-sm text-purple-700 font-medium">
          <PauseCircle className="w-4 h-4 shrink-0" />
          SLA pausado — esperando respuesta del cliente
        </div>
        {slaPausedAt && (
          <p className="text-xs text-purple-500">
            En pausa desde {new Date(slaPausedAt).toLocaleString('es-BO')}
            {slaTotalPausedMinutes > 0 && ` · ${formatTimeLeft(slaTotalPausedMinutes * 60_000)} acumulados`}
          </p>
        )}
        <div className="w-full bg-purple-200 rounded-full h-1.5">
          <div
            className="bg-purple-400 h-1.5 rounded-full transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1 font-medium ${getTextColor(pct)}`}>
          <Clock className="w-3.5 h-3.5" />
          {isOverdue
            ? `Vencido hace ${formatTimeLeft(remainingMs)}`
            : `Vence en ${formatTimeLeft(remainingMs)}`}
        </div>
        <span className="text-gray-400">
          {Math.round(pct)}% consumido
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${getBarColor(pct)}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">
        Límite: {new Date(slaDeadline).toLocaleString('es-BO')}
      </p>
    </div>
  );
}
