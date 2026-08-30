import { useEffect, useState } from 'react';
import { HealthStatus } from '@/types/health';
import { HealthCheck } from '@/components/HealthCheck';
import './App.css';

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(`${apiBase}/api/health`);
        const data = await response.json();
        setHealth(data);
      } catch (error) {
        console.error('Failed to check health:', error);
        setHealth({
          status: 'error',
          environment: 'unknown',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AgroMapa Colombia</h1>
        <p>Plataforma de Mapeo Digital Agroproductivo</p>
      </header>

      <main className="app-main">
        <section className="status-section">
          <h2>Estado del Sistema</h2>
          {loading ? (
            <p className="loading">Verificando estado...</p>
          ) : health ? (
            <HealthCheck health={health} />
          ) : (
            <p className="error">No se pudo conectar con el servidor</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
