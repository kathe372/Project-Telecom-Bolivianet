import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryTab } from './HistoryTab';
import * as clientService from '@/services/clientService';

/**
 * FE-01 — Un fallo de carga y «no hay datos» ya no se ven igual.
 *
 * El `catch` estaba vacío: si la petición fallaba, `data` se quedaba en null,
 * `loading` pasaba a false y la pestaña dibujaba «No hay actividad registrada».
 * Para quien atiende, «sin incidencias previas» y «no pudimos cargarlo» son
 * hechos muy distintos, y en pantalla eran el mismo.
 *
 * Estas pruebas separan los dos casos. La segunda es la que da sentido a la
 * primera: sin ella, mostrar el error SIEMPRE también pasaría.
 */
vi.mock('@/services/clientService');

const historialVacio = { Items: [], Total: 0, Page: 1, PageSize: 25 };

describe('HistoryTab · fallo de carga frente a historial vacío', () => {
  beforeEach(() => vi.resetAllMocks());

  it('si la carga FALLA, lo dice — y no finge que no hay historial', async () => {
    vi.mocked(clientService.getClientHistorial).mockRejectedValue(new Error('red caída'));

    render(<HistoryTab clientId="c-1" />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument();
    expect(screen.queryByText(/no hay actividad registrada/i)).not.toBeInTheDocument();
  });

  it('si NO hay historial, dice que no hay — y no habla de errores', async () => {
    // Contraprueba: distingue «arreglado» de «ahora siempre muestra error».
    vi.mocked(clientService.getClientHistorial).mockResolvedValue(historialVacio as never);

    render(<HistoryTab clientId="c-1" />);

    await waitFor(() =>
      expect(screen.getByText(/no hay actividad registrada/i)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el botón de reintentar vuelve a pedir los datos, y si llegan los muestra', async () => {
    // Sin reintento, la única salida era recargar la página entera y perder el
    // sitio donde estabas.
    vi.mocked(clientService.getClientHistorial)
      .mockRejectedValueOnce(new Error('fallo pasajero'))
      .mockResolvedValueOnce({
        ...historialVacio,
        Items: [{
          Id: 'a-1', Tipo: 'Ticket', Actor: 'ZZ Operador',
          Descripcion: 'ZZ evento de prueba',
          OcurridoAt: new Date().toISOString(),
        }],
        Total: 1,
      } as never);

    render(<HistoryTab clientId="c-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() =>
      expect(screen.getByText(/ZZ evento de prueba/)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
