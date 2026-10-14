import type { AxiosError } from 'axios';
import { apiClient, type Farm, type ProductionOffer } from './api';

export type BusinessRole = 'producer' | 'buyer';

export interface Profile {
  id: string;
  display_name: string;
  country_code: string;
  department_code: string | null;
  municipality_code: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProducerProfile {
  user_id: string;
  business_name: string | null;
  description: string | null;
  public_phone: string | null;
  public_email: string | null;
  whatsapp: string | null;
  contact_visible: boolean;
  verified: boolean;
}

export interface BuyerProfile {
  user_id: string;
  organization: string | null;
  description: string | null;
  public_phone: string | null;
  public_email: string | null;
}

export interface MeResponse {
  id: string;
  email: string | null;
  profile: Profile;
  roles: BusinessRole[];
  producer_profile: ProducerProfile | null;
  buyer_profile: BuyerProfile | null;
}

export interface ProfileUpdate {
  display_name?: string;
  department_code?: string | null;
  municipality_code?: string | null;
}

export interface RolesResponse {
  roles: BusinessRole[];
}

export interface AccountGameScore {
  id: string;
  player_alias: string | null;
  game_slug: string;
  difficulty: string | null;
  score: number;
  created_at: string;
}

export const identityApi = {
  getMe: () => apiClient.get<MeResponse>('/api/me'),
  updateMe: (update: ProfileUpdate) => apiClient.patch<Profile>('/api/me', update),
  activateRole: (role: BusinessRole) => apiClient.post<RolesResponse>(`/api/me/roles/${role}`),
  deactivateRole: (role: BusinessRole) => apiClient.delete<RolesResponse>(`/api/me/roles/${role}`),
  myFarms: () => apiClient.get<Farm[]>('/api/me/farms'),
  myOffers: () => apiClient.get<ProductionOffer[]>('/api/me/offers'),
  myGameScores: () => apiClient.get<AccountGameScore[]>('/api/me/game-scores'),
  linkGuestScores: (playerId: string) =>
    apiClient.post<{ player_id: string; linked: number }>('/api/me/game-scores/link', {
      player_id: playerId,
    }),
};

/** Mensaje del backend (campo detail) o un texto genérico. Nunca muestra trazas técnicas. */
export function errorDetail(error: unknown, fallback: string): string {
  const detail = (error as AxiosError<{ detail?: unknown }>)?.response?.data?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
}
