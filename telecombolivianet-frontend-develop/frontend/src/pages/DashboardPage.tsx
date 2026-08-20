import { useState, useCallback, useEffect } from 'react';
import { LayoutDashboard, Settings, TrendingUp, Activity } from 'lucide-react';

import { useAuthStore }      from '@/store/authStore';
import { usePageTitle }      from '@/hooks/usePageTitle';
import { useDashboardStore } from '@/store/dashboardStore';
import { dashboardService }  from '@/services/dashboardService';
import type { DashboardPreferences } from '@/services/dashboardService';
import { useAsyncSection }   from '@/hooks/useAsyncSection';

import MiniBarChart          from '@/components/dashboard/MiniBarChart';
import SectionCard           from '@/components/dashboard/SectionCard';
import { SkeletonChart, ErrorSection } from '@/components/dashboard/SkeletonCard';

import DashboardCustomizeModal  from '@/components/dashboard/DashboardCustomizeModal';
import DashboardKpisSection     from '@/components/dashboard/DashboardKpisSection';
import DashboardTicketsPanel    from '@/components/dashboard/DashboardTicketsPanel';
import DashboardDebtorsPanel    from '@/components/dashboard/DashboardDebtorsPanel';
import DashboardReceipts        from '@/components/dashboard/DashboardReceipts';
import DashboardChatbotSection  from '@/components/dashboard/DashboardChatbotSection';
import DashboardAutoSection     from '@/components/dashboard/DashboardAutoSection';
import DashboardUpcomingCutoffsSection from '@/components/dashboard/DashboardUpcomingCutoffsSection';
import DashboardNotifSection    from '@/components/dashboard/DashboardNotifSection';
import DashboardAgingSection    from '@/components/dashboard/DashboardAgingSection';
import DashboardWorkloadSection from '@/components/dashboard/DashboardWorkloadSection';

