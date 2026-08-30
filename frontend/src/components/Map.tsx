import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapPoint } from '@/services/api';
import './Map.css';

const iconRetinaUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png';
const iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png';
const shadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.setIcon(iconDefault);

interface MapProps {
  points: MapPoint[];
}

export function Map({ points }: MapProps) {
  const mapCenter: [number, number] = [4.0, -76.0];
  const zoom = 8;

  return (
    <div className="map-container">
      <MapContainer center={mapCenter} zoom={zoom} className="map">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {points.map((point) => (
          <Marker key={point.id} position={[point.latitude, point.longitude]}>
            <Popup>
              <div className="popup-content">
                <h4>{point.municipality}</h4>
                <p>
                  <strong>Cultivo:</strong> {point.crop}
                </p>
                <p>
                  <strong>Disponible:</strong> {point.available_kg} kg
                </p>
                <span className="demo-badge">Datos demostrativos</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
