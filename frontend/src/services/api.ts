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

export interface Producer {
  id: string;
  name: string;
  document_type?: string;
  document_number?: string;
  phone?: string;
  email?: string;
  organization?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Farm {
  id: string;
  producer_id?: string;
  name: string;
  municipality_name?: string;
  municipality_code?: string;
  latitude: number;
  longitude: number;
  geojson?: GeoJsonObject | null;
  description?: string;
  area_ha?: number;
  verified?: boolean;
  producer_name?: string;
  crops?: FarmCrop[];
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FarmCropDetail {
  id: string;
  farm_id: string;
  crop_name: string;
  description?: string;
  area_hectares?: number;
  expected_harvest_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionOffer {
  id: string;
  farm_crop_id: string;
  available_quantity: number;
  unit: string;
  availability_start?: string;
  availability_end?: string;
  price_per_unit?: number;
  status: string;
  description?: string;
  notes?: string;
  harvested_at?: string;
  expected_harvest_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CurrentOffer {
  id: string;
  farm_crop_id: string;
  farm_id: string;
  farm_name: string;
  producer_name: string;
  producer_phone?: string;
  producer_email?: string;
  municipality_name: string;
  municipality_code?: string;
  crop_name: string;
  quantity: number;
  unit: string;
  available_from?: string;
  available_until?: string;
  price_per_unit?: number;
  expected_harvest_at?: string;
  harvested_at?: string;
  description?: string;
  notes?: string;
  status: string;
  source: string;
  data_type: string;
  created_at: string;
  updated_at: string;
}

export interface AgentContext {
  department_code?: string | null;
  municipality_code?: string | null;
  year?: number;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentChatRequest {
  message: string;
  context?: AgentContext;
  history?: ChatHistoryMessage[];
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
  operational: {
    producers: {
      create: (producer: Partial<Producer>) =>
        apiClient.post<Producer>('/api/operational/producers', producer),
      list: () => apiClient.get<Producer[]>('/api/operational/producers'),
      get: (id: string) => apiClient.get<Producer>(`/api/operational/producers/${id}`),
      update: (id: string, update: Partial<Producer>) =>
        apiClient.patch<Producer>(`/api/operational/producers/${id}`, update),
    },
    farms: {
      create: (farm: Partial<Farm>) => apiClient.post<Farm>('/api/operational/farms', farm),
      get: (id: string) => apiClient.get<Farm>(`/api/operational/farms/${id}`),
      update: (id: string, update: Partial<Farm>) =>
        apiClient.patch<Farm>(`/api/operational/farms/${id}`, update),
      listByProducer: (producerId: string) =>
        apiClient.get<Farm[]>(`/api/operational/producers/${producerId}/farms`),
    },
    crops: {
      create: (farmId: string, crop: Partial<FarmCropDetail>) =>
        apiClient.post<FarmCropDetail>(`/api/operational/farms/${farmId}/crops`, crop),
      list: (farmId: string) =>
        apiClient.get<FarmCropDetail[]>(`/api/operational/farms/${farmId}/crops`),
      get: (id: string) => apiClient.get<FarmCropDetail>(`/api/operational/farm-crops/${id}`),
      update: (id: string, update: Partial<FarmCropDetail>) =>
        apiClient.patch<FarmCropDetail>(`/api/operational/farm-crops/${id}`, update),
    },
    offers: {
      create: (farmCropId: string, offer: Partial<ProductionOffer>) =>
        apiClient.post<ProductionOffer>(`/api/operational/farm-crops/${farmCropId}/offers`, offer),
      list: (farmCropId: string) =>
        apiClient.get<ProductionOffer[]>(`/api/operational/farm-crops/${farmCropId}/offers`),
      get: (id: string) => apiClient.get<ProductionOffer>(`/api/operational/offers/${id}`),
      update: (id: string, update: Partial<ProductionOffer>) =>
        apiClient.patch<ProductionOffer>(`/api/operational/offers/${id}`, update),
    },
    currentOffers: {
      list: (filters?: {
        municipality_code?: string;
        department_code?: string;
        crop?: string;
        farm_id?: string;
      }) => apiClient.get<{ count: number; data: CurrentOffer[] }>('/api/operational/current-offer', { params: filters }),
    },
  },
  agent: {
    chat: (request: AgentChatRequest) =>
      apiClient.post<AgentChatResponse>('/api/agent/chat', request),
  },
};
