import { describe, expect, it } from 'vitest';
import { formatCop, formatPricePerUnit } from './money';

describe('formato COP explícito', () => {
  it('8000 -> "COP $8.000"', () => {
    expect(formatCop(8000)).toBe('COP $8.000');
  });

  it('800 kg a 8000 por kg -> "COP $8.000/kg"', () => {
    expect(formatPricePerUnit(8000, 'kg')).toBe('COP $8.000/kg');
  });

  it('millones y centavos', () => {
    expect(formatCop(1250000)).toBe('COP $1.250.000');
    expect(formatCop(1234.5)).toBe('COP $1.234,50');
  });

  it('cero y negativos', () => {
    expect(formatCop(0)).toBe('COP $0');
    expect(formatCop(-500)).toBe('-COP $500');
  });

  it('unidades del modelo', () => {
    expect(formatPricePerUnit(2500, 'units')).toBe('COP $2.500/und');
    expect(formatPricePerUnit(900, 'liters')).toBe('COP $900/L');
    expect(formatPricePerUnit(3000, 'ton')).toBe('COP $3.000/t');
    expect(formatPricePerUnit(500, 'caja')).toBe('COP $500/caja');
  });
});
