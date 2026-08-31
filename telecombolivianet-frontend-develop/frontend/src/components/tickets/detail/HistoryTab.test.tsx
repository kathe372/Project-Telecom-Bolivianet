import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HistoryTab } from './HistoryTab';

/**
 * FE-01 en el modal de tickets — el spinner que giraba para siempre.
 *
 * La carga de la actividad hacía `.catch(() => {})`. Como `activityLoaded` solo
 * pasaba a `true` en el camino feliz, un fallo dejaba la pestaña mostrando
 * «Cargando historial…» indefinidamente: ni datos, ni vacío, ni error. El
 * usuario esperaba a algo que ya no iba a llegar.
 *
 * Los tres estados —cargando, vacío y fallo— tienen que ser distinguibles.
 */
describe('HistoryTab del ticket · los tres estados', () => {
  it('mientras carga, muestra que está cargando', () => {
    render(<HistoryTab activity={[]} activityLoaded={false} />);
    expect(screen.getByText(/cargando historial/i)).toBeInTheDocument();
  });

  it('si FALLA, lo dice — y deja de girar', () => {
    render(<HistoryTab activity={[]} activityLoaded={false} fallo />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument();
    expect(screen.queryByText(/cargando historial/i)).not.toBeInTheDocument();
  });

  it('si cargó y no hay nada, no habla de errores ni de carga', () => {
    // Contraprueba: sin ella, mostrar el error siempre también pasaría.
    render(<HistoryTab activity={[]} activityLoaded />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/cargando historial/i)).not.toBeInTheDocument();
  });
});
