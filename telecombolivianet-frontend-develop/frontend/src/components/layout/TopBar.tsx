import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Wifi, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import NotificationBell from './NotificationBell';

interface TopBarProps {
  onMenuClick: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  Admin:        'Administrador',
  Tecnico:      'Técnico',
  SocioLectura: 'Solo lectura',
};

export function TopBar({ onMenuClick }: TopBarProps) {
  const navigate     = useNavigate();
  const fullName     = useAuthStore(s => s.fullName);
  const role         = useAuthStore(s => s.role);
  const clearSession = useAuthStore(s => s.clearSession);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    // Silencio deliberado: si el servidor no responde, la sesión LOCAL se
    // limpia igualmente. Bloquear el cierre de sesión por un fallo de red
    // dejaría al usuario dentro de una sesión que quería abandonar — lo
    // contrario de lo que pidió, y peor en un ordenador compartido.
    try { await authService.logout(); } catch {  }
    clearSession();
    navigate('/login', { replace: true });
  };

  const initials = fullName
    ? fullName.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?';

  return (
    <header className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 z-20 shadow-sm">
      {}
      <button
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {}
      <div className="flex items-center gap-2 flex-1 lg:hidden">
        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
          <Wifi className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-gray-900 text-sm">TelecomBoliviaNet</span>
      </div>

      {}
      <div className="hidden lg:flex flex-1" />

      {}
      <div className="flex items-center gap-1">
        {}
        <NotificationBell />

        {}
        <div className="w-px h-6 bg-gray-200 mx-1" />

        {}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-medium text-gray-800 max-w-[110px] truncate">{fullName}</span>
              <span className="text-[10px] text-gray-400">{role ? (ROLE_LABEL[role] ?? role) : ''}</span>
            </div>
            <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-gray-400" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden py-1">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-800 truncate">{fullName}</p>
                <p className="text-[11px] text-gray-400">{role ? (ROLE_LABEL[role] ?? role) : ''}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4 text-gray-400" /> Mi perfil
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
