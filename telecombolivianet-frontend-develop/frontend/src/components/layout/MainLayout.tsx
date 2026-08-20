import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTicketStore } from '@/store/ticketStore';
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import CommandPalette from '@/components/shared/CommandPalette';

export default function MainLayout() {
  const slaBreachedCount     = useTicketStore(s => s.slaBreachedCount);
  const { collapsed, toggle } = useSidebarCollapse();

  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const sidebarProps = {
    collapsed,
    slaBreachedCount,
    onToggleCollapse: toggle,
    onCloseMobile:    () => setMobileOpen(false),
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex">

      {}
      <aside className={`hidden lg:flex flex-col bg-slate-900 transition-all duration-200 ease-in-out ${
        collapsed ? 'w-[60px]' : 'w-[220px]'
      }`}>
        <Sidebar {...sidebarProps} />
      </aside>

      {}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[220px] bg-slate-900 flex flex-col lg:hidden transform transition-transform duration-250 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar {...sidebarProps} collapsed={false} />
      </aside>

      {}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto no-bounce bg-gray-50">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
