// Formato de fechas y precios para el mercado y los mensajes. Sin dependencias nuevas.
import { formatPricePerUnit } from '@/utils/money';

/** Precio por unidad en COP ("COP $8.000/kg"), o null si no hay precio. */
export function formatPrice(value: number | null | undefined, unit: string): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? formatPricePerUnit(value, unit) : null;
}

/** Fecha sin hora (YYYY-MM-DD) interpretada en hora local para no desplazar el día. */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('es-CO');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Disponibilidad vigente: sin fecha final o con fecha final igual o posterior a hoy. */
export function isAvailableToday(availableUntil: string | null | undefined, today = new Date()): boolean {
  if (!availableUntil) return true;
  const end = new Date(`${availableUntil.slice(0, 10)}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() >= today.getTime();
}
