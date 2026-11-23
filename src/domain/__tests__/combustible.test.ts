import {
  autonomiaTotalKm,
  consumoRealLKm,
  estadoTanque,
  FACTOR_CONSUMO_FABRICA_L_KM,
  litrosConsumidos,
} from '../combustible';

describe('combustible', () => {
  it('32,4 km × 0,026 = 0,8424 L (ejemplo del cockpit)', () => {
    expect(litrosConsumidos(32.4, FACTOR_CONSUMO_FABRICA_L_KM)).toBeCloseTo(0.8424, 4);
  });

  it('autonomía teórica de 10 L ≈ 384,6 km', () => {
    expect(autonomiaTotalKm(10, 0.026)).toBeCloseTo(384.6, 1);
  });

  it('entra en reserva a los 320 km desde el tanqueo', () => {
    const p = { odometroUltimoTanqueoKm: 1000, capacidadL: 10, factorLKm: 0.026, kmAlertaReserva: 320 };
    expect(estadoTanque({ ...p, odometroKm: 1319 }).enReserva).toBe(false);
    const e = estadoTanque({ ...p, odometroKm: 1320 });
    expect(e.enReserva).toBe(true);
    expect(e.litrosEstimadosRestantes).toBeCloseTo(10 - 8.32, 2);
    expect(e.kmRestantesEstimados).toBeCloseTo(64.6, 1);
  });

  it('nunca da litros negativos', () => {
    const e = estadoTanque({
      odometroKm: 2000,
      odometroUltimoTanqueoKm: 1000,
      capacidadL: 10,
      factorLKm: 0.026,
      kmAlertaReserva: 320,
    });
    expect(e.litrosEstimadosRestantes).toBe(0);
    expect(e.fraccionRestante).toBe(0);
  });
});

describe('consumoRealLKm (tanque lleno a tanque lleno)', () => {
  it('null sin ciclos completos', () => {
    expect(consumoRealLKm([])).toBeNull();
    expect(consumoRealLKm([{ odometroKm: 0, litros: 10, tanqueLleno: true }])).toBeNull();
  });

  it('calcula un ciclo simple', () => {
    const r = consumoRealLKm([
      { odometroKm: 1000, litros: 9, tanqueLleno: true },
      { odometroKm: 1300, litros: 8.1, tanqueLleno: true },
    ]);
    expect(r).toBeCloseTo(8.1 / 300, 6);
  });

  it('suma los tanqueos parciales dentro del ciclo', () => {
    const r = consumoRealLKm([
      { odometroKm: 0, litros: 10, tanqueLleno: true },
      { odometroKm: 150, litros: 2, tanqueLleno: false },
      { odometroKm: 400, litros: 8, tanqueLleno: true },
    ]);
    expect(r).toBeCloseTo(10 / 400, 6);
  });

  it('ignora parciales antes del primer llenado y ciclos demasiado cortos', () => {
    const r = consumoRealLKm([
      { odometroKm: 0, litros: 3, tanqueLleno: false },
      { odometroKm: 100, litros: 10, tanqueLleno: true },
      { odometroKm: 120, litros: 0.5, tanqueLleno: true }, // 20 km: descartado
      { odometroKm: 420, litros: 7.5, tanqueLleno: true },
    ]);
    expect(r).toBeCloseTo(7.5 / 300, 6);
  });

  it('usa solo los últimos N ciclos', () => {
    const t = [
      { odometroKm: 0, litros: 10, tanqueLleno: true },
      { odometroKm: 100, litros: 5, tanqueLleno: true }, // 0,05 L/km (viejo)
      { odometroKm: 200, litros: 2, tanqueLleno: true }, // 0,02
      { odometroKm: 300, litros: 2, tanqueLleno: true }, // 0,02
    ];
    expect(consumoRealLKm(t, { maxCiclos: 2 })).toBeCloseTo(0.02, 6);
  });
});
