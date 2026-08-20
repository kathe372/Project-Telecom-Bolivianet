import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Wifi, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { passwordResetService } from '@/services/passwordResetService';
import { extractApiError } from '@/utils/apiError';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const navigate             = useNavigate();
  const [searchParams]       = useSearchParams();
  const token                = searchParams.get('token') ?? '';

  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [serverError,  setServerError]  = useState('');
  const [isLoading,    setIsLoading]    = useState(false);
  const [success,      setSuccess]      = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-8 w-full max-w-sm text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Enlace inválido</h2>
          <p className="text-sm text-gray-500 mb-6">
            El enlace de recuperación no es válido o está incompleto.
          </p>
          <Link to="/forgot-password" className="btn-primary inline-block px-6 py-2.5 text-sm">
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    setServerError('');
    setIsLoading(true);
    try {
      await passwordResetService.resetPassword(token, data.newPassword, data.confirmPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err: unknown) {
      setServerError(extractApiError(err, 'El enlace ha expirado o es inválido. Solicita uno nuevo.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 flex-col items-center justify-center p-12 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative z-10 text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 shadow-2xl shadow-blue-600/40 mb-8">
            <Wifi className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">TelecomBoliviaNet</h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Elige una nueva contraseña segura para proteger tu cuenta.
          </p>
        </div>
        <p className="absolute bottom-6 text-slate-700 text-xs">
          © {new Date().getFullYear()} TelecomBoliviaNet · Cochabamba, Bolivia
        </p>
      </div>

      {}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">

        {}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mb-3">
            <Wifi className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">TelecomBoliviaNet</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_0_rgb(0,0,0,0.08)] border border-gray-100 p-8">

            {success ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-5">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Contraseña actualizada</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Tu contraseña fue restablecida correctamente. Redirigiendo al inicio de sesión...
                </p>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <h2 className="text-xl font-bold text-gray-900">Nueva contraseña</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.
                  </p>
                </div>

                {serverError && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-700">{serverError}</p>
                      <Link to="/forgot-password" className="text-xs text-red-600 underline mt-1 inline-block">
                        Solicitar nuevo enlace
                      </Link>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

                  {}
                  <div>
                    <label htmlFor="newPassword" className="label">Nueva contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="newPassword"
                        type={showNew ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className={`input-field pl-9 pr-10 ${errors.newPassword ? 'input-error' : ''}`}
                        {...register('newPassword')}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        onClick={() => setShowNew((v) => !v)}
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.newPassword && (
                      <p className="error-msg">
                        <AlertCircle className="w-3 h-3" />{errors.newPassword.message}
                      </p>
                    )}
                  </div>

                  {}
                  <div>
                    <label htmlFor="confirmPassword" className="label">Confirmar contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className={`input-field pl-9 pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                        {...register('confirmPassword')}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        onClick={() => setShowConfirm((v) => !v)}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="error-msg">
                        <AlertCircle className="w-3 h-3" />{errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full py-2.5 mt-2 text-base"
                  >
                    {isLoading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                      : 'Restablecer contraseña'
                    }
                  </button>
                </form>

                <div className="mt-5 text-center">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Volver al inicio de sesión
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
