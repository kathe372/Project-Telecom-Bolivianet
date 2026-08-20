import { Plus, Trash2 } from 'lucide-react';
import { INTENTS_DISPONIBLES, type BotConfigDto } from '@/services/chatbotService';

export function MenuTab({
  config, onChange,
}: {
  config: BotConfigDto;
  onChange: (c: BotConfigDto) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Botón de apertura</label>
          <input
            value={config.Menu.TituloBoton}
            onChange={e => onChange({ ...config, Menu: { ...config.Menu, TituloBoton: e.target.value } })}
            className="input-field"
            placeholder="Ver opciones"
            maxLength={20}
          />
          <p className="text-xs text-gray-400 mt-0.5">Máx. 20 caracteres</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Título de sección</label>
          <input
            value={config.Menu.TituloSeccion}
            onChange={e => onChange({ ...config, Menu: { ...config.Menu, TituloSeccion: e.target.value } })}
            className="input-field"
            placeholder="Servicios disponibles"
            maxLength={24}
          />
          <p className="text-xs text-gray-400 mt-0.5">Máx. 24 caracteres</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">
            Opciones del menú
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({config.Menu.Opciones.filter(o => o.Activa).length} activas)
            </span>
          </p>
          <button
            onClick={() => onChange({
              ...config,
              Menu: {
                ...config.Menu,
                Opciones: [...config.Menu.Opciones,
                  { Numero: String(config.Menu.Opciones.length + 1), Etiqueta: '', Intent: 'SOLICITAR_AGENTE', Activa: true, Descripcion: '', SoloCliente: false }
                ],
              },
            })}
            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar opción
          </button>
        </div>
        <div className="space-y-2">
          {config.Menu.Opciones.map((opt, i) => (
            <div key={i} className="p-3 border border-gray-200 rounded-lg bg-white space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={opt.Numero}
                  onChange={e => {
                    const opts = [...config.Menu.Opciones];
                    opts[i] = { ...opts[i], Numero: e.target.value };
                    onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                  }}
                  className="w-8 text-center text-sm font-bold border border-gray-200 rounded px-1 py-1"
                />
                <div className="flex-1 relative">
                  <input
                    value={opt.Etiqueta}
                    onChange={e => {
                      const opts = [...config.Menu.Opciones];
                      opts[i] = { ...opts[i], Etiqueta: e.target.value };
                      onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                    }}
                    placeholder="Etiqueta (máx 24 chars)"
                    maxLength={24}
                    className={`w-full text-sm border rounded px-2 py-1.5 ${opt.Etiqueta.length > 24 ? 'border-red-400' : 'border-gray-200'}`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300">
                    {opt.Etiqueta.length}/24
                  </span>
                </div>
                <select
                  value={opt.Intent}
                  onChange={e => {
                    const opts = [...config.Menu.Opciones];
                    opts[i] = { ...opts[i], Intent: e.target.value };
                    onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                  }}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                >
                  {INTENTS_DISPONIBLES.map(int => (
                    <option key={int.value} value={int.value}>{int.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer shrink-0">
                  <input type="checkbox" checked={opt.Activa}
                    onChange={e => {
                      const opts = [...config.Menu.Opciones];
                      opts[i] = { ...opts[i], Activa: e.target.checked };
                      onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                    }}
                    className="accent-green-600"
                  />
                  Activa
                </label>
                <button
                  onClick={() => {
                    const opts = config.Menu.Opciones.filter((_, j) => j !== i);
                    onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                  }}
                  className="text-gray-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 pl-10">
                <div className="flex-1 relative">
                  <input
                    value={opt.Descripcion ?? ''}
                    onChange={e => {
                      const opts = [...config.Menu.Opciones];
                      opts[i] = { ...opts[i], Descripcion: e.target.value };
                      onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                    }}
                    placeholder="Descripción (máx 72 chars)"
                    maxLength={72}
                    className={`w-full text-xs border rounded px-2 py-1.5 text-gray-500 ${(opt.Descripcion?.length ?? 0) > 72 ? 'border-red-400' : 'border-gray-100'}`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300">
                    {opt.Descripcion?.length ?? 0}/72
                  </span>
                </div>
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer shrink-0">
                  <input type="checkbox" checked={opt.SoloCliente ?? false}
                    onChange={e => {
                      const opts = [...config.Menu.Opciones];
                      opts[i] = { ...opts[i], SoloCliente: e.target.checked };
                      onChange({ ...config, Menu: { ...config.Menu, Opciones: opts } });
                    }}
                    className="accent-blue-600"
                  />
                  Solo clientes
                </label>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Las opciones marcadas como <strong>Solo clientes</strong> no se muestran a usuarios que aún no están registrados.
        </p>
      </div>
    </div>
  );
}
