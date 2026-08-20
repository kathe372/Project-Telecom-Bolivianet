import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { userService } from '@/services/userService';
import { extractApiError } from '@/utils/apiError';

export default function ConfirmEmailPage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get('token') ?? '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('El enlace de activación no es válido. Verifica que copiaste la URL completa del correo.');
      return;
    }

    userService.confirmEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Tu cuenta ha sido activada correctamente. Ya puedes iniciar sesión.');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(extractApiError(err, 'El enlace de activación no es válido o ha expirado.'));
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
        {}
        <div className="bg-blue-700 rounded-xl px-6 py-4 mb-6 inline-block">
          <p className="text-white font-bold text-lg tracking-tight">TelecomBoliviaNet</p>
          <p className="text-blue-200 text-xs">Sistema de Gestión</p>
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Activando tu cuenta...</h2>
            <p className="text-sm text-gray-500">Por favor espera un momento.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Cuenta activada!</h2>
            <p className="text-sm text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Ir al inicio de sesión
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No se pudo activar la cuenta</h2>
            <p className="text-sm text-gray-600 mb-6">{message}</p>
            <p className="text-xs text-gray-400">
              Si el enlace expiró, pide al administrador que reenvíe la invitación desde la sección de Usuarios.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
