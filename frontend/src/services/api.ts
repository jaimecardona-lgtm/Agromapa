import axios from 'axios';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface HealthStatus {
  status: string;
  service: string;
  environment: string;
  version: string;
  database: {
    status: string;
  };
}

export interface MapPoint {
  id: string;
  municipality: string;
  latitude: number;
  longitude: number;
  crop: string;
  available_kg: number;
  demo: boolean;
}

export const api = {
  health: {
    check: () => apiClient.get<HealthStatus>('/api/health'),
  },
  demo: {
    getMapPoints: () => apiClient.get<MapPoint[]>('/api/demo/map-points'),
  },
};
