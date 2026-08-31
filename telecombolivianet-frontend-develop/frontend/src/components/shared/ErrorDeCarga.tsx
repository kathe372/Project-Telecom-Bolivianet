import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorDeCargaProps {
  /** Qué no se pudo cargar, en singular y sin artículo: «el historial». */
  que: string;
  /** Si se pasa, se ofrece un botón para volver a intentarlo. */
  onReintentar?: () => void;
  className?: string;
}

/**
 * Lo que se muestra cuando una carga falla.
 *
 * Existe porque el frontend tenía diez sitios que capturaban el error y no
 * hacían nada con él. El efecto no era una pantalla rota —eso se ve y se
 * reporta— sino algo peor: **el fallo se dibujaba igual que «no hay datos»**.
 *
 * En el historial de un cliente, «sin incidencias previas» y «no pudimos
 * cargarlo» son hechos muy distintos para quien atiende, y en pantalla eran el
 * mismo. En la rejilla de facturas, un error se veía como si el cliente no
 * debiera nada.
 *
 * De ahí las dos decisiones de este componente: **decir que falló** —no
 * insinuarlo— y **ofrecer reintentar**, porque un fallo de red suele ser
 * pasajero y sin botón la única salida era recargar la página entera y perder
 * el sitio donde estabas.
 */
export function ErrorDeCarga({ que, onReintentar, className = '' }: ErrorDeCargaProps) {
  return (
    <div
      role="alert"
      className={`card p-8 flex flex-col items-center gap-3 text-center ${className}`}
    >
      <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-700">
          No se pudo cargar {que}.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Esto no significa que no haya datos: no llegamos a consultarlos.
        </p>
      </div>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     rounded-md border border-gray-200 text-gray-600
                     hover:border-indigo-300 hover:text-indigo-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      )}
    </div>
  );
}
