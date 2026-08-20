import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Crosshair, PencilRuler, Save } from 'lucide-react';
import { coverageService } from '@/services/coverageService';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/apiError';
import ZonePanel from '@/components/coverage/ZonePanel';
import BoxPanel  from '@/components/coverage/BoxPanel';
import ZoneFormModal from '@/components/coverage/ZoneFormModal';
import BoxFormModal  from '@/components/coverage/BoxFormModal';
import BoxPortsModal from '@/components/coverage/BoxPortsModal';
import MapSearchControl from '@/components/coverage/MapSearchControl';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED }
  from '@/components/shared/ConfirmDialog';
import type {
  CoverageZone, DistributionBox, ClientLocation, CoverageCheckResponse,
  CreateCoverageZoneRequest, UpdateCoverageZoneRequest,
  CreateDistributionBoxRequest, UpdateDistributionBoxRequest,
} from '@/types/coverage';

const CoverageMap = lazy(() => import('@/components/coverage/CoverageMap'));

type ActiveModal = 'zone' | 'box' | null;

/** Popup de serviciabilidad (F7): resultado del check para un punto exacto. */
function buildCheckPopupHtml(r: CoverageCheckResponse): string {
  if (r.outcome === 'CONFIRMED') {
    const caja = r.recommendedBoxCodigo
      ? `<br/>Caja <b>${r.recommendedBoxCodigo}</b>` +
        (r.nearestBoxDistanceMeters != null
          ? ` a ${Math.round(r.nearestBoxDistanceMeters)} m` : '') +
        (r.recommendedBoxPuertosLibres != null
          ? ` · ${r.recommendedBoxPuertosLibres} puerto(s) libre(s)` : '')
      : '';
    return `<b style="color:#16a34a">✅ Con cobertura</b><br/>` +
           `Zona: ${r.zoneName ?? '—'} (${r.zoneTechnology ?? '—'})${caja}`;
  }
  if (r.outcome === 'NOCOVERAGE') {
    return `<b style="color:#dc2626">❌ Sin cobertura</b><br/>` +
           `El punto está fuera de todas las zonas dibujadas.`;
  }
  return `<b style="color:#d97706">⚠ Requiere revisión</b><br/>` +
         `${r.zoneName ? `Zona: ${r.zoneName}<br/>` : ''}` +
         `Motivo: ${r.escalationReason ?? 'sin capacidad o zona en expansión'}`;
}

