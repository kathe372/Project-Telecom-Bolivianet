import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Wifi, Loader2, AlertCircle, Lock, Mail } from 'lucide-react';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/apiError';

const loginSchema = z.object({
  Email:    z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  Password: z.string().min(1, 'La contraseña es obligatoria'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate   = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError,  setServerError]  = useState('');
  const [isLoading,    setIsLoading]    = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    setIsLoading(true);
    try {
      const res = await authService.login(data);
      setSession({
        token:                  res.Token,
        userId:                 res.UserId,
        fullName:               res.FullName,
        email:                  res.Email,
        role:                   res.Role,
        requiresPasswordChange: res.RequiresPasswordChange,
      });
      if (res.RequiresPasswordChange) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(res.RedirectUrl, { replace: true });
      }
    } catch (err: unknown) {
      setServerError(extractApiError(err, 'Credenciales incorrectas. Intenta nuevamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 flex-col items-center justify-center p-12 overflow-hidden">
        {}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-blue-600/5 blur-3xl" />

        {}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 text-center max-w-sm">
          {}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 shadow-2xl shadow-blue-600/40 mb-8">
            <Wifi className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
            TelecomBoliviaNet
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Sistema integrado de gestión para proveedores de internet — clientes, cobranza, soporte y más.
          </p>

          {}
          <div className="mt-10 grid gap-3 text-left">
            {[
              { icon: '📡', text: 'Gestión de clientes y planes' },
              { icon: '💰', text: 'Cobranza y pagos automatizados' },
              { icon: '🎫', text: 'Tickets de soporte con SLA' },
              { icon: '🤖', text: 'Bot WhatsApp integrado' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-3 text-sm text-slate-400">
                <span className="text-base">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
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
          {}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_0_rgb(0,0,0,0.08)] border border-gray-100 p-8">
            <div className="mb-7">
              <h2 className="text-xl font-bold text-gray-900">Iniciar sesión</h2>
              <p className="text-sm text-gray-400 mt-1">Ingresa tus credenciales para continuar.</p>
            </div>

            {}
            {serverError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

              {}
              <div>
                <label htmlFor="Email" className="label">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="Email"
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@telecombolivianet.bo"
                    className={`input-field pl-9 ${errors.Email ? 'input-error' : ''}`}
                    {...register('Email')}
                  />
                </div>
                {errors.Email && <p className="error-msg"><AlertCircle className="w-3 h-3" />{errors.Email.message}</p>}
              </div>

              {}
              <div>
                <label htmlFor="Password" className="label">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`input-field pl-9 pr-10 ${errors.Password ? 'input-error' : ''}`}
                    {...register('Password')}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.Password && <p className="error-msg"><AlertCircle className="w-3 h-3" />{errors.Password.message}</p>}
              </div>

              {}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-2.5 mt-2 text-base"
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                  : 'Ingresar al sistema'
                }
              </button>

              <div className="text-center mt-3">
                <Link
                  to="/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </form>
          </div>

          <p className="text-center text-gray-400 text-xs mt-5">
            Acceso exclusivo para personal autorizado de TelecomBoliviaNet.
          </p>
        </div>
      </div>
    </div>
  );
}
