import { useState } from 'react';
import { clientService } from '@/services/clientService';
import type { ConfirmState } from '@/components/shared/ConfirmDialog';
import { CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';

interface UseClientActionsReturn {
  confirmDialog:   ConfirmState;
  confirmRunning:  boolean;
  actionError:     string;
  closeConfirm:    () => void;
  clearActionError:() => void;
  handleSuspend:   (id: string, name: string) => void;
  handleReactivate:(id: string, name: string) => void;
  handleCancel:    (id: string, name: string) => void;
}

export function useClientActions(onSuccess: () => void): UseClientActionsReturn {
  const [confirmDialog,   setConfirmDialog]   = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning,  setConfirmRunning]  = useState(false);
  const [actionError,     setActionError]     = useState('');

  const openConfirm = (state: Omit<ConfirmState, 'open'>) =>
    setConfirmDialog({ ...state, open: true });

  const closeConfirm = () => {
    setConfirmDialog(CONFIRM_CLOSED);
    setConfirmRunning(false);
  };

  const runConfirm = async (fn: () => Promise<void>) => {
    setConfirmRunning(true);
    try { await fn(); }
    finally { setConfirmRunning(false); }
  };

  const handleSuspend = (id: string, name: string) => {
    setActionError('');
    openConfirm({
      title:        'Suspender servicio',
      message:      `¿Suspender el servicio de ${name}?\nSe notificará al cliente por WhatsApp.`,
      confirmLabel: 'Suspender',
      variant:      'warning',
      onConfirm:    () => runConfirm(async () => {
        try { await clientService.suspend(id); closeConfirm(); onSuccess(); }
        catch { setActionError('Error al suspender. Intenta nuevamente.'); closeConfirm(); }
      }),
    });
  };

  const handleReactivate = (id: string, name: string) => {
    setActionError('');
    openConfirm({
      title:        'Reactivar servicio',
      message:      `¿Reactivar el servicio de ${name}?`,
      confirmLabel: 'Reactivar',
      variant:      'warning',
      onConfirm:    () => runConfirm(async () => {
        try { await clientService.reactivate(id); closeConfirm(); onSuccess(); }
        catch { setActionError('Error al reactivar. Intenta nuevamente.'); closeConfirm(); }
      }),
    });
  };

  const handleCancel = (id: string, name: string) => {
    setActionError('');
    openConfirm({
      title:        'Dar de baja',
      message:      `¿Dar de baja a ${name}?\nSus registros se conservarán.`,
      confirmLabel: 'Dar de baja',
      variant:      'danger',
      onConfirm:    () => runConfirm(async () => {
        try {
          const res = await clientService.cancel(id, false);
          if (res.requiresConfirmation) {
            closeConfirm();
            openConfirm({
              title:        'Cliente con deuda pendiente',
              message:      `${name} tiene deuda pendiente. ¿Dar de baja igualmente?`,
              confirmLabel: 'Confirmar baja',
              variant:      'danger',
              onConfirm:    () => runConfirm(async () => {
                try { await clientService.cancel(id, true); closeConfirm(); onSuccess(); }
                catch { setActionError('Error al dar de baja. Intenta nuevamente.'); closeConfirm(); }
              }),
            });
          } else {
            closeConfirm(); onSuccess();
          }
        } catch { setActionError('Error al dar de baja. Intenta nuevamente.'); closeConfirm(); }
      }),
    });
  };

  return {
    confirmDialog,
    confirmRunning,
    actionError,
    closeConfirm,
    clearActionError: () => setActionError(''),
    handleSuspend,
    handleReactivate,
    handleCancel,
  };
}