export default function CoverageMapPage() {
  usePageTitle('Cobertura');
  const isAdmin = useAuthStore(s => s.isAdmin)();
  const [searchParams] = useSearchParams();

  const [zones,           setZones]           = useState<CoverageZone[]>([]);
  const [boxes,           setBoxes]           = useState<DistributionBox[]>([]);
  const [clients,         setClients]         = useState<ClientLocation[]>([]);
  const [showClients,     setShowClients]     = useState(true);
  const [selectedZoneId,  setSelectedZoneId]  = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');

  const [drawPolygon, setDrawPolygon] = useState(false);
  const [placePin,    setPlacePin]    = useState(false);

  const [pendingGeoJson, setPendingGeoJson] = useState<string | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [activeModal,  setActiveModal]  = useState<ActiveModal>(null);
  const [editingZone,  setEditingZone]  = useState<CoverageZone | null>(null);
  const [editingBox,   setEditingBox]   = useState<DistributionBox | null>(null);
  const [portsBox,     setPortsBox]     = useState<DistributionBox | null>(null);
  const [modalSaving,  setModalSaving]  = useState(false);
  const [confirm,      setConfirm]      = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);

  // ── F7: buscador, verificación de punto y edición de geometría ────────────
  const [focusPoint,  setFocusPoint]  = useState<{ lat: number; lng: number } | null>(null);
  const [checkMode,   setCheckMode]   = useState(false);
  const [checkMarker, setCheckMarker] = useState<{ lat: number; lng: number; popupHtml: string } | null>(null);
  const [editGeometry, setEditGeometry] = useState(false);
  const [savingGeometry, setSavingGeometry] = useState(false);
  const pendingGeometryRef = useRef<{ zoneId: string; geojson: string } | null>(null);


  const loadZones = useCallback(async (withGeometry = false) => {
    const data = await coverageService.getZones(withGeometry);
    setZones(data);
  }, []);

  const loadBoxes = useCallback(async (zoneId: string) => {
    const data = await coverageService.getBoxesByZone(zoneId);
    setBoxes(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadZones(true)
      .catch(e => setError(extractApiError(e, 'Error cargando zonas.')))
      .finally(() => setLoading(false));
    coverageService.getClientLocations()
      .then(setClients)
      .catch(() => {});
  }, [loadZones]);

  useEffect(() => {
    if (!selectedZoneId) { setBoxes([]); return; }
    loadBoxes(selectedZoneId).catch(() => {});
  }, [selectedZoneId, loadBoxes]);


  const handleZoneClick = useCallback((zoneId: string) => {
    setSelectedZoneId(id => id === zoneId ? null : zoneId);
  }, []);

  const handleBoxClick = useCallback((boxId: string) => {
    if (!isAdmin) return;
    const box = boxes.find(b => b.id === boxId);
    if (box) { setEditingBox(box); setActiveModal('box'); }
  }, [boxes, isAdmin]);

  const handlePolygonDrawn = useCallback((geojson: string) => {
    setDrawPolygon(false);
    setPendingGeoJson(geojson);
    setEditingZone(null);
    setActiveModal('zone');
  }, []);

  const handlePointPlaced = useCallback((lat: number, lng: number) => {
    setPlacePin(false);
    setPendingLocation({ lat, lng });
    setEditingBox(null);
    setActiveModal('box');
  }, []);


  const handleNewZone = () => {
    setEditingZone(null);
    setPendingGeoJson(null);
    setDrawPolygon(true);
  };

  const handleNewBox = () => {
    if (!selectedZoneId) return;
    setEditingBox(null);
    setPendingLocation(null);
    setPlacePin(true);
  };


  const handleZoneSave = async (data: CreateCoverageZoneRequest | UpdateCoverageZoneRequest) => {
    setModalSaving(true);
    try {
      if (editingZone) {
        await coverageService.updateZone(editingZone.id, data as UpdateCoverageZoneRequest);
      } else {
        await coverageService.createZone(data as CreateCoverageZoneRequest);
      }
      await loadZones(true);
      setActiveModal(null);
      setPendingGeoJson(null);
    } catch (e) {
      alert(extractApiError(e, 'Error guardando zona.'));
    } finally {
      setModalSaving(false);
    }
  };

  const handleEditZone = (zone: CoverageZone) => {
    setEditingZone(zone);
    setPendingGeoJson(null);
    setActiveModal('zone');
  };

  const handleDeleteZone = (zone: CoverageZone) => {
    setConfirm({
      open: true,
      title: `Eliminar zona "${zone.nombre}"`,
      message: 'La zona pasará a estado Inactiva. Esta acción no se puede deshacer si tiene cajas activas.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await coverageService.deleteZone(zone.id);
          await loadZones(true);
          if (selectedZoneId === zone.id) setSelectedZoneId(null);
        } catch (e) {
          alert(extractApiError(e, 'Error eliminando zona.'));
        } finally {
          setConfirmRunning(false);
          setConfirm(CONFIRM_CLOSED);
        }
      },
    });
  };


  const handleBoxSave = async (data: CreateDistributionBoxRequest | UpdateDistributionBoxRequest) => {
    setModalSaving(true);
    try {
      if (editingBox) {
        await coverageService.updateBox(editingBox.id, data as UpdateDistributionBoxRequest);
      } else {
        await coverageService.createBox(data as CreateDistributionBoxRequest);
      }
      if (selectedZoneId) await loadBoxes(selectedZoneId);
      await loadZones(true);
      setActiveModal(null);
      setPendingLocation(null);
    } catch (e) {
      alert(extractApiError(e, 'Error guardando caja.'));
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteBox = (box: DistributionBox) => {
    setConfirm({
      open: true,
      title: `Eliminar caja "${box.codigo}"`,
      message: 'La caja pasará a estado Mantenimiento. Asegúrate de que no tenga puertos reservados.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await coverageService.deleteBox(box.id);
          if (selectedZoneId) await loadBoxes(selectedZoneId);
          await loadZones(true);
        } catch (e) {
          alert(extractApiError(e, 'Error eliminando caja.'));
        } finally {
          setConfirmRunning(false);
          setConfirm(CONFIRM_CLOSED);
        }
      },
    });
  };

  const handleModalClose = () => {
    setActiveModal(null);
    setEditingZone(null);
    setEditingBox(null);
    setPendingGeoJson(null);
    setPendingLocation(null);
    setDrawPolygon(false);
    setPlacePin(false);
  };

  // ── F7: serviciabilidad con clic ──────────────────────────────────────────
  const handleCheckPoint = useCallback(async (lat: number, lng: number) => {
    try {
      const result = await coverageService.checkCoverage(lat, lng);
      setCheckMarker({ lat, lng, popupHtml: buildCheckPopupHtml(result) });
    } catch {
      setCheckMarker({ lat, lng, popupHtml: 'No se pudo verificar el punto. Intenta de nuevo.' });
    }
  }, []);

  const toggleCheckMode = () => {
    setCheckMode(m => !m);
    setCheckMarker(null);
  };

  // Llegada desde un link externo (ej. "Ver en Cobertura" del detalle de un
  // ticket) con ?lat=..&lng=.. — centra el mapa ahí y verifica el punto para
  // mostrar de una vez si cae en zona activa y con qué caja NAP.
  useEffect(() => {
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    if (!latStr || !lngStr) return;
    const lat = Number(latStr), lng = Number(lngStr);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setFocusPoint({ lat, lng });
    handleCheckPoint(lat, lng);
    // Solo al montar: es una acción de "llegué con un punto", no algo que deba
    // repetirse si el usuario navega el mapa después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── F7: edición de geometría de la zona seleccionada ─────────────────────
  const handleZoneGeometryChanged = useCallback((zoneId: string, geojson: string) => {
    pendingGeometryRef.current = { zoneId, geojson };
  }, []);

  const handleBoxMoved = useCallback(async (boxId: string, lat: number, lng: number) => {
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    try {
      await coverageService.updateBox(boxId, {
        codigo:                  box.codigo,
        direccionReferencia:     box.direccionReferencia,
        puertosTotal:            box.puertosTotal,
        puertosOcupados:         box.puertosOcupados,
        distanciaMaxCableMetros: box.distanciaMaxCableMetros,
        estado:                  box.estado,
        lat, lng,
      });
      if (selectedZoneId) await loadBoxes(selectedZoneId);
    } catch (e) {
      alert(extractApiError(e, 'Error reubicando la caja.'));
    }
  }, [boxes, selectedZoneId, loadBoxes]);

  const toggleEditGeometry = async () => {
    if (!editGeometry) {
      pendingGeometryRef.current = null;
      setEditGeometry(true);
      return;
    }
    // Al salir del modo edición se guarda la geometría pendiente (si cambió)
    const pending = pendingGeometryRef.current;
    const zone    = pending ? zones.find(z => z.id === pending.zoneId) : null;
    setEditGeometry(false);
    if (!pending || !zone) return;

    setSavingGeometry(true);
    try {
      await coverageService.updateZone(zone.id, {
        nombre:                 zone.nombre,
        tecnologia:             zone.tecnologia,
        velocidadMaxMbps:       zone.velocidadMaxMbps,
        estado:                 zone.estado,
        fechaExpansionEstimada: zone.fechaExpansionEstimada,
        geoJson:                pending.geojson,
      });
      pendingGeometryRef.current = null;
      await loadZones(true);
    } catch (e) {
      alert(extractApiError(e, 'Error guardando la geometría.'));
    } finally {
      setSavingGeometry(false);
    }
  };


  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 m-6 bg-red-50 border border-red-200 rounded-lg p-4">
      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
      <p className="text-sm text-red-700">{error}</p>
    </div>
  );

  const selectedZone = zones.find(z => z.id === selectedZoneId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">

      {}
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <ZonePanel
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onNewZone={handleNewZone}
            isAdmin={isAdmin}
          />
        </div>

        {selectedZone && (
          <div className="border-t border-gray-200 overflow-y-auto max-h-96">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {selectedZone.nombre}
              </p>
              {isAdmin && (
                <div className="flex gap-1">
                  <button onClick={() => handleEditZone(selectedZone)}
                    className="text-xs text-blue-600 hover:underline">Editar</button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => handleDeleteZone(selectedZone)}
                    className="text-xs text-red-500 hover:underline">Eliminar</button>
                </div>
              )}
            </div>
            <BoxPanel
              boxes={boxes}
              onNewBox={handleNewBox}
              onEdit={box => { setEditingBox(box); setActiveModal('box'); }}
              onDelete={handleDeleteBox}
              onViewPorts={setPortsBox}
              isAdmin={isAdmin}
            />
          </div>
        )}

        <div className="border-t border-gray-200 px-4 py-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showClients}
              onChange={e => setShowClients(e.target.checked)}
              className="rounded"
            />
            🏠 Ver clientes en el mapa ({clients.length})
          </label>
        </div>

        {(drawPolygon || placePin) && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {drawPolygon
              ? '✏️ Dibuja el polígono de la zona en el mapa'
              : '📍 Haz clic en el mapa para colocar la caja'}
            <button
              onClick={() => { setDrawPolygon(false); setPlacePin(false); }}
              className="ml-2 underline hover:no-underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </aside>

      {}
      <main className="flex-1 overflow-hidden relative">
        <MapSearchControl onSelect={(lat, lng) => setFocusPoint({ lat, lng })} />

        {}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <button
            onClick={toggleCheckMode}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-md text-xs font-medium border ${
              checkMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
            title="Verificar cobertura de un punto exacto con clic"
          >
            <Crosshair className="w-4 h-4" />
            {checkMode ? 'Clic en el mapa…' : 'Verificar punto'}
          </button>

          {selectedZone && isAdmin && (
            <button
              onClick={toggleEditGeometry}
              disabled={savingGeometry}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-md text-xs font-medium border disabled:opacity-50 ${
                editGeometry
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
              title="Arrastra vértices de la zona y pines de cajas; al terminar, guarda"
            >
              {savingGeometry
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : editGeometry ? <Save className="w-4 h-4" /> : <PencilRuler className="w-4 h-4" />}
              {editGeometry ? 'Guardar geometría' : 'Editar geometría'}
            </button>
          )}
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        }>
          <CoverageMap
            zones={zones}
            boxes={boxes}
            clients={showClients ? clients : []}
            selectedZoneId={selectedZoneId ?? undefined}
            drawPolygon={drawPolygon}
            placePin={placePin}
            focusPoint={focusPoint}
            checkMode={checkMode}
            checkMarker={checkMarker}
            editZoneId={editGeometry ? selectedZoneId : null}
            onZoneClick={handleZoneClick}
            onBoxClick={handleBoxClick}
            onPolygonDrawn={handlePolygonDrawn}
            onPointPlaced={handlePointPlaced}
            onCheckPoint={handleCheckPoint}
            onZoneGeometryChanged={handleZoneGeometryChanged}
            onBoxMoved={handleBoxMoved}
          />
        </Suspense>
      </main>

      {}
      <ZoneFormModal
        open={activeModal === 'zone'}
        zone={editingZone}
        initialGeoJson={pendingGeoJson}
        saving={modalSaving}
        onSave={handleZoneSave}
        onClose={handleModalClose}
      />

      <BoxFormModal
        open={activeModal === 'box'}
        box={editingBox}
        zones={zones}
        preselectedZoneId={selectedZoneId ?? undefined}
        pendingLat={pendingLocation?.lat}
        pendingLng={pendingLocation?.lng}
        saving={modalSaving}
        onSave={handleBoxSave}
        onClose={handleModalClose}
      />

      {portsBox && (
        <BoxPortsModal
          box={portsBox}
          onChanged={() => { if (selectedZoneId) loadBoxes(selectedZoneId); }}
          onClose={() => setPortsBox(null)}
        />
      )}

      <ConfirmDialog
        state={confirm}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
        running={confirmRunning}
      />
    </div>
  );
}
