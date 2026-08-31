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

export interface GeoUnit {
  id: string;
  level: string;
  dane_code: string;
  name: string;
  geojson: GeoJSON;
  centroid_geojson: GeoJSON;
  parent_id?: string;
  parent_name?: string;
}

export interface GeoJSON {
  type: string;
  coordinates: number[] | number[][] | number[][][];
}

export interface AgriculturalStat {
  crop_name: string;
  crop_group?: string;
  area_planted_ha?: number;
  area_harvested_ha?: number;
  production_tons?: number;
  yield_t_ha?: number;
}

export interface AgriculturalData {
  municipality: {
    dane_code: string;
    name: string;
  };
  year: number;
  source: {
    id: string;
    name: string;
  };
  crops: AgriculturalStat[];
  total_area_planted_ha?: number;
  total_production_tons?: number;
}

export interface Farm {
  id: string;
  name: string;
  municipality_name: string;
  latitude: number;
  longitude: number;
  geojson: GeoJSON;
  description?: string;
  verified: boolean;
}

export const api = {
  health: {
    check: () => apiClient.get<HealthStatus>('/api/health'),
  },
  territories: {
    getDepartments: () => apiClient.get<{ count: number; data: GeoUnit[] }>('/api/territories/departments'),
    getMunicipalities: (departmentCode: string) =>
      apiClient.get<{ count: number; data: GeoUnit[] }>(
        `/api/territories/departments/${departmentCode}/municipalities`,
      ),
    getMunicipality: (departmentCode: string, municipalityCode: string) =>
      apiClient.get<{ data: GeoUnit }>(`/api/territories/departments/${departmentCode}/municipalities/${municipalityCode}`),
  },
  agriculture: {
    getMunicipality: (municipalityCode: string, year: number = 2024) =>
      apiClient.get<{ data: AgriculturalData | null }>(
        `/api/agriculture/municipalities/${municipalityCode}?year=${year}`,
      ),
  },
  farms: {
    getByMunicipality: (municipalityCode: string) =>
      apiClient.get<{ count: number; data: Farm[] }>(`/api/farms/municipalities/${municipalityCode}`),
  },
};
