import type { BotConfigDto } from '@/services/chatbotService';

export function MensajesTab({
  config, onChange,
}: {
  config: BotConfigDto;
  onChange: (c: BotConfigDto) => void;
}) {
  return (
    <div className="space-y-4">
      {([
        { key: 'Bienvenida',          label: 'Bienvenida (cliente identificado)' },
        { key: 'BienvenidaProspecto', label: 'Bienvenida (prospecto sin cuenta)' },
        { key: 'NoEntendido',         label: 'Respuesta cuando no entiende' },
        { key: 'EscaladoAgente',      label: 'Escalado a agente' },
      ] as const).map(({ key, label }) => (
        <div key={key}>
          <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
          <textarea rows={3}
            value={config.Mensajes[key]}
            onChange={e => onChange({
              ...config, Mensajes: { ...config.Mensajes, [key]: e.target.value }
            })}
            className="input-field resize-none font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-0.5">
            Variables disponibles: <code>{'{nombre}'}</code>
          </p>
        </div>
      ))}
    </div>
  );
}
