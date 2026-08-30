export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  environment: string;
  version: string;
  timestamp: string;
  database?: {
    status: 'connected' | 'disconnected';
  };
}
