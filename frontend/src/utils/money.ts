// Dinero de Raíces Conectadas: pesos colombianos (COP), formato explícito.
// No usa Intl ni el locale del navegador: el resultado es el mismo en cualquier equipo.
import { unitShort } from './units';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "COP $8.000" (o "COP $1.234,50" si hay centavos). */
export function formatCop(value: number): string {
  const sign = value < 0 ? '-' : '';
  const [whole, cents] = Math.abs(value).toFixed(2).split('.');
  const decimals = cents === '00' ? '' : `,${cents}`;
  return `${sign}COP $${groupThousands(whole)}${decimals}`;
}

/** Precio por unidad: "COP $8.000/kg". Si la unidad no tiene forma corta, se muestra tal cual. */
export function formatPricePerUnit(value: number, unit: string): string {
  return `${formatCop(value)}/${unitShort(unit)}`;
}
