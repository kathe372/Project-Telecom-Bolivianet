import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  KeyRound, Loader2, AlertCircle, CheckCircle2,
  ShieldAlert, ArrowLeft,
} from 'lucide-react';
import { authService } from '@/services/authService';
import { extractApiError } from '@/utils/apiError';
import { useAuthStore } from '@/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { usePageTitle } from '@/hooks/usePageTitle';

const schema = z
  .object({
    CurrentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
    NewPassword: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número'),
    ConfirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((d) => d.NewPassword === d.ConfirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['ConfirmPassword'],
  })
  .refine((d) => d.NewPassword !== d.CurrentPassword, {
    message: 'La nueva contraseña no puede ser igual a la contraseña actual',
    path: ['NewPassword'],
  });

type FormData = z.infer<typeof schema>;

function Req({ label, met }: { label: string; met: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${met ? 'text-green-600' : 'text-gray-300'}`} />
      <span className={met ? 'text-green-700' : 'text-gray-500'}>{label}</span>
    </li>
  );
}

export default function ChangePasswordPage() {
  usePageTitle('Cambiar Contraseña');
  const navigate = useNavigate();
  const { requiresPasswordChange, setPasswordChanged, role } = useAuthStore(
    useShallow(s => ({ requiresPasswordChange: s.requiresPasswordChange, setPasswordChanged: s.setPasswordChanged, role: s.role })),
  );

  const isMandatory = requiresPasswordChange;

  const [serverError, setServerError] = useState('');
  const [success,     setSuccess]     = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const newPass = watch('NewPassword', '');
  const reqs = {
    length:    newPass.length >= 8,
    uppercase: /[A-Z]/.test(newPass),
    lowercase: /[a-z]/.test(newPass),
    number:    /[0-9]/.test(newPass),
  };

  const redirectAfterChange = () => {
    if (isMandatory) {
      navigate(role === 'Tecnico' ? '/tickets' : '/dashboard', { replace: true });
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    }
  };

  const onSubmit = async (data: FormData) => {
    setServerError('');
    setIsLoading(true);
    try {
      await authService.changePassword(data);
      setPasswordChanged();
      redirectAfterChange();
    } catch (err: unknown) {
      setServerError(extractApiError(err, 'Error al cambiar la contraseña.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-2xl mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Contraseña actualizada</h2>
          <p className="text-sm text-gray-500">Redirigiendo al dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {}
        {isMandatory ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Debes cambiar tu contraseña temporal
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                No puedes acceder al sistema hasta establecer una contraseña personal.
              </p>
            </div>
          </div>
        ) : (
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al dashboard
          </Link>
        )}

        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-2xl mb-3">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {isMandatory ? 'Establecer contraseña' : 'Cambiar contraseña'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isMandatory
              ? 'Elige una contraseña segura para tu cuenta'
              : 'Actualiza la contraseña de tu cuenta'}
          </p>
        </div>

        <div className="card p-6">
          {serverError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            <div>
              <label className="label">
                {isMandatory ? 'Contraseña temporal recibida' : 'Contraseña actual'}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className={`input-field ${errors.CurrentPassword ? 'input-error' : ''}`}
                {...register('CurrentPassword')}
              />
              {errors.CurrentPassword && (
                <p className="error-msg">{errors.CurrentPassword.message}</p>
              )}
            </div>

            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className={`input-field ${errors.NewPassword ? 'input-error' : ''}`}
                {...register('NewPassword')}
              />
              {errors.NewPassword && (
                <p className="error-msg">{errors.NewPassword.message}</p>
              )}
              {}
              {newPass.length > 0 && (
                <ul className="mt-2 space-y-1 pl-1">
                  <Req label="Mínimo 8 caracteres"          met={reqs.length} />
                  <Req label="Al menos una letra mayúscula" met={reqs.uppercase} />
                  <Req label="Al menos una letra minúscula" met={reqs.lowercase} />
                  <Req label="Al menos un número"           met={reqs.number} />
                </ul>
              )}
            </div>

            <div>
              <label className="label">Confirmar nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className={`input-field ${errors.ConfirmPassword ? 'input-error' : ''}`}
                {...register('ConfirmPassword')}
              />
              {errors.ConfirmPassword && (
                <p className="error-msg">{errors.ConfirmPassword.message}</p>
              )}
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 mt-2">
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                : isMandatory
                  ? 'Establecer contraseña y continuar'
                  : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
