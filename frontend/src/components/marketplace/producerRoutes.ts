// Perfil público del productor: /productores/{producer.id}. El id es el del registro de negocio, nunca user_id.
export const PRODUCERS_PREFIX = '/productores/';

export function isProducerPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').startsWith(PRODUCERS_PREFIX);
}

/** Id del productor en /productores/{id}, o null si la ruta no tiene id. */
export function parseProducerIdFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '');
  if (!normalized.startsWith(PRODUCERS_PREFIX)) return null;
  const id = normalized.slice(PRODUCERS_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function producerPath(producerId: string): string {
  return `${PRODUCERS_PREFIX}${producerId}`;
}
