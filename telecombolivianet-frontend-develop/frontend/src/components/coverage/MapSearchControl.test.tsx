import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MapSearchControl, { parseCoordinates } from './MapSearchControl';

describe('parseCoordinates — TC-FE-MAP-01', () => {
  it('acepta "lat, lng" con decimales y espacios', () => {
    expect(parseCoordinates('-17.3895, -66.1568')).toEqual({ lat: -17.3895, lng: -66.1568 });
    expect(parseCoordinates(' -17.39 ,-66.15 ')).toEqual({ lat: -17.39, lng: -66.15 });
  });

  it('rechaza texto normal y rangos inválidos', () => {
    expect(parseCoordinates('Villa México Sacaba')).toBeNull();
    expect(parseCoordinates('95.0, -66.15')).toBeNull();
    expect(parseCoordinates('-17.39, 190')).toBeNull();
    expect(parseCoordinates('')).toBeNull();
  });
});

describe('MapSearchControl — TC-FE-MAP-02 a TC-FE-MAP-04', () => {
  const onSelect = vi.fn();

  beforeEach(() => onSelect.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('TC-FE-MAP-02 — coordenadas pegadas llaman onSelect sin geocodificar', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<MapSearchControl onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(/Buscar sector/i);
    fireEvent.change(input, { target: { value: '-17.39, -66.15' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(-17.39, -66.15, '-17.39, -66.15');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('TC-FE-MAP-03 — búsqueda por texto geocodifica con Nominatim y lista resultados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => [
        { display_name: 'Villa México, Sacaba, Bolivia', lat: '-17.4', lon: '-66.03' },
      ],
    } as Response);

    render(<MapSearchControl onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/Buscar sector/i);
    fireEvent.change(input, { target: { value: 'Villa México' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const result = await screen.findByText(/Villa México, Sacaba/);
    fireEvent.click(result);

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(-17.4, -66.03, 'Villa México, Sacaba, Bolivia'));
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('nominatim.openstreetmap.org');
    expect(calledUrl).toContain('countrycodes=bo');
  });

  it('TC-FE-MAP-04 — sin resultados muestra sugerencia de coordenadas', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => [],
    } as Response);

    render(<MapSearchControl onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/Buscar sector/i);
    fireEvent.change(input, { target: { value: 'xyz inexistente' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByText(/Sin resultados/);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
