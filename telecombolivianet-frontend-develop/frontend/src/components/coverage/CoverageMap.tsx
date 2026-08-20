import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon   from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { CoverageZone, DistributionBox, ClientLocation } from '@/types/coverage';

// Fix Leaflet default icon path broken by Vite bundler
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl:     markerShadow,
});

const ZONE_COLORS: Record<string, string> = {
  Activa:      '#22c55e',
  EnExpansion: '#f59e0b',
  Planificada: '#94a3b8',
  Inactiva:    '#64748b',
};

const iconAvailable = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#22c55e;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [12, 12], iconAnchor: [6, 6],
});

const iconFull = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [12, 12], iconAnchor: [6, 6],
});

export interface CoverageMapProps {
  zones:          CoverageZone[];
  boxes:          DistributionBox[];
  clients?:       ClientLocation[];
  selectedZoneId?: string;
  centerLat?:     number;
  centerLng?:     number;
  drawPolygon?:   boolean;
  placePin?:      boolean;
  /** Punto a enfocar (buscador, F7). */
  focusPoint?:    { lat: number; lng: number } | null;
  /** Modo "verificar cobertura con clic" (F7). */
  checkMode?:     boolean;
  /** Resultado de la verificación para mostrar como popup (F7). */
  checkMarker?:   { lat: number; lng: number; popupHtml: string } | null;
  /** Zona en edición de geometría (F7) — habilita arrastrar vértices y pines. */
  editZoneId?:    string | null;
  onZoneClick:    (zoneId: string) => void;
  onBoxClick:     (boxId: string) => void;
  onPolygonDrawn: (geojson: string) => void;
  onPointPlaced:  (lat: number, lng: number) => void;
  onCheckPoint?:  (lat: number, lng: number) => void;
  onZoneGeometryChanged?: (zoneId: string, geojson: string) => void;
  onBoxMoved?:    (boxId: string, lat: number, lng: number) => void;
}

