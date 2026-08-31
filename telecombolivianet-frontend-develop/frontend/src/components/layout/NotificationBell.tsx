import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Ticket, ArrowLeftRight, CreditCard } from 'lucide-react';
import { alertService } from '@/services/alertService';
import { useNotificationStore } from '@/store/notificationStore';
import type { InternalAlertDto } from '@/types/alert.types';

const POLL_INTERVAL_MS = 30_000;

const TYPE_ICON: Record<string, React.ReactNode> = {
  TICKET_NUEVO:          <Ticket className="w-4 h-4 text-blue-500" />,
  PLAN_CHANGE_PENDIENTE: <ArrowLeftRight className="w-4 h-4 text-amber-500" />,
  COMPROBANTE_PENDIENTE: <CreditCard className="w-4 h-4 text-green-500" />,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function NotificationBell() {
  const navigate    = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts      = useNotificationStore(s => s.alerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const setAlerts   = useNotificationStore(s => s.setAlerts);
  const removeAlert = useNotificationStore(s => s.removeAlert);
  const clearAll    = useNotificationStore(s => s.clearAll);

  const fetchAlerts = async () => {
    try {
      const data = await alertService.getUnread();
      setAlerts(data);
    } catch {
    }
  };

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (alert: InternalAlertDto) => {
    setOpen(false);
    removeAlert(alert.Id);
    // Silencio deliberado: marcar como leída es cosmético y se reintenta solo
    // en la siguiente carga. Un aviso de error aquí interrumpiría la navegación
    // que el usuario acaba de iniciar al pulsar la alerta.
    try { await alertService.markRead(alert.Id); } catch {  }
    navigate(alert.Link);
  };

  const handleMarkAllRead = async () => {
    clearAll();
    setOpen(false);
    try { await alertService.markAllRead(); } catch {  }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">
              Notificaciones {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
              </button>
            )}
          </div>

          {}
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                Sin notificaciones nuevas
              </div>
            ) : (
              alerts.map(alert => (
                <button
                  key={alert.Id}
                  onClick={() => handleClick(alert)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                >
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICON[alert.Type] ?? <Bell className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{alert.Title}</p>
                    <p className="text-xs text-gray-500 truncate">{alert.Message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(alert.CreatedAt)}</p>
                  </div>
                  <X
                    className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 shrink-0 mt-0.5"
                    onClick={async (e) => {
                      e.stopPropagation();
                      removeAlert(alert.Id);
                      try { await alertService.markRead(alert.Id); } catch {  }
                    }}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
