// Rutas del mercado y de mensajes. Mismo patrón que publicRoutes.ts: sin router, por pathname.
export const MARKETPLACE_PATH = '/mercado';
export const MESSAGES_PATH = '/mensajes';

const OFFER_PREFIX = `${MARKETPLACE_PATH}/oferta/`;

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

export function isMarketplacePath(pathname: string): boolean {
  const normalized = normalize(pathname);
  return normalized === MARKETPLACE_PATH || normalized.startsWith(OFFER_PREFIX);
}

/** Id de la oferta en /mercado/oferta/{id}, o null si la ruta es la lista. */
export function parseOfferIdFromPath(pathname: string): string | null {
  const normalized = normalize(pathname);
  if (!normalized.startsWith(OFFER_PREFIX)) return null;
  const id = normalized.slice(OFFER_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function offerPath(offerId: string): string {
  return `${OFFER_PREFIX}${offerId}`;
}

export interface MarketUrlFilters {
  crop: string;
  departmentCode: string;
  municipalityCode: string;
  farmId: string;
  producerId: string;
}

/** Filtros del mercado desde la URL: /mercado?crop=&department=&municipality=&farm=&producer= */
export function marketFiltersFromSearch(search: string): Partial<MarketUrlFilters> {
  const params = new URLSearchParams(search);
  const read = (key: string) => (params.get(key) ?? '').trim();
  return {
    crop: read('crop'),
    departmentCode: read('department'),
    municipalityCode: read('municipality'),
    farmId: read('farm'),
    producerId: read('producer'),
  };
}

/** Query string con solo los filtros activos; cadena vacía si no hay ninguno. */
export function marketSearchFromFilters(filters: MarketUrlFilters): string {
  const params = new URLSearchParams();
  if (filters.crop.trim()) params.set('crop', filters.crop.trim());
  if (filters.departmentCode) params.set('department', filters.departmentCode);
  if (filters.municipalityCode) params.set('municipality', filters.municipalityCode);
  if (filters.farmId) params.set('farm', filters.farmId);
  if (filters.producerId) params.set('producer', filters.producerId);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function isMessagesPath(pathname: string): boolean {
  return normalize(pathname) === MESSAGES_PATH;
}

/** /mensajes?c={conversationId} abre directamente una conversación. */
export function messagesPath(conversationId?: string): string {
  return conversationId ? `${MESSAGES_PATH}?c=${encodeURIComponent(conversationId)}` : MESSAGES_PATH;
}
