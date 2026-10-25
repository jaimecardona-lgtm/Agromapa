import { apiClient } from './api';

// Mensajería interna comprador/productor. Todo pasa por el backend con el token de sesión.
// El frontend nunca envía buyer_user_id, producer_user_id ni sender_user_id.

export type ConversationStatus = 'active' | 'closed' | 'archived';

export interface ConversationOffer {
  crop_name: string;
  farm_name: string;
  municipality_name: string;
  quantity: number;
  unit: string;
  status: string;
}

export interface ConversationSummary {
  id: string;
  offer_id: string | null;
  farm_id: string | null;
  status: ConversationStatus;
  my_role: 'buyer' | 'producer';
  counterpart_name: string;
  offer: ConversationOffer | null;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_is_mine: boolean;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  body: string;
  sender_is_me: boolean;
  created_at: string;
  read_at: string | null;
}

export const MESSAGE_MAX_LENGTH = 2000;

export const conversationsApi = {
  /** Crea la conversación de una oferta (o devuelve la activa existente). Solo compradores. */
  create: (offerId: string) => apiClient.post<ConversationSummary>('/api/conversations', { offer_id: offerId }),
  list: () => apiClient.get<ConversationSummary[]>('/api/conversations'),
  get: (id: string) => apiClient.get<ConversationSummary>(`/api/conversations/${id}`),
  messages: (id: string) => apiClient.get<{ data: ConversationMessage[] }>(`/api/conversations/${id}/messages`),
  send: (id: string, body: string) =>
    apiClient.post<ConversationMessage>(`/api/conversations/${id}/messages`, { body }),
  markRead: (id: string) => apiClient.patch<{ marked: number }>(`/api/conversations/${id}/read`),
  setStatus: (id: string, status: ConversationStatus) =>
    apiClient.patch<ConversationSummary>(`/api/conversations/${id}/status`, { status }),
};
