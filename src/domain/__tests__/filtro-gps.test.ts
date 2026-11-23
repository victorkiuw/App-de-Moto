import { debeActualizarReferencia, evaluarLectura, LecturaGps } from '../filtro-gps';

const base: LecturaGps = { lat: 10, lon: -66, timestamp: 0, precisionM: 5, velocidadMs: 0 };
// ~0,00009° lat ≈ 10 m
const mover = (l: LecturaGps, metros: number, segundos: number, velocidadMs: number | null): LecturaGps => ({
  ...l,
  lat: l.lat + (metros / 10) * 0.00009,
  timestamp: l.timestamp + segundos * 1000,
  velocidadMs,
});

describe('evaluarLectura', () => {
  it('la primera lectura no suma distancia pero sirve de ancla', () => {
    const r = evaluarLectura(null, base);
    expect(r.aceptada).toBe(false);
    expect(debeActualizarReferencia(r, null)).toBe(true);
  });

  it('acepta movimiento normal a 40 km/h', () => {
    const b = mover(base, 111, 10, 11.1); // 111 m en 10 s ≈ 40 km/h
    const r = evaluarLectura(base, b);
    expect(r.aceptada).toBe(true);
    if (r.aceptada) {
      expect(r.distanciaKm).toBeCloseTo(0.111, 2);
      expect(r.velocidadKmh).toBeCloseTo(40, 0);
    }
  });

  it('pausa por debajo de 3 km/h (semáforo con rebote de señal)', () => {
    const b = mover(base, 4, 5, 0.5); // 1,8 km/h
    const r = evaluarLectura(base, b);
    expect(r).toMatchObject({ aceptada: false, motivo: 'PARADO' });
    expect(debeActualizarReferencia(r, base)).toBe(true);
  });

  it('descarta lecturas con mala precisión y no mueve la referencia', () => {
    const b = { ...mover(base, 100, 10, 10), precisionM: 60 };
    const r = evaluarLectura(base, b);
    expect(r).toMatchObject({ aceptada: false, motivo: 'PRECISION' });
    expect(debeActualizarReferencia(r, base)).toBe(false);
  });

  it('descarta saltos imposibles (1 km en 2 s)', () => {
    const b = mover(base, 1000, 2, 10);
    const r = evaluarLectura(base, b);
    expect(r).toMatchObject({ aceptada: false, motivo: 'SALTO' });
    expect(debeActualizarReferencia(r, base)).toBe(false);
  });

  it('usa la velocidad calculada si el GPS no reporta velocidad', () => {
    const b = mover(base, 111, 10, null);
    const r = evaluarLectura(base, b);
    expect(r.aceptada).toBe(true);
    expect(r.velocidadKmh).toBeCloseTo(40, 0);
  });

  it('ignora lecturas con timestamp repetido o hacia atrás', () => {
    const b = { ...mover(base, 50, 0, 10) };
    expect(evaluarLectura(base, b)).toMatchObject({ aceptada: false, motivo: 'TIEMPO' });
  });
});
