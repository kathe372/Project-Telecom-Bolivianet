import { Activity } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonChart, ErrorSection } from './SkeletonCard';
import type { DashChatbotDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

export default function DashboardChatbotSection({ chatbotKpis, status, onRetry }: {
  chatbotKpis: DashChatbotDto | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonChart />;
  if (status === 'error') return <ErrorSection title="Chatbot" onRetry={onRetry} />;
  if (!chatbotKpis) return null;

  return (
    <SectionCard title="Chatbot WhatsApp" icon={<Activity className="w-4 h-4 text-purple-600" />}>
      {!chatbotKpis.IsAvailable && (
        <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          Chatbot no disponible — datos no actualizados
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {[
          { l: 'Activas ahora', v: chatbotKpis.ConversacionesActivas.toString() },
          { l: 'Hoy',           v: chatbotKpis.ConversacionesHoy.toString() },
          { l: 'Este mes',      v: chatbotKpis.ConversacionesMes.toString() },
        ].map(({ l, v }) => (
          <div key={l} className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">{l}</p>
            <p className="text-xl font-bold text-gray-900">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-6 text-sm mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-gray-600">Bot resolvió: <strong>{chatbotKpis.TasaResolucionBot}%</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="text-gray-600">Escalado: <strong>{chatbotKpis.TasaEscaladoHumano}%</strong></span>
        </div>
      </div>
      {chatbotKpis.IntencionesFrecuentes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Intenciones frecuentes</p>
          <div className="space-y-1.5">
            {chatbotKpis.IntencionesFrecuentes.map(i => (
              <div key={i.Intencion} className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-32 truncate">{i.Intencion}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${i.PctTotal}%` }} />
                </div>
                <span className="text-gray-400 w-10 text-right">{i.Ocurrencias}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
