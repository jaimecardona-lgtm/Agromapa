import axios from 'axios';
import type { GeoJsonObject, Point } from 'geojson';

// Use same origin in production, localhost proxy in development
const apiBase = import.meta.env.VITE_API_BASE_URL || '';

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
  geojson: GeoJsonObject | null;
  centroid_geojson: Point | null;
  parent_id?: string;
  parent_name?: string;
  attributes?: Record<string, unknown>;
}

export interface AgriculturalCrop {
  crop_name: string;
  crop_code?: string;
  crop_group?: string;
  crop_subgroup?: string;
  crop_cycle?: string;
  crop_disaggregation?: string;
  period?: string;
  crop_physical_state?: string;
  crop_scientific_name?: string;
  area_planted_ha?: number;
  area_harvested_ha?: number;
  production_tons?: number;
  yield_t_ha?: number;
}

export type AgriculturalStat = AgriculturalCrop;

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
  crops: AgriculturalCrop[];
  total_area_planted_ha?: number;
  total_area_harvested_ha?: number;
  total_production_tons?: number;
  average_yield_t_ha?: number;
}

export interface FarmCrop {
  id: string;
  crop_name: string;
  area_hectares?: number;
  expected_harvest_at?: string;
}

export interface Farm {
  id: string;
  name: string;
  municipality_name?: string;
  latitude: number;
  longitude: number;
  geojson?: GeoJsonObject | null;
  description?: string;
  verified: boolean;
  producer_name?: string;
  crops?: FarmCrop[];
}

export interface AgentContext {
  department_code?: string | null;
  municipality_code?: string | null;
  year?: number;
}

export interface AgentChatRequest {
  message: string;
  context?: AgentContext;
}

export interface AgentChatResponse {
  answer: string;
  sources: string[];
  tools_used: string[];
  context: AgentContext;
}

export const api = {
  health: {
    check: () => apiClient.get<HealthStatus>('/api/health'),
  },
  territories: {
    getDepartments: () =>
      apiClient.get<{ count: number; data: GeoUnit[] }>('/api/territories/departments'),
    getMunicipalities: (departmentCode: string) =>
      apiClient.get<{ count: number; data: GeoUnit[] }>(
        `/api/territories/departments/${departmentCode}/municipalities`,
      ),
    getMunicipality: (departmentCode: string, municipalityCode: string) =>
      apiClient.get<{ data: GeoUnit }>(
        `/api/territories/departments/${departmentCode}/municipalities/${municipalityCode}`,
      ),
  },
  agriculture: {
    getMunicipality: (municipalityCode: string, year: number = 2024) =>
      apiClient.get<{ data: AgriculturalData | null; message?: string }>(
        `/api/agriculture/municipalities/${municipalityCode}?year=${year}`,
      ),
  },
  farms: {
    getByMunicipality: (municipalityCode: string) =>
      apiClient.get<{ count: number; data: Farm[] }>(`/api/farms/municipalities/${municipalityCode}`),
  },
  agent: {
    chat: (request: AgentChatRequest) =>
      apiClient.post<AgentChatResponse>('/api/agent/chat', request),
  },
};
