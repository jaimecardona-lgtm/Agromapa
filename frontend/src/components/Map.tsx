import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { GeoUnit } from '@/services/api';
import L from 'leaflet';
import './Map.css';

interface MapProps {
  features: GeoUnit[];
  onFeatureClick: (feature: GeoUnit) => void;
}

export function Map({ features, onFeatureClick }: MapProps) {
  const colombiaCenter: [number, number] = [4.5, -74.5];
  const defaultZoom = 6;

  const handleEachFeature = (feature: GeoUnit, layer: L.Layer) => {
    const popupContent = `
      <div class="popup-content">
        <h4>${feature.name}</h4>
        <p>Código: ${feature.dane_code}</p>
        <p>Nivel: ${feature.level}</p>
      </div>
    `;

    if (layer instanceof L.Popup || 'bindPopup' in layer) {
      (layer as L.Layer & { bindPopup: (html: string) => void }).bindPopup(popupContent);
    }

    layer.on('click', () => {
      onFeatureClick(feature);
    });
  };

  return (
    <div className="map-container">
      <MapContainer center={colombiaCenter} zoom={defaultZoom} className="map">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />

        {features.map((feature) => (
          <GeoJSON
            key={`${feature.level}-${feature.dane_code}`}
            data={feature.geojson as GeoJSON.GeoJsonObject}
            onEachFeature={(_, layer) => handleEachFeature(feature, layer)}
            style={() => ({
              color: '#667eea',
              fillColor: '#667eea',
              fillOpacity: 0.5,
              weight: 2,
            })}
          />
        ))}
      </MapContainer>
    </div>
  );
}
