import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2, AlertCircle, Wifi, ArrowLeft, PauseCircle, PlayCircle, UserX,
  CreditCard, Ticket, MessageSquare, Pencil, Smartphone,
  Paperclip, ClipboardList, Download, X,
} from 'lucide-react';
import { clientService } from '@/services/clientService';
import { paymentService } from '@/services/paymentService';
import { userService } from '@/services/userService';
import { PaymentModal } from '@/components/clients/PaymentModal';
import { TicketDetailModal } from '@/components/tickets/TicketDetailModal';
import { useAuthStore } from '@/store/authStore';
import { useTicketModal } from '@/hooks/useTicketModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { ClientDetailDto, InvoiceGridDto } from '@/types/client.types';
import type { UserSystemDto } from '@/types/auth.types';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import { formatBs } from '@/utils/currency';
import { statusBadge } from '@/components/clients/profile/profileHelpers';
import { InfoTab } from '@/components/clients/profile/InfoTab';
import { InvoiceGrid } from '@/components/clients/profile/InvoiceGrid';
import { ErrorDeCarga } from '@/components/shared/ErrorDeCarga';
import { PaymentHistory } from '@/components/clients/profile/PaymentHistory';
import { VoidPaymentModal } from '@/components/clients/profile/VoidPaymentModal';
import { PlanChangeTab } from '@/components/clients/profile/PlanChangeTab';
import { AttachmentsTab } from '@/components/clients/profile/AttachmentsTab';
import { HistoryTab } from '@/components/clients/profile/HistoryTab';
import { TicketsTab } from '@/components/clients/profile/TicketsTab';
import { ChatHistoryTab } from '@/components/clients/profile/ChatHistoryTab';
import { exportStatementPdf } from '@/components/clients/profile/exportStatementPdf';

