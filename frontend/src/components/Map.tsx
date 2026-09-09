import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject, FeatureCollection } from 'geojson';
import { GeoUnit, AgriculturalData, Farm, AgriculturalCrop } from '@/services/api';
import './Map.css';

export interface MapProps {
  territorialFeatures: GeoUnit[];
  selectedMunicipality?: GeoUnit | null;
  agriculturalData?: AgriculturalData | null;
  farms?: Farm[];
  onFeatureClick: (feature: GeoUnit) => void;
  geometryPending?: boolean;
}

export interface GroupedCrop {
  crop_name: string;
  crop_code?: string;
  crop_group?: string;
  total_planted_ha: number;
  total_harvested_ha: number;
  total_production_tons: number;
  records: AgriculturalCrop[];
}

export function getCropEmoji(cropName: string): string {
  const lower = cropName.toLowerCase();
  if (lower.includes('café') || lower.includes('cafe')) return '☕';
  if (lower.includes('maíz') || lower.includes('maiz')) return '🌽';
  if (lower.includes('plátano') || lower.includes('platano') || lower.includes('banano')) return '🍌';
  if (lower.includes('arroz')) return '🌾';
  if (lower.includes('caña') || lower.includes('cana')) return '🎋';
  if (lower.includes('palma')) return '🌴';
  if (lower.includes('papa')) return '🥔';
  if (lower.includes('cacao')) return '🍫';
  if (lower.includes('aguacate')) return '🥑';
  if (lower.includes('yuca')) return '🍠';
  if (lower.includes('frijol') || lower.includes('fríjol')) return '🫘';
  if (
    lower.includes('cítric') ||
    lower.includes('citric') ||
    lower.includes('naranja') ||
    lower.includes('limón') ||
    lower.includes('limon')
  )
    return '🍊';
  if (lower.includes('mango')) return '🥭';
  if (lower.includes('piña') || lower.includes('pina')) return '🍍';
  if (lower.includes('tomate')) return '🍅';
  if (lower.includes('cebolla')) return '🧅';
  return '🌱';
}

export function groupCrops(crops: AgriculturalCrop[]): GroupedCrop[] {
  const cropMap: Record<string, GroupedCrop> = {};
  for (const c of crops) {
    const key = c.crop_name.trim().toLowerCase();
    const existing = cropMap[key];
    const planted = c.area_planted_ha || 0;
    const harvested = c.area_harvested_ha || 0;
    const production = c.production_tons || 0;

    if (existing) {
      existing.total_planted_ha += planted;
      existing.total_harvested_ha += harvested;
      existing.total_production_tons += production;
      existing.records.push(c);
    } else {
      cropMap[key] = {
        crop_name: c.crop_name,
        crop_code: c.crop_code,
        crop_group: c.crop_group,
        total_planted_ha: planted,
        total_harvested_ha: harvested,
        total_production_tons: production,
        records: [c],
      };
    }
  }

  return Object.values(cropMap).sort((a, b) => {
    if (b.total_planted_ha !== a.total_planted_ha) {
      return b.total_planted_ha - a.total_planted_ha;
    }
    return b.total_production_tons - a.total_production_tons;
  });
}

function MapController({
  features,
  selectedMunicipality,
  geometryPending,
}: {
  features: GeoUnit[];
  selectedMunicipality?: GeoUnit | null;
  geometryPending?: boolean;
}) {
  const map = useMap();
  const lastTargetRef = useRef<string>('');

  // ResizeObserver for reliable, fluid map resizing without relying on setTimeout
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);
    map.invalidateSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);

  // FitBounds management
  useEffect(() => {
    // 1. If municipality selected with real geometry
    if (selectedMunicipality?.geojson) {
      const targetKey = `mun-${selectedMunicipality.dane_code}`;
      if (lastTargetRef.current !== targetKey) {
        try {
          const layer = L.geoJSON(selectedMunicipality.geojson as GeoJsonObject);
          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, animate: true });
            lastTargetRef.current = targetKey;
          }
        } catch (err) {
          console.error('Error fitting bounds to municipality:', err);
        }
      }
      return;
    }

    // 2. If geometry is pending (DANE 27493), retain current bounds
    if (geometryPending) {
      return;
    }

    // 3. Otherwise fit to territorial features
    if (features && features.length > 0) {
      const featuresWithGeom = features.filter((f) => f.geojson);
      if (featuresWithGeom.length === 0) return;

      const targetKey = `features-${features[0].level}-${features.length}-${features[0].dane_code}`;
      if (lastTargetRef.current !== targetKey) {
        try {
          const featureGroup: GeoJsonObject[] = featuresWithGeom.map(
            (f) => f.geojson as GeoJsonObject,
          );
          const layer = L.geoJSON({
            type: 'FeatureCollection',
            features: featureGroup.map((g) => ({
              type: 'Feature',
              geometry: g,
              properties: {},
            })),
          } as FeatureCollection);

          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [20, 20], animate: true });
            lastTargetRef.current = targetKey;
          }
        } catch (err) {
          console.error('Error fitting bounds to territorial features:', err);
        }
      }
    }
  }, [map, features, selectedMunicipality, geometryPending]);

  return null;
}