export default function CoverageMap({
  zones, boxes, clients = [], selectedZoneId,
  centerLat = -17.389, centerLng = -66.156,
  drawPolygon = false, placePin = false,
  focusPoint = null, checkMode = false, checkMarker = null, editZoneId = null,
  onZoneClick, onBoxClick, onPolygonDrawn, onPointPlaced,
  onCheckPoint, onZoneGeometryChanged, onBoxMoved,
}: CoverageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const boxesLayerRef = useRef<L.LayerGroup | null>(null);
  const clientsLayerRef = useRef<L.LayerGroup | null>(null);
  const checkLayerRef = useRef<L.LayerGroup | null>(null);

  // ── Initialise map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom:   13,
      zoomControl: true,
    });

    // Capas base: OSM + satelital (Esri World Imagery) — en barrios sin
    // calles nombradas la foto aérea es la única referencia fiable (F7).
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri — World Imagery',
      maxZoom: 19,
    });
    L.control.layers({ 'Mapa': osm, 'Satélite': satellite }).addTo(map);

    zonesLayerRef.current = L.layerGroup().addTo(map);
    clientsLayerRef.current = L.layerGroup().addTo(map);
    boxesLayerRef.current = L.layerGroup().addTo(map);
    checkLayerRef.current = L.layerGroup().addTo(map);

    // Geoman controls (polygon draw + pin)
    map.pm.addControls({
      position:      'topleft',
      drawMarker:    true,
      drawPolyline:  false,
      drawPolygon:   true,
      drawRectangle: false,
      drawCircle:    false,
      drawCircleMarker: false,
      editMode:      false,
      dragMode:      false,
      cutPolygon:    false,
      removalMode:   false,
    });

    map.on('pm:create', (e) => {
      const layer = e.layer;
      if (e.shape === 'Polygon') {
        const geoJson = JSON.stringify((layer as L.Polygon).toGeoJSON().geometry);
        map.removeLayer(layer);
        onPolygonDrawn(geoJson);
      } else if (e.shape === 'Marker') {
        const latlng = (layer as L.Marker).getLatLng();
        map.removeLayer(layer);
        onPointPlaced(latlng.lat, latlng.lng);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toggle draw mode when props change ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawPolygon) map.pm.enableDraw('Polygon');
    else             map.pm.disableDraw('Polygon');
  }, [drawPolygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (placePin) map.pm.enableDraw('Marker');
    else          map.pm.disableDraw('Marker');
  }, [placePin]);

  // ── Focus point (buscador F7) ────────────────────────────────────────────────
  useEffect(() => {
    if (!focusPoint || !mapRef.current) return;
    mapRef.current.setView([focusPoint.lat, focusPoint.lng], 17);
  }, [focusPoint]);

  // ── Check mode: clic en el mapa → verificar cobertura (F7) ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !checkMode || !onCheckPoint) return;

    const container = map.getContainer();
    container.style.cursor = 'crosshair';
    const handler = (e: L.LeafletMouseEvent) => onCheckPoint(e.latlng.lat, e.latlng.lng);
    map.on('click', handler);
    return () => {
      map.off('click', handler);
      container.style.cursor = '';
    };
  }, [checkMode, onCheckPoint]);

  // ── Marcador con resultado de verificación (F7) ──────────────────────────────
  useEffect(() => {
    const layer = checkLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!checkMarker) return;

    const marker = L.marker([checkMarker.lat, checkMarker.lng]);
    marker.bindPopup(checkMarker.popupHtml, { maxWidth: 260 });
    layer.addLayer(marker);
    marker.openPopup();
  }, [checkMarker]);

  // ── Re-render zone polygons when zones or selection changes ─────────────────
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    zones.forEach(zone => {
      if (!zone.geoJson) return;
      try {
        const geom = JSON.parse(zone.geoJson);
        const poly = L.geoJSON(geom, {
          style: {
            color:       ZONE_COLORS[zone.estado] ?? '#94a3b8',
            weight:      zone.id === selectedZoneId ? 3 : 1.5,
            fillOpacity: zone.id === selectedZoneId ? 0.25 : 0.12,
          },
        });
        poly.on('click', () => onZoneClick(zone.id));
        layer.addLayer(poly);

        // Edición de geometría (F7): vértices arrastrables de la zona elegida
        if (zone.id === editZoneId && onZoneGeometryChanged) {
          poly.getLayers().forEach(child => {
            const editable = child as L.Polygon;
            editable.pm?.enable({ allowSelfIntersection: false });
            editable.on('pm:edit', () => {
              onZoneGeometryChanged(zone.id,
                JSON.stringify(editable.toGeoJSON().geometry));
            });
          });
        }
      } catch { /* invalid geojson — skip silently */ }
    });
  }, [zones, selectedZoneId, editZoneId, onZoneClick, onZoneGeometryChanged]);

  // ── Re-render client home markers when clients change ────────────────────────
  useEffect(() => {
    const layer = clientsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    clients.forEach(c => {
      const color = c.status === 'Activo' ? '#3b82f6'
                  : c.status === 'Suspendido' ? '#f59e0b' : '#94a3b8';
      const marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:14px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">🏠</div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      });
      marker.bindTooltip(
        `<b>${c.fullName}</b><br/>${c.tbnCode} · <span style="color:${color}">${c.status}</span>` +
        (c.boxCodigo ? `<br/>Caja: ${c.boxCodigo}` : '<br/><i>Sin caja asignada</i>'),
        { direction: 'top', offset: [0, -6] },
      );
      layer.addLayer(marker);
    });
  }, [clients]);

  // ── Re-render box markers (+ radio de alcance, F7) ───────────────────────────
  useEffect(() => {
    const layer = boxesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    boxes.forEach(box => {
      const available = box.puertosLibres > 0 && box.estado === 'Activo';

      // Radio de alcance del drop (modelo de viabilidad OZmap): muestra los
      // huecos de cobertura dentro de la zona.
      if (box.distanciaMaxCableMetros) {
        layer.addLayer(L.circle([box.lat, box.lng], {
          radius:      box.distanciaMaxCableMetros,
          color:       available ? '#22c55e' : '#ef4444',
          weight:      1,
          dashArray:   '4 4',
          fillOpacity: 0.05,
          interactive: false,
        }));
      }

      const editable = box.zoneId === editZoneId && !!onBoxMoved;
      const marker = L.marker([box.lat, box.lng], {
        icon:      available ? iconAvailable : iconFull,
        title:     `${box.codigo} — ${box.puertosLibres} libre(s)`,
        draggable: editable,
      });
      marker.on('click', () => onBoxClick(box.id));
      if (editable) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onBoxMoved!(box.id, pos.lat, pos.lng);
        });
      }
      layer.addLayer(marker);
    });
  }, [boxes, editZoneId, onBoxClick, onBoxMoved]);

  return (
    <div
      ref={containerRef}
      data-testid="coverage-map"
      style={{ width: '100%', height: '100%', minHeight: '400px', isolation: 'isolate', zIndex: 0 }}
    />
  );
}
