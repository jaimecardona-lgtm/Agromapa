import { describe, expect, it } from 'vitest';
import { formatQuantity, unitLabel, unitShort } from './units';

describe('etiquetas de unidades (solo presentación)', () => {
  it('kg -> "Kilogramo (kg)"', () => {
    expect(unitLabel('kg')).toBe('Kilogramo (kg)');
  });

  it('cantidad: 800 kg -> "800 kg"', () => {
    expect(formatQuantity(800, 'kg')).toBe('800 kg');
  });

  it('cantidad con decimales usa coma', () => {
    expect(formatQuantity(12.5, 'kg')).toBe('12,5 kg');
  });

  it('unidad desconocida "caja" -> "caja" sin transformar', () => {
    expect(unitLabel('caja')).toBe('caja');
    expect(unitShort('caja')).toBe('caja');
    expect(formatQuantity(3, 'caja')).toBe('3 caja');
  });

  it('claves del prototipo no se tratan como unidades', () => {
    expect(unitLabel('constructor')).toBe('constructor');
    expect(unitShort('toString')).toBe('toString');
  });

  it('alias del modelo: ton/units/liters tienen su etiqueta', () => {
    expect(unitLabel('ton')).toBe('Tonelada (t)');
    expect(unitLabel('units')).toBe('Unidad (und)');
    expect(unitLabel('liters')).toBe('Litro (L)');
  });

  it('los valores de DB no cambian: solo se transforma la presentación', () => {
    const stored = 'kg';
    unitLabel(stored);
    expect(stored).toBe('kg');
  });
});
