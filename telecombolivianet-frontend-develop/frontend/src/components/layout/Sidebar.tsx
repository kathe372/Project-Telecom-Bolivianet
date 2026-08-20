import { memo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, CreditCard, Ticket,
  Settings, MessageSquare, Bot, Building2,
  ChevronLeft, ChevronRight, ArrowLeftRight, Bell,
  ClipboardList, X, Wrench, BarChart2, Wifi, MapPin,
  CalendarDays, Clock,
} from 'lucide-react';
import type { UserRole } from '@/types/auth.types';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  to:    string;
  label: string;
  icon:  React.ReactNode;
  roles?: UserRole[];
  exact?: boolean;
}

interface NavGroup {
  label?: string;
  items:  NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, exact: true },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { to: '/clients',       label: 'Clientes',      icon: <Users className="w-4 h-4" />,          roles: ['Admin', 'Tecnico'] },
      { to: '/plans',         label: 'Planes',         icon: <Building2 className="w-4 h-4" />,      roles: ['Admin'] },
      { to: '/instalaciones', label: 'Instalaciones',  icon: <Wrench className="w-4 h-4" />,         roles: ['Admin', 'Tecnico'], exact: true },
      { to: '/plan-changes',  label: 'Cambio de Plan', icon: <ArrowLeftRight className="w-4 h-4" />, roles: ['Admin'] },
    ],
  },
  {
    label: 'Red',
    items: [
      { to: '/coverage', label: 'Cobertura', icon: <MapPin className="w-4 h-4" />, roles: ['Admin', 'Tecnico'], exact: true },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { to: '/invoices',      label: 'Cobranza',        icon: <FileText className="w-4 h-4" />,   roles: ['Admin'] },
      { to: '/payments',      label: 'Historial Pagos', icon: <CreditCard className="w-4 h-4" />, roles: ['Admin'] },
      { to: '/annual-report', label: 'Reporte Anual',   icon: <BarChart2 className="w-4 h-4" />,  roles: ['Admin', 'SocioLectura'] },
    ],
  },
  {
    label: 'Soporte',
    items: [
      { to: '/tickets', label: 'Tickets', icon: <Ticket className="w-4 h-4" />, roles: ['Admin', 'Tecnico'], exact: true },
      { to: '/instalaciones/calendario', label: 'Calendario', icon: <CalendarDays className="w-4 h-4" />, roles: ['Admin', 'Tecnico'] },
    ],
  },
  {
    label: 'WhatsApp / Bot',
    items: [
      { to: '/conversaciones',       label: 'Conversaciones', icon: <MessageSquare className="w-4 h-4" /> },
      { to: '/bot-config',           label: 'Bot Config',     icon: <Bot className="w-4 h-4" />,  roles: ['Admin'] },
      { to: '/notifications/config', label: 'Notificaciones', icon: <Bell className="w-4 h-4" />, roles: ['Admin'] },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: '/users',      label: 'Usuarios',      icon: <Users className="w-4 h-4" />,         roles: ['Admin'] },
      { to: '/audit-logs', label: 'Auditoría',     icon: <ClipboardList className="w-4 h-4" />, roles: ['Admin'] },
      { to: '/settings',   label: 'Configuración', icon: <Settings className="w-4 h-4" />,      roles: ['Admin'] },
      { to: '/settings/horarios', label: 'Horarios y feriados', icon: <Clock className="w-4 h-4" />, roles: ['Admin'] },
    ],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group',
    isActive
      ? 'bg-white/10 text-white'
      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
  ].join(' ');

export interface SidebarProps {
  collapsed:        boolean;
  slaBreachedCount: number;
  onToggleCollapse: () => void;
  onCloseMobile:    () => void;
}

export const Sidebar = memo(function Sidebar({
  collapsed, slaBreachedCount,
  onToggleCollapse, onCloseMobile,
}: SidebarProps) {
  const role = useAuthStore(s => s.role);
  const isVisible = (item: NavItem) =>
    !item.roles || (role != null && item.roles.includes(role));

  return (
    <div className="flex flex-col h-full">

      {}
      <div className={`flex items-center px-4 py-5 border-b border-white/10 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0 shadow-lg">
              <Wifi className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate leading-tight">TelecomBoliviaNet</p>
              <p className="text-[10px] text-slate-500 leading-tight">Panel de gestión</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg">
            <Wifi className="w-4 h-4 text-white" />
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`hidden lg:flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors shrink-0 ${collapsed ? 'mt-3' : ''}`}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onCloseMobile}
          aria-label="Cerrar menú"
          className="lg:hidden flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-slate-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {}
      <nav className="flex-1 overflow-y-auto no-bounce px-3 py-3 mt-1 space-y-5">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(isVisible);
          if (visibleItems.length === 0) return null;
          return (
            <div key={gi}>
              {group.label && !collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && <div className="border-t border-white/10 mb-2" />}
              <div className="space-y-0.5">
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={linkClass}
                    onClick={onCloseMobile}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-blue-400 opacity-0 [.text-white>&]:opacity-100 transition-opacity" />
                    <span className="relative shrink-0">
                      {item.icon}
                      {collapsed && item.to === '/tickets' && slaBreachedCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-1 ring-slate-900" />
                      )}
                    </span>
                    {!collapsed && (
                      <span className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="truncate">{item.label}</span>
                        {item.to === '/tickets' && slaBreachedCount > 0 && (
                          <span className="ml-auto shrink-0 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-px font-bold leading-none">
                            {slaBreachedCount}
                          </span>
                        )}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

    </div>
  );
});
