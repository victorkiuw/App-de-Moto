import { diasDeUso, estimarKm, formatearFechaCorta, parsearFechaCorta } from '../estimacion';

const PARADA = [{ desde: '2026-04-26', hasta: '2026-08-03' }];

describe('diasDeUso', () => {
  it('cuenta días calendario', () => {
    expect(diasDeUso('2026-01-01', '2026-01-31')).toBe(30);
    expect(diasDeUso('2024-10-18', '2025-05-23')).toBe(217);
  });

  it('la parada del 26/04 al 03/08 son 100 días (ambos extremos incluidos)', () => {
    expect(diasDeUso('2026-01-01', '2026-11-23') - diasDeUso('2026-01-01', '2026-11-23', PARADA)).toBe(100);
  });

  it('solo descuenta la parte de la parada que cae dentro del rango', () => {
    // Pieza puesta el 01/08: solo 01/08..03/08 caen en la parada
    expect(diasDeUso('2026-08-01', '2026-08-11', PARADA)).toBe(7);
    // Pieza puesta después de la parada: nada que descontar
    expect(diasDeUso('2026-09-01', '2026-09-11', PARADA)).toBe(10);
    // Rango completamente dentro de la parada
    expect(diasDeUso('2026-05-01', '2026-06-01', PARADA)).toBe(0);
  });

  it('une paradas solapadas y no da negativos', () => {
    const p = [
      { desde: '2026-01-10', hasta: '2026-01-20' },
      { desde: '2026-01-15', hasta: '2026-01-25' },
    ];
    expect(diasDeUso('2026-01-01', '2026-02-01', p)).toBe(31 - 16);
    expect(diasDeUso('2026-02-01', '2026-01-01')).toBe(0);
  });
});

describe('estimarKm', () => {
  it('aceite cambiado hace 20 días a 700 km/semana ≈ 2.000 km', () => {
    expect(estimarKm('2026-11-03', '2026-11-23', 700)).toBeCloseTo(2000, 6);
  });

  it('desde la compra hasta hoy con 350 km/semana descontando la lesión', () => {
    const km = estimarKm('2024-10-18', '2026-11-23', 350, PARADA);
    expect(km).toBeCloseTo(((766 - 100) * 350) / 7, 6);
  });

  it('0 con ritmo inválido', () => {
    expect(estimarKm('2026-01-01', '2026-02-01', 0)).toBe(0);
    expect(estimarKm('2026-01-01', '2026-02-01', NaN)).toBe(0);
  });
});

describe('fechas cortas', () => {
  it.each([
    ['18/10/2024', '2024-10-18'],
    ['3/8/26', '2026-08-03'],
    ['26-04-2026', '2026-04-26'],
    ['31/02/2026', null],
    ['2026-04-26', null],
    ['hola', null],
  ])('%p → %p', (t, esperado) => {
    expect(parsearFechaCorta(t as string)).toBe(esperado);
  });

  it('formatea', () => {
    expect(formatearFechaCorta('2024-10-18')).toBe('18/10/2024');
  });
});
