// Etiquetas de unidades de venta. Solo presentación: la base sigue guardando el valor original (kg, ton, units...).

interface UnitInfo {
  /** Nombre completo para el detalle: "Kilogramo (kg)". */
  label: string;
  /** Forma corta para cantidades y precios: "kg". */
  short: string;
}

const UNITS: Record<string, UnitInfo> = {
  kg: { label: 'Kilogramo (kg)', short: 'kg' },
  g: { label: 'Gramo (g)', short: 'g' },
  t: { label: 'Tonelada (t)', short: 't' },
  ton: { label: 'Tonelada (t)', short: 't' },
  lb: { label: 'Libra (lb)', short: 'lb' },
  und: { label: 'Unidad (und)', short: 'und' },
  units: { label: 'Unidad (und)', short: 'und' },
  L: { label: 'Litro (L)', short: 'L' },
  liters: { label: 'Litro (L)', short: 'L' },
};

function lookup(unit: string): UnitInfo | undefined {
  // hasOwnProperty evita que "constructor" u otras claves del prototipo se tomen como unidades.
  return Object.prototype.hasOwnProperty.call(UNITS, unit) ? UNITS[unit] : undefined;
}

/** "Kilogramo (kg)" para kg. Unidad desconocida: el valor original, sin transformar. */
export function unitLabel(unit: string): string {
  return lookup(unit)?.label ?? unit;
}

/** Forma corta: "kg". Unidad desconocida: el valor original. */
export function unitShort(unit: string): string {
  return lookup(unit)?.short ?? unit;
}

/** Cantidad con unidad: "800 kg" (coma decimal: "12,5 kg"). */
export function formatQuantity(value: number, unit: string): string {
  return `${String(value).replace('.', ',')} ${unitShort(unit)}`;
}
