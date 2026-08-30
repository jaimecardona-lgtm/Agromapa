import { useEffect, useState } from 'react';
import { api, HealthStatus, MapPoint } from '@/services/api';
import { Map } from '@/components/Map';
import { StatusPanel } from '@/components/StatusPanel';
import { RoadmapCard } from '@/components/RoadmapCard';
import './App.css';

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, mapRes] = await Promise.all([
          api.health.check(),
          api.demo.getMapPoints(),
        ]);

        setHealth(healthRes.data);
        setMapPoints(mapRes.data);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('No se pudo conectar con el servidor');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🗺️ AgroMapa Colombia</h1>
          <p>Plataforma geoespacial agroproductiva para conectar territorio, productores y demanda</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <section className="section">
            <h2>Visor Geoespacial Piloto</h2>
            <p className="section-description">Puntos demostrativos del Valle del Cauca</p>
            {error ? (
              <div className="error-box">{error}</div>
            ) : (
              <Map points={mapPoints} />
            )}
          </section>

          <section className="section">
            <h2>Estado del Sistema</h2>
            <StatusPanel health={health} loading={loading} />
          </section>

          <section className="section">
            <RoadmapCard />
          </section>

          <section className="section info-box">
            <h3>ℹ️ Información</h3>
            <p>
              Esta es una demostración del Sprint 01 de AgroMapa Colombia. Los datos mostrados en el mapa
              son puramente demostrativos y están marcados como <strong>demo: true</strong>.
            </p>
            <p>
              El sistema está preparado con PostGIS para operaciones geoespaciales y pgvector para
              búsqueda semántica e integración futura de IA.
            </p>
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <p>AgroMapa Colombia © 2026 - Sprint 01: Foundation</p>
      </footer>
    </div>
  );
}

export default App;
