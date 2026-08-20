import type { ReactNode } from 'react';

export default function SectionCard({ title, icon, children, badge, onBadgeClick, subtitle, headerAction }: {
  title: string; icon?: ReactNode; children: ReactNode;
  badge?: string; onBadgeClick?: () => void;
  subtitle?: string;
  headerAction?: ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {icon && <span className="p-1 rounded-md bg-gray-50">{icon}</span>}
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
        {headerAction ?? (badge && (
          <button
            onClick={onBadgeClick}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
          >
            {badge}
          </button>
        ))}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