export function Map({
  territorialFeatures,
  selectedMunicipality,
  agriculturalData,
  farms = [],
  onFeatureClick,
  geometryPending = false,
}: MapProps) {
  const colombiaCenter: [number, number] = [4.5, -74.5];
  const defaultZoom = 6;

  // Prepare grouped crops for summary marker
  const groupedCrops = useMemo(() => {
    if (!agriculturalData?.crops) return [];
    return groupCrops(agriculturalData.crops);
  }, [agriculturalData]);

  // Extract centroid coordinates for municipal agricultural marker
  const centroidCoords: [number, number] | null = useMemo(() => {
    if (!selectedMunicipality?.centroid_geojson) return null;
    try {
      const coords = selectedMunicipality.centroid_geojson.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        return [coords[1], coords[0]]; // [lat, lng]
      }
    } catch {
      // ignore
    }
    return null;
  }, [selectedMunicipality]);

  // Agricultural summary icon
  const agSummaryIcon = useMemo(() => {
    if (!agriculturalData) return null;
    const top3 = groupedCrops.slice(0, 3);
    const icons = top3.map((c) => getCropEmoji(c.crop_name)).join(' ');
    const count = groupedCrops.length;

    const html = `
      <div class="ag-summary-marker">
        <div class="ag-summary-icons">${icons || '🌱'}</div>
        <div class="ag-summary-label">
          <span class="ag-summary-count">${count} cultivos</span>
          <span class="ag-summary-badge">EVA 2024</span>
        </div>
        <div class="ag-summary-sub">Agregado municipal</div>
      </div>
    `;

    return L.divIcon({
      className: 'ag-summary-div-wrapper',
      html,
      iconSize: [130, 52],
      iconAnchor: [65, 26],
    });
  }, [agriculturalData, groupedCrops]);

  // Farm marker icon
  const farmIcon = useMemo(
    () =>
      L.divIcon({
        className: 'farm-marker-wrapper',
        html: `<div class="farm-pin" title="Finca registrada">🏡</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    [],
  );

  const handleEachFeature = (feature: GeoUnit, layer: L.Layer) => {
    const isSelected = selectedMunicipality?.dane_code === feature.dane_code;
    const popupHtml = `
      <div class="popup-content">
        <h4>${feature.name}</h4>
        <p><strong>DANE:</strong> ${feature.dane_code}</p>
        <p><strong>Nivel:</strong> ${feature.level === 'department' ? 'Departamento' : 'Municipio'}</p>
        ${feature.parent_name ? `<p><strong>Depto:</strong> ${feature.parent_name}</p>` : ''}
      </div>
    `;

    if ('bindPopup' in layer) {
      (layer as L.Layer & { bindPopup: (html: string) => void }).bindPopup(popupHtml);
    }

    layer.on('click', () => {
      onFeatureClick(feature);
    });

    if (layer instanceof L.Path) {
      layer.setStyle({
        color: isSelected ? '#15803d' : '#4f46e5',
        fillColor: isSelected ? '#22c55e' : '#6366f1',
        fillOpacity: isSelected ? 0.45 : 0.25,
        weight: isSelected ? 3 : 1.5,
      });
    }
  };

  return (
    <div className="map-container">
      {geometryPending && (
        <div className="geometry-pending-overlay">
          <span className="badge-icon">⚠️</span>
          <span>Geometría oficial pendiente de integración (DANE {selectedMunicipality?.dane_code})</span>
        </div>
      )}

      <MapContainer center={colombiaCenter} zoom={defaultZoom} className="map" zoomControl={true}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapController
          features={territorialFeatures}
          selectedMunicipality={selectedMunicipality}
          geometryPending={geometryPending}
        />

        {/* ============================================================ */}
        {/* CAPA A: TERRITORIO                                           */}
        {/* ============================================================ */}
        {territorialFeatures.map((feature) => {
          if (!feature.geojson) return null;
          const isSelected = selectedMunicipality?.dane_code === feature.dane_code;
          return (
            <GeoJSON
              key={`${feature.level}-${feature.dane_code}-${isSelected ? 'sel' : 'norm'}`}
              data={feature.geojson}
              onEachFeature={(_, layer) => handleEachFeature(feature, layer)}
              style={() => ({
                color: isSelected ? '#15803d' : '#4f46e5',
                fillColor: isSelected ? '#22c55e' : '#6366f1',
                fillOpacity: isSelected ? 0.45 : 0.25,
                weight: isSelected ? 3 : 1.5,
              })}
            />
          );
        })}

        {/* Selected municipality polygon layer if not already in territorialFeatures */}
        {selectedMunicipality?.geojson &&
          !territorialFeatures.some((f) => f.dane_code === selectedMunicipality.dane_code) && (
            <GeoJSON
              key={`selected-mun-${selectedMunicipality.dane_code}`}
              data={selectedMunicipality.geojson}
              onEachFeature={(_, layer) => handleEachFeature(selectedMunicipality, layer)}
              style={() => ({
                color: '#15803d',
                fillColor: '#22c55e',
                fillOpacity: 0.45,
                weight: 3,
              })}
            />
          )}

        {/* ============================================================ */}
        {/* CAPA B: RESUMEN AGRÍCOLA MUNICIPAL (EVA 2024 SOBRE CENTROID)  */}
        {/* ============================================================ */}
        {selectedMunicipality && agriculturalData && centroidCoords && agSummaryIcon && (
          <Marker position={centroidCoords} icon={agSummaryIcon}>
            <Popup className="ag-summary-popup">
              <div className="ag-popup-body">
                <div className="ag-popup-header">
                  <h4>Resumen agrícola municipal — EVA 2024</h4>
                  <p className="ag-popup-mun">
                    {agriculturalData.municipality.name} (DANE {agriculturalData.municipality.dane_code})
                  </p>
                </div>
                <div className="ag-popup-stats">
                  <div className="stat-pill">
                    <span className="label">Área sembrada:</span>
                    <span className="value">
                      {(agriculturalData.total_area_planted_ha || 0).toLocaleString()} ha
                    </span>
                  </div>
                  <div className="stat-pill">
                    <span className="label">Producción:</span>
                    <span className="value">
                      {(agriculturalData.total_production_tons || 0).toLocaleString()} t
                    </span>
                  </div>
                </div>
                {groupedCrops.length > 0 && (
                  <div className="ag-popup-top-crops">
                    <h5>Top Cultivos ({Math.min(groupedCrops.length, 5)}):</h5>
                    <ul>
                      {groupedCrops.slice(0, 5).map((crop) => (
                        <li key={crop.crop_name}>
                          <span className="crop-icon">{getCropEmoji(crop.crop_name)}</span>
                          <strong>{crop.crop_name}</strong>: {crop.total_planted_ha.toLocaleString()} ha |{' '}
                          {crop.total_production_tons.toLocaleString()} t
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="ag-popup-disclaimer">
                  Agregado estadístico municipal oficial EVA 2024. No representa ubicación predial individual.
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* ============================================================ */}
        {/* CAPA C: FINCAS REGISTRADAS EN AGROMAPA                       */}
        {/* ============================================================ */}
        {farms &&
          farms.length > 0 &&
          farms.map((farm) => {
            if (!farm.latitude || !farm.longitude) return null;
            return (
              <Marker key={farm.id} position={[farm.latitude, farm.longitude]} icon={farmIcon}>
                <Popup>
                  <div className="farm-popup-content">
                    <h4>🏡 {farm.name}</h4>
                    {farm.producer_name && <p><strong>Productor:</strong> {farm.producer_name}</p>}
                    {farm.description && <p>{farm.description}</p>}
                    <p className="farm-source-badge">Finca registrada en AgroMapa</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
