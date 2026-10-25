import axios from 'axios';
import type { GeoJsonObject, Point } from 'geojson';
import { getAccessToken } from '@/auth/tokenStore';

// Use same origin in production, localhost proxy in development
const apiBase = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Solo se envía el access token de la sesión activa. Las lecturas públicas siguen sin sesión.
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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

/** Cultivo público de una finca: solo nombre y área. */
export interface PublicFarmCrop {
  name: string;
  area_hectares?: number | null;
  image_url?: string | null;
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
  producer_verified?: boolean;
  crops?: PublicFarmCrop[];
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PublicTerritory {
  code: string | null;
  name: string | null;
}

/** Oferta vigente dentro del perfil público del productor (sin contacto). */
export interface PublicProducerOffer {
  id: string;
  crop_name: string;
  farm_id: string;
  farm_name: string;
  municipality_code: string | null;
  municipality_name: string | null;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  available_from: string | null;
  available_until: string | null;
  status: string;
  description: string | null;
  crop_image_url?: string | null;
}

/** Perfil público del productor. Ningún campo de contacto, email, teléfono ni user_id. */
export interface PublicProducerProfile {
  id: string;
  name: string;
  verified: boolean;
  description: string | null;
  department: PublicTerritory;
  municipality: PublicTerritory;
  farms: Farm[];
  active_offers: PublicProducerOffer[];
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
  /** Imagen ilustrativa generada por IA (no es foto real). Null si no existe. */
  illustrative_image_url?: string | null;
  illustrative_image_status?: 'none' | 'pending' | 'ready' | 'failed';
}

export interface CropIllustrationResponse {
  farm_crop_id: string;
  status: 'none' | 'pending' | 'ready' | 'failed';
  image_url: string | null;
  label: string | null;
  message: string | null;
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
  /** Solo en /api/me/offers: contexto de cultivo y finca para el listado propio. */
  crop_name?: string;
  crop_image_url?: string | null;
  farm_id?: string;
  farm_name?: string;
  expected_harvest_at?: string;
  created_at: string;
  updated_at: string;
}

/** Contacto comercial público. Solo llega cuando el productor marcó contact_visible. */
export interface ProducerContact {
  public_phone: string | null;
  public_email: string | null;
  whatsapp: string | null;
}

/** Productor en vista pública: nunca incluye email de cuenta, teléfono legacy ni documento. */
export interface PublicProducer {
  id: string;
  display_name: string;
  verified: boolean;
  description: string | null;
  contact: ProducerContact | null;
  messaging_available: boolean;
}

export interface CurrentOffer {
  id: string;
  farm_crop_id: string;
  farm_id: string;
  farm_name: string;
  producer_id?: string;
  producer_name: string;
  producer_verified: boolean;
  producer_contact: ProducerContact | null;
  messaging_available: boolean;
  /** Imagen ilustrativa del cultivo (IA). Null si no existe. */
  crop_image_url?: string | null;
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
      /** Vincula (o reactiva) el registro productor de la cuenta autenticada. No recibe body. */
      linkMine: () => apiClient.post<Producer>('/api/operational/producers'),
      list: () => apiClient.get<PublicProducer[]>('/api/operational/producers'),
      get: (id: string) => apiClient.get<PublicProducer>(`/api/operational/producers/${id}`),
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
      /** Genera la imagen ilustrativa del cultivo (solo dueño). 503 si la generación no está configurada. */
      illustration: (farmCropId: string) =>
        apiClient.post<CropIllustrationResponse>(`/api/operational/farm-crops/${farmCropId}/illustration`),
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
      /** Oferta vigente por id (vista pública). Requiere endpoint GET /api/operational/current-offer/{id}. */
      get: (id: string) => apiClient.get<CurrentOffer>(`/api/operational/current-offer/${id}`),
    },
  },
  marketplace: {
    /** Perfil público por id de productor (registro de negocio, no user_id). 404 si no está disponible. */
    producer: (id: string) => apiClient.get<PublicProducerProfile>(`/api/marketplace/producers/${id}`),
  },
  agent: {
    chat: (request: AgentChatRequest) =>
      apiClient.post<AgentChatResponse>('/api/agent/chat', request),
  },
};
