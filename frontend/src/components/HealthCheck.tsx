import { HealthStatus } from '@/types/health';
import './HealthCheck.css';

interface HealthCheckProps {
  health: HealthStatus;
}

export function HealthCheck({ health }: HealthCheckProps) {
  const statusColor = {
    ok: '#28a745',
    degraded: '#ffc107',
    error: '#dc3545',
  };

  const timestamp = new Date(health.timestamp).toLocaleString();

  return (
    <div className="health-check">
      <div className="health-status" style={{ borderLeftColor: statusColor[health.status] }}>
        <div className="status-indicator" style={{ backgroundColor: statusColor[health.status] }}></div>
        <div className="status-info">
          <h3>Estado: <strong>{health.status.toUpperCase()}</strong></h3>
          <p>Entorno: <code>{health.environment}</code></p>
          <p>Versión: <code>{health.version}</code></p>
          <p className="timestamp">Verificado: {timestamp}</p>
        </div>
      </div>

      {health.database && (
        <div className="database-status">
          <h4>Base de Datos</h4>
          <p>
            Estado: <strong>{health.database.status}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
