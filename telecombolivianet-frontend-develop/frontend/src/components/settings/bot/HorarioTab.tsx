import { DIAS_SEMANA, type BotConfigDto } from '@/services/chatbotService';

function computeIsActive(horario: { HoraInicio: string; HoraFin: string; DiasActivos: boolean[] }): boolean {
  const now      = new Date();
  const jsDay    = now.getDay();
  const cfgIndex = jsDay === 0 ? 6 : jsDay - 1;
  if (!horario.DiasActivos[cfgIndex]) return false;
  const [sh, sm] = horario.HoraInicio.split(':').map(Number);
  const [eh, em] = horario.HoraFin.split(':').map(Number);
  const cur      = now.getHours() * 60 + now.getMinutes();
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

export function HorarioTab({
  config, onChange,
}: {
  config: BotConfigDto;
  onChange: (c: BotConfigDto) => void;
}) {
  const active   = computeIsActive(config.Horario);
  const now      = new Date();
  const timeStr  = now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dayName  = dayNames[now.getDay()];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Hora inicio (formato 24h)</label>
          <input type="time" value={config.Horario.HoraInicio}
            onChange={e => onChange({ ...config, Horario: { ...config.Horario, HoraInicio: e.target.value } })}
            className="input-field" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Hora fin (formato 24h)</label>
          <input type="time" value={config.Horario.HoraFin}
            onChange={e => onChange({ ...config, Horario: { ...config.Horario, HoraFin: e.target.value } })}
            className="input-field" />
        </div>
      </div>

      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
        active
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}>
        <span className="text-lg">{active ? '🟢' : '🔴'}</span>
        <div>
          <p className="font-semibold">
            Con esta configuración el bot estaría <strong>{active ? 'ACTIVO' : 'INACTIVO'}</strong> ahora mismo
          </p>
          <p className="text-xs opacity-75 mt-0.5">
            Hora actual: {dayName} {timeStr} · Rango configurado: {config.Horario.HoraInicio} – {config.Horario.HoraFin}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Días activos</p>
        <div className="flex gap-2">
          {DIAS_SEMANA.map((dia, i) => (
            <button key={dia}
              onClick={() => {
                const dias = [...config.Horario.DiasActivos];
                dias[i] = !dias[i];
                onChange({ ...config, Horario: { ...config.Horario, DiasActivos: dias } });
              }}
              className={`w-10 h-10 rounded-full text-sm font-medium border transition-colors ${
                config.Horario.DiasActivos[i]
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-green-400'
              }`}
            >
              {dia}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Mensaje fuera de horario</label>
        <textarea rows={3} value={config.Horario.MensajeFueraHorario}
          onChange={e => onChange({ ...config, Horario: { ...config.Horario, MensajeFueraHorario: e.target.value } })}
          className="input-field resize-none font-mono text-sm" />
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        ⏱ Los cambios se reflejan en el chatbot en menos de 1 minuto tras guardar.
      </p>
    </div>
  );
}
