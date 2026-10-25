import type { ProductionOffer } from '@/services/api';

/** Etiquetas en español para el estado guardado en DB (los valores de DB no cambian). */
export const OFFER_STATUS_LABELS: Record<string, string> = {
  available: 'Disponible',
  sold_out: 'Agotada',
  inactive: 'Inactiva',
  harvested: 'Cosechada',
  historical: 'Histórica',
};

/** Tono visual del badge. El texto siempre acompaña al color: no se comunica solo con color. */
export const OFFER_STATUS_TONE: Record<string, 'ok' | 'warn' | 'muted'> = {
  available: 'ok',
  sold_out: 'warn',
  inactive: 'muted',
  harvested: 'muted',
  historical: 'muted',
};

export function offerPeriodLabel(o: Pick<ProductionOffer, 'availability_start' | 'availability_end'>): string {
  if (o.availability_start && o.availability_end) return `${o.availability_start} → ${o.availability_end}`;
  if (o.availability_start) return `Desde ${o.availability_start}`;
  if (o.availability_end) return `Hasta ${o.availability_end}`;
  return 'Sin fecha definida';
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha corta en español (24 oct) desde YYYY-MM-DD. Tabla fija: no depende de ICU ni de la zona horaria. */
export function formatDateShort(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}