export default function ClientProfilePage() {
  usePageTitle('Perfil de Cliente');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = useAuthStore(s => s.isAdmin);

  const [client,  setClient]  = useState<ClientDetailDto | null>(null);
  const [tab,     setTab]     = useState<'info' | 'billing' | 'tickets' | 'messages' | 'plan' | 'adjuntos' | 'historial'>('info');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [grid,    setGrid]    = useState<InvoiceGridDto | null>(null);
  const [gridYear, setGridYear] = useState(new Date().getFullYear());
  const [gridLoading, setGridLoading] = useState(false);
  const [gridFallo,   setGridFallo]   = useState(false);

  const [paymentModal,   setPaymentModal]   = useState<string | null>(null);
  const [voidPaymentId,  setVoidPaymentId]  = useState<string | null>(null);
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const [actionError,    setActionError]    = useState('');

  const { ticket: selectedTicket, loading: ticketLoading, openTicket, closeTicket, refreshTicket } = useTicketModal();
  const [technicians, setTechnicians] = useState<UserSystemDto[]>([]);

  const openConfirm  = (s: Omit<ConfirmState, 'open'>) => setConfirmDialog({ ...s, open: true });
  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };
  const runConfirm   = async (fn: () => Promise<void>) => {
    setConfirmRunning(true);
    try { await fn(); } finally { setConfirmRunning(false); }
  };

  const loadClient = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const clientData = await clientService.getById(id);
      setClient(clientData);
    } catch { setError('No se pudo cargar el perfil del cliente.'); }
    finally { setLoading(false); }
  }, [id]);

  const loadGrid = useCallback(async () => {
    if (!id) return;
    setGridLoading(true);
    setGridFallo(false);
    try {
      const gridData = await clientService.getInvoices(id, gridYear);
      setGrid(gridData);
    } catch {
      // Antes se tragaba y la seccion de facturas desaparecia entera: quien
      // mirara la ficha concluiria que el cliente no debe nada. Aqui eso es
      // dinero, asi que el fallo tiene que verse.
      setGridFallo(true);
      setGrid(null);
    }
    finally { setGridLoading(false); }
  }, [id, gridYear]);

  useEffect(() => { loadClient(); }, [loadClient]);
  useEffect(() => {
    if (tab === 'billing') loadGrid();
  }, [tab, loadGrid]);

  useEffect(() => {
    userService.getAll(1, 100)
      .then(res => setTechnicians(res.Items.filter((u: UserSystemDto) => u.Role === 'Admin' || u.Role === 'Tecnico')))
      // Silencio deliberado: solo rellena un desplegable auxiliar. Si falla, la
      // ficha del cliente se sigue viendo entera, que es lo que se vino a ver.
      .catch(() => {  });
  }, []);

  const reload = () => { loadClient(); loadGrid(); };

  const handleSuspend = () => {
    if (!client) return;
    setActionError('');
    openConfirm({
      title: 'Suspender servicio', confirmLabel: 'Suspender', variant: 'warning',
      message: `¿Suspender el servicio de ${client.FullName}?`,
      onConfirm: () => runConfirm(async () => {
        try { await clientService.suspend(client.Id); closeConfirm(); loadClient(); }
        catch { setActionError('Error al suspender.'); closeConfirm(); }
      }),
    });
  };

  const handleReactivate = () => {
    if (!client) return;
    setActionError('');
    openConfirm({
      title: 'Reactivar servicio', confirmLabel: 'Reactivar', variant: 'warning',
      message: `¿Reactivar el servicio de ${client.FullName}?`,
      onConfirm: () => runConfirm(async () => {
        try { await clientService.reactivate(client.Id); closeConfirm(); loadClient(); }
        catch { setActionError('Error al reactivar.'); closeConfirm(); }
      }),
    });
  };

  const handleCancel = () => {
    if (!client) return;
    setActionError('');
    openConfirm({
      title: 'Dar de baja', confirmLabel: 'Dar de baja', variant: 'danger',
      message: `¿Dar de baja a ${client.FullName}?\nSus registros se conservarán.`,
      onConfirm: () => runConfirm(async () => {
        try {
          const res = await clientService.cancel(client.Id, false);
          if (res.requiresConfirmation) {
            closeConfirm();
            openConfirm({
              title: 'Cliente con deuda pendiente', confirmLabel: 'Confirmar baja', variant: 'danger',
              message: 'El cliente tiene deuda pendiente. ¿Dar de baja igualmente?',
              onConfirm: () => runConfirm(async () => {
                try { await clientService.cancel(client.Id, true); closeConfirm(); loadClient(); }
                catch { setActionError('Error al dar de baja.'); closeConfirm(); }
              }),
            });
          } else { closeConfirm(); loadClient(); }
        } catch { setActionError('Error al dar de baja.'); closeConfirm(); }
      }),
    });
  };

  const handleVoidPayment = async (justif: string) => {
    if (!voidPaymentId) return;
    await paymentService.voidPayment(voidPaymentId, justif);
    setVoidPaymentId(null);
    reload();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando perfil...
    </div>
  );

  if (error || !client) return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
        <AlertCircle className="w-4 h-4" /> {error || 'Cliente no encontrado.'}
      </div>
    </div>
  );

  const TABS = [
    { key: 'info',     label: 'Información',    icon: <Wifi className="w-4 h-4" /> },
    { key: 'billing',  label: 'Facturación',    icon: <CreditCard className="w-4 h-4" /> },
    { key: 'plan',     label: 'Cambio de plan', icon: <Smartphone className="w-4 h-4" /> },
    { key: 'tickets',  label: 'Tickets',        icon: <Ticket className="w-4 h-4" /> },
    { key: 'messages',  label: 'Mensajes',       icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'adjuntos',  label: 'Documentos',     icon: <Paperclip className="w-4 h-4" /> },
    { key: 'historial', label: 'Historial',       icon: <ClipboardList className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/clients')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Clientes
      </button>

      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
              {client.FullName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{client.FullName}</h1>
                {statusBadge(client.Status)}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="font-mono font-medium text-blue-700">{client.TbnCode}</span>
                {' · '}{client.PhoneMain}
                {' · '}{client.Plan?.Name}
                {' · '}{client.Zone}
              </p>
              {client.TotalDebt > 0 && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  Deuda: {formatBs(client.TotalDebt)} ({client.PendingMonths} meses)
                </p>
              )}
              {(client.CreditBalance ?? 0) > 0 && (
                <p className="text-xs text-green-700 font-semibold mt-1 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  Crédito a favor: {formatBs(client.CreditBalance ?? 0, 2)}
                </p>
              )}
            </div>
          </div>

          {isAdmin() && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => navigate(`/clients/${client.Id}/edit`)}
                className="btn-secondary text-sm">
                <Pencil className="w-4 h-4" /> Editar
              </button>
              {client.Status === 'Activo' && (
                <button onClick={handleSuspend} className="btn-secondary text-sm text-amber-700">
                  <PauseCircle className="w-4 h-4" /> Suspender
                </button>
              )}
              {client.Status === 'Suspendido' && (
                <button onClick={handleReactivate} className="btn-secondary text-sm text-green-700">
                  <PlayCircle className="w-4 h-4" /> Reactivar
                </button>
              )}
              {client.Status !== 'DadoDeBaja' && (
                <button onClick={handleCancel} className="btn-danger text-sm">
                  <UserX className="w-4 h-4" /> Dar de baja
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-5 gap-1">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab client={client} />}

      {tab === 'billing' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Facturas por mes</h3>
              {isAdmin() && (
                <button
                  onClick={() => setPaymentModal('')}
                  className="btn-primary text-sm">
                  <CreditCard className="w-4 h-4" /> Registrar pago
                </button>
              )}
            </div>

            {gridLoading ? (
              <div className="flex items-center justify-center h-24 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
              </div>
            ) : gridFallo ? (
              <ErrorDeCarga que="la facturación del cliente" onReintentar={loadGrid} />
            ) : grid ? (
              <InvoiceGrid
                grid={grid}
                onPayInvoice={invoiceId => setPaymentModal(invoiceId)}
                year={gridYear}
                setYear={y => { setGridYear(y); }}
              />
            ) : null}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Historial de pagos
                {grid && grid.Payments.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {grid.Payments.length} registros
                  </span>
                )}
              </h3>
              {grid && grid.Payments.length > 0 && (
                <button
                  onClick={() => exportStatementPdf(client, grid)}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  title="Generar extracto PDF con todos los pagos del cliente"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar extracto PDF
                </button>
              )}
            </div>
            {gridLoading ? (
              <div className="flex items-center justify-center h-16 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando...
              </div>
            ) : grid ? (
              <PaymentHistory
                payments={grid.Payments}
                onVoidPayment={id => setVoidPaymentId(id)}
                isAdmin={isAdmin()}
              />
            ) : null}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <PlanChangeTab clientId={client.Id} currentPlanId={client.Plan?.Id ?? ''} currentPlanName={client.Plan?.Name ?? '—'} isAdmin={isAdmin()} onPlanChanged={loadClient} />
      )}

      {tab === 'tickets' && (
        <TicketsTab clientId={client.Id} onOpenTicket={openTicket} />
      )}

      {tab === 'messages' && (
        <ChatHistoryTab phone={client.PhoneMain} />
      )}

      {tab === 'adjuntos' && (
        <AttachmentsTab clientId={client.Id} isAdmin={isAdmin()} />
      )}

      {tab === 'historial' && (
        <HistoryTab clientId={client.Id} />
      )}

      {paymentModal !== null && grid && (
        <PaymentModal
          clientId={client.Id}
          invoices={grid.Invoices}
          preselected={paymentModal || undefined}
          onSuccess={() => { setPaymentModal(null); reload(); }}
          onClose={() => setPaymentModal(null)}
        />
      )}

      {voidPaymentId && (
        <VoidPaymentModal
          onConfirm={handleVoidPayment}
          onClose={() => setVoidPaymentId(null)}
        />
      )}

      {actionError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
          bg-red-700 text-white text-sm px-5 py-3 rounded-xl shadow-lg max-w-sm w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError('')} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {ticketLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      )}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          technicians={technicians}
          isAdmin={isAdmin()}
          onClose={closeTicket}
          onRefresh={() => refreshTicket(selectedTicket.Id)}
        />
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
