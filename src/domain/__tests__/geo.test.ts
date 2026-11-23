import { haversineKm } from '../geo';

describe('haversineKm', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversineKm({ lat: 10.5, lon: -66.9 }, { lat: 10.5, lon: -66.9 })).toBe(0);
  });

  it('1 grado de latitud ≈ 111,19 km', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.195, 2);
  });

  it('Caracas (Plaza Bolívar) → Valencia ≈ 122 km en línea recta', () => {
    const caracas = { lat: 10.5061, lon: -66.9146 };
    const valencia = { lat: 10.162, lon: -68.0077 };
    const d = haversineKm(caracas, valencia);
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(126);
  });

  it('es simétrica', () => {
    const a = { lat: 8.1, lon: -63.5 };
    const b = { lat: 8.2, lon: -63.3 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it('distancias cortas (10 m) se calculan bien', () => {
    // 0,00009° de latitud ≈ 10 m
    expect(haversineKm({ lat: 10, lon: -66 }, { lat: 10.00009, lon: -66 }) * 1000).toBeCloseTo(10, 0);
  });
});