// El dashboard muestra lo que necesita atención HOY (KPIs accionables,
// tendencia, urgencias, cartera, carga operativa) y los gráficos propios del
// panel de tickets. El detalle transaccional (pagos por método, WhatsApp
// mensaje-a-mensaje, zonas) sigue viviendo en su página dedicada —
// Cobranza, Conversaciones, Cobertura — para no repetirlo acá.
export default function DashboardPage() {
  usePageTitle('Dashboard');
  const userId = useAuthStore(s => s.userId);
  const [showCustomize, setShowCustomize] = useState(false);

  const getPrefs      = useDashboardStore(s => s.getPrefs);
  const storeSetPrefs = useDashboardStore(s => s.setPrefs);
  const prefs = getPrefs(userId ?? '');

  // El store persiste en localStorage del navegador (rápido, sin parpadeo),
  // pero la base de datos es la fuente de verdad real — si otra sesión o un
  // reset por SQL cambió las preferencias guardadas, hay que traerlas.
  useEffect(() => {
    if (!userId) return;
    dashboardService.getPreferences(userId)
      .then(p => storeSetPrefs(userId, p))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [tendMeses, setTendMeses] = useState<3 | 6 | 12>(6);

  const kpiF   = useCallback(() => dashboardService.getKpis(), []);
  const tendF  = useCallback(() => dashboardService.getCollectionsTrend(tendMeses), [tendMeses]);
  const tEstF  = useCallback(() => dashboardService.getTicketsEstado(), []);
  const tUrgF  = useCallback(() => dashboardService.getTicketsUrgentes(), []);
  const tTipoF = useCallback(() => dashboardService.getTicketsPorTipo(), []);
  const tResolF = useCallback(() => dashboardService.getResolucionPromedio(), []);
  const deudF  = useCallback(() => dashboardService.getDebtors(), []);
  const compF  = useCallback(() => dashboardService.getRecentReceipts(), []);
  const cortF     = useCallback(() => dashboardService.getProximosCorte(7), []);
  const chatbotF  = useCallback(() => dashboardService.getDashChatbotKpis(), []);
  const autoF     = useCallback(() => dashboardService.getDashAutoActions(), []);
  const notifF    = useCallback(() => dashboardService.getDashNotifStats(), []);
  const agingF    = useCallback(() => dashboardService.getAgingCartera(), []);
  const workF     = useCallback(() => dashboardService.getWorkloadTecnicos(), []);

  const { data: kpis,       status: kpisS,    retry: kpisR }    = useAsyncSection(kpiF,  { enabled: prefs.ShowKpis });
  const { data: tend,       status: tendS,    retry: tendR }    = useAsyncSection(tendF, { enabled: prefs.ShowTendencia });
  const { data: tEst,       status: tEstS,    retry: tEstR }    = useAsyncSection(tEstF,  { enabled: prefs.ShowTickets });
  const { data: tUrg,       status: tUrgS,    retry: tUrgR }    = useAsyncSection(tUrgF,  { enabled: prefs.ShowTickets });
  const { data: tTipo,      status: tTipoS,   retry: tTipoR }   = useAsyncSection(tTipoF, { enabled: prefs.ShowTickets });
  const { data: tResol,     status: tResolS,  retry: tResolR }  = useAsyncSection(tResolF, { enabled: prefs.ShowTickets });
  const { data: debtors,    status: deudS,    retry: deudR }    = useAsyncSection(deudF, { enabled: prefs.ShowDeudores });
  const { data: comprob,    status: compS,    retry: compR }    = useAsyncSection(compF, { enabled: prefs.ShowComprobantes });
  const { data: proxCorte,  status: cortS,    retry: cortR }    = useAsyncSection(cortF);
  const { data: chatbotKpis, status: chatbotS, retry: chatbotR } = useAsyncSection(chatbotF);
  const { data: autoActions, status: autoS,    retry: autoR }    = useAsyncSection(autoF);
  const { data: notifStats, status: notifS,   retry: notifR }   = useAsyncSection(notifF);
  const { data: aging,      status: agingS,   retry: agingR }   = useAsyncSection(agingF);
  const { data: workload,   status: workS,    retry: workR }    = useAsyncSection(workF);

  const handleSavePrefs = async (p: DashboardPreferences) => {
    await dashboardService.savePreferences(userId!, p);
    storeSetPrefs(userId ?? '', p);
  };

  const noVisible = !prefs.ShowKpis && !prefs.ShowTendencia && !prefs.ShowTickets
    && !prefs.ShowDeudores && !prefs.ShowComprobantes;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl shadow-sm shadow-blue-200">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle capitalize">
              {new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <button onClick={() => setShowCustomize(true)} className="btn-secondary text-xs px-3 py-1.5">
          <Settings className="w-3.5 h-3.5" /> Personalizar
        </button>
      </div>

      <div className="p-5 space-y-5 bg-gray-50 min-h-screen">

        {prefs.ShowKpis && (
          <section>
            <DashboardKpisSection kpis={kpis} status={kpisS} onRetry={kpisR} />
          </section>
        )}

        {prefs.ShowTendencia && (
          <div>
            {tendS === 'loading' && <SkeletonChart />}
            {tendS === 'error' && <ErrorSection title="Error cargando tendencia de cobros." onRetry={tendR} />}
            {tendS === 'success' && tend && (
              <SectionCard
                title={`Tendencia de Cobros — últimos ${tendMeses} meses`}
                icon={<Activity className="w-4 h-4 text-blue-500" />}
                headerAction={
                  <select
                    value={tendMeses}
                    onChange={e => setTendMeses(Number(e.target.value) as 3 | 6 | 12)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                  >
                    <option value={3}>3 meses</option>
                    <option value={6}>6 meses</option>
                    <option value={12}>12 meses</option>
                  </select>
                }
              >
                {tend.Meses.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-10">Sin datos de cobros aún</p>
                  : <MiniBarChart meses={tend.Meses} height={190} />
                }
                <p className="text-xs text-gray-400 mt-2">* Cobros verificados · hora Bolivia (UTC-4)</p>
              </SectionCard>
            )}
          </div>
        )}

        {prefs.ShowTickets && (
          <DashboardTicketsPanel
            tEst={tEst}    tEstS={tEstS}   tEstR={tEstR}
            tUrg={tUrg}    tUrgS={tUrgS}   tUrgR={tUrgR}
            tTipo={tTipo}  tTipoS={tTipoS} tTipoR={tTipoR}
            tResol={tResol} tResolS={tResolS} tResolR={tResolR}
          />
        )}

        {prefs.ShowDeudores && (
          <DashboardDebtorsPanel debtors={debtors} deudS={deudS} deudR={deudR} />
        )}

        {prefs.ShowComprobantes && (
          <DashboardReceipts comprob={comprob} status={compS} onRetry={compR} />
        )}

        {noVisible && (
          <div className="card p-16 flex flex-col items-center gap-4 text-center">
            <TrendingUp className="w-12 h-12 text-gray-200" />
            <p className="text-gray-400">No hay secciones visibles en el dashboard.</p>
            <button onClick={() => setShowCustomize(true)} className="btn-primary text-sm px-4 py-2">
              Configurar Dashboard
            </button>
          </div>
        )}

        <DashboardUpcomingCutoffsSection data={proxCorte} status={cortS} onRetry={cortR} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashboardAgingSection data={aging} status={agingS} onRetry={agingR} />
          <DashboardWorkloadSection data={workload} status={workS} onRetry={workR} />
        </div>

        <DashboardNotifSection notifStats={notifStats} status={notifS} onRetry={notifR} />

        <DashboardChatbotSection chatbotKpis={chatbotKpis} status={chatbotS} onRetry={chatbotR} />

        <DashboardAutoSection autoActions={autoActions} status={autoS} onRetry={autoR} />

      </div>

      {showCustomize && (
        <DashboardCustomizeModal
          open={showCustomize} prefs={prefs}
          onSave={handleSavePrefs} onClose={() => setShowCustomize(false)}
        />
      )}
    </>
  );
}
