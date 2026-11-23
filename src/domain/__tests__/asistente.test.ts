import { calcularPieza, DatosEstimacion, estimarOdometro } from '../asistente';

const HOY = '2026-11-23';
const datos: DatosEstimacion = {
  fechaCompra: '2024-10-18',
  kmPorSemana: 350,
  paradas: [{ desde: '2026-04-26', hasta: '2026-08-03' }],
  odometroKm: 45000,
};

describe('calcularPieza', () => {
  it('ORIGINAL: todo el odómetro, fecha de compra', () => {
    const r = calcularPieza({ modo: 'ORIGINAL' }, 15000, datos, HOY);
    expect(r).toMatchObject({ kmDesdeServicio: 45000, fecha: '2024-10-18', estado: 'VENCIDO' });
  });

  it('FECHA: cunas de dirección con mantenimiento al salir de la lesión (04/08/2026)', () => {
    // 111 días de uso × 50 km/día = 5.550 km
    const r = calcularPieza({ modo: 'FECHA', fecha: '2026-08-04' }, 20000, datos, HOY);
    expect(r.kmDesdeServicio).toBeCloseTo(5550, 6);
    expect(r.estado).toBe('OK');
    expect(r.fecha).toBe('2026-08-04');
  });

  it('FECHA antes de la parada descuenta los días parado', () => {
    const r = calcularPieza({ modo: 'FECHA', fecha: '2026-04-01' }, 2500, datos, HOY);
    // 236 días - 100 parado = 136 × 50
    expect(r.kmDesdeServicio).toBeCloseTo(6800, 6);
    expect(r.estado).toBe('VENCIDO');
  });

  it('FECHA que supera el odómetro se recorta y lo avisa', () => {
    const r = calcularPieza({ modo: 'FECHA', fecha: '2024-10-18' }, 15000, { ...datos, odometroKm: 10000 }, HOY);
    expect(r).toMatchObject({ kmDesdeServicio: 10000, recortado: true });
  });

  it('KM y REVISAR', () => {
    expect(calcularPieza({ modo: 'KM', km: 1200 }, 2500, datos, HOY).kmDesdeServicio).toBe(1200);
    const r = calcularPieza({ modo: 'REVISAR' }, 3000, datos, HOY);
    expect(r).toMatchObject({ kmDesdeServicio: 3000, porcentaje: 100, estado: 'VENCIDO', fecha: null });
  });
});

describe('estimarOdometro', () => {
  it('lectura congelada de 26.100 en nov 2025 + 350 km/sem sin la lesión ≈ 39.400', () => {
    const km = estimarOdometro(26100, '2025-11-23', HOY, 350, datos.paradas);
    expect(km).toBeCloseTo(26100 + (365 - 100) * 50, 6);
  });
});
