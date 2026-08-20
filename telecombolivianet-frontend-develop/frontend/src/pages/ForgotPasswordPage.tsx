import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Wifi, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { passwordResetService } from '@/services/passwordResetService';
import { extractApiError } from '@/utils/apiError';

const schema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const [sentTo,      setSentTo]      = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    setIsLoading(true);
    try {
      const res = await passwordResetService.forgotPassword(data.email);
      setSentTo(res.SentTo ?? data.email);
    } catch (err: unknown) {
      setServerError(extractApiError(err, 'Ocurrió un error. Intenta nuevamente.'));
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
            Te enviaremos un enlace a tu correo para que puedas recuperar el acceso.
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

            {sentTo ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-5">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Revisa tu correo</h2>
                <p className="text-sm text-gray-500 leading-relaxed mb-6">
                  Si el correo está registrado, recibirás un enlace de recuperación.
                  El enlace expira en <strong>1 hora</strong>.
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver al inicio de sesión
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <h2 className="text-xl font-bold text-gray-900">Recuperar contraseña</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                  </p>
                </div>

                {serverError && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{serverError}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="email" className="label">Correo electrónico</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="usuario@telecombolivianet.bo"
                        className={`input-field pl-9 ${errors.email ? 'input-error' : ''}`}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="error-msg">
                        <AlertCircle className="w-3 h-3" />{errors.email.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full py-2.5 mt-2 text-base"
                  >
                    {isLoading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                      : 'Enviar enlace de recuperación'
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
