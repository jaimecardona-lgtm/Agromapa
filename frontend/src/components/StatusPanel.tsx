import { HealthStatus } from '@/services/api';
import './StatusPanel.css';

interface StatusPanelProps {
  health: HealthStatus | null;
  loading: boolean;
}

export function StatusPanel({ health, loading }: StatusPanelProps) {
  const getStatusColor = (status: string) => {
    if (status === 'connected' || status === 'ok') return '#28a745';
    if (status === 'not_configured' || status === 'degraded') return '#ffc107';
    return '#dc3545';
  };

  if (loading) {
    return <div className="status-panel loading">Verificando estado...</div>;
  }

  if (!health) {
    return <div className="status-panel error">No se pudo conectar con el servidor</div>;
  }

  return (
    <div className="status-panel">
      <div className="status-grid">
        <div className="status-item">
          <div className="status-label">Frontend</div>
          <div className="status-value" style={{ color: '#28a745' }}>
            ✓ Operativo
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">FastAPI Backend</div>
          <div className="status-value" style={{ color: getStatusColor(health.status) }}>
            {health.status === 'ok' ? '✓' : '✗'} {health.status.toUpperCase()}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Base de Datos</div>
          <div className="status-value" style={{ color: getStatusColor(health.database.status) }}>
            {health.database.status === 'connected' ? '✓' : '○'} {health.database.status}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">PostGIS</div>
          <div className="status-value" style={{ color: '#0066cc' }}>
            ✓ Preparado
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">pgvector</div>
          <div className="status-value" style={{ color: '#0066cc' }}>
            ✓ Preparado
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Versión API</div>
          <div className="status-value">{health.version}</div>
        </div>
      </div>
    </div>
  );
}
