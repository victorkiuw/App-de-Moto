import { FILTRO_POR_DEFECTO, LecturaGps } from '../filtro-gps';
import { estadoInicial, procesarLecturas, sinSenal } from '../rastreo';

/** Genera lecturas en línea recta hacia el norte a velocidad constante. */
function trayecto(opts: {
  desdeLat?: number;
  t0?: number;
  n: number;
  cadaS: number;
  kmh: number;
  precisionM?: number;
}): LecturaGps[] {
  const { n, cadaS, kmh } = opts;
  const metrosPorPaso = (kmh / 3.6) * cadaS;
  const gradosPorMetro = 1 / 111_195;
  return Array.from({ length: n }, (_, i) => ({
    lat: (opts.desdeLat ?? 10) + i * metrosPorPaso * gradosPorMetro,
    lon: -66,
    timestamp: (opts.t0 ?? 0) + i * cadaS * 1000,
    precisionM: opts.precisionM ?? 5,
    velocidadMs: kmh / 3.6,
  }));
}

describe('procesarLecturas', () => {
  it('1 km a 40 km/h, lectura cada 2 s', () => {
    // 90 s a 40 km/h = 1 km → 46 lecturas (45 tramos)
    const l = trayecto({ n: 46, cadaS: 2, kmh: 40 });
    const { estado, puntos } = procesarLecturas(estadoInicial(1), l, FILTRO_POR_DEFECTO);
    expect(estado.distanciaKm).toBeCloseTo(1, 2);
    expect(estado.movimientoSegundos).toBe(90);
    expect(estado.velocidadMaximaKmh).toBeCloseTo(40, 0);
    expect(estado.enMovimiento).toBe(true);
    expect(puntos).toHaveLength(46);
    expect(puntos.filter((p) => p.contado)).toHaveLength(45);
  });

  it('da lo mismo procesar en un lote o en varios', () => {
    const l = trayecto({ n: 40, cadaS: 2, kmh: 50 });
    const deUna = procesarLecturas(estadoInicial(1), l, FILTRO_POR_DEFECTO).estado;
    let e = estadoInicial(1);
    for (let i = 0; i < l.length; i += 7) e = procesarLecturas(e, l.slice(i, i + 7), FILTRO_POR_DEFECTO).estado;
    expect(e.distanciaKm).toBeCloseTo(deUna.distanciaKm, 10);
    expect(e.movimientoSegundos).toBe(deUna.movimientoSegundos);
  });

  it('en el semáforo no suma aunque el GPS "baile"', () => {
    const t0 = 1_000_000;
    // 60 s parado con rebotes de ±3 m y velocidad reportada ~1 km/h
    const parado: LecturaGps[] = Array.from({ length: 30 }, (_, i) => ({
      lat: 10 + (i % 2 ? 0.000027 : -0.000027),
      lon: -66,
      timestamp: t0 + i * 2000,
      precisionM: 8,
      velocidadMs: 0.3,
    }));
    const { estado } = procesarLecturas(estadoInicial(1), parado, FILTRO_POR_DEFECTO);
    expect(estado.distanciaKm).toBe(0);
    expect(estado.movimientoSegundos).toBe(0);
    expect(estado.enMovimiento).toBe(false);
  });

  it('al arrancar después de una parada no suma el "salto" de la parada', () => {
    const ida = trayecto({ n: 10, cadaS: 2, kmh: 36 }); // 9 tramos × 20 m = 180 m
    let { estado } = procesarLecturas(estadoInicial(1), ida, FILTRO_POR_DEFECTO);
    const fin = ida[ida.length - 1];
    // Parado 60 s en el mismo sitio
    const parada = Array.from({ length: 30 }, (_, i) => ({ ...fin, timestamp: fin.timestamp + (i + 1) * 2000, velocidadMs: 0 }));
    estado = procesarLecturas(estado, parada, FILTRO_POR_DEFECTO).estado;
    const antes = estado.distanciaKm;
    const vuelta = trayecto({ desdeLat: fin.lat, t0: fin.timestamp + 62_000, n: 10, cadaS: 2, kmh: 36 });
    estado = procesarLecturas(estado, vuelta, FILTRO_POR_DEFECTO).estado;
    expect(antes).toBeCloseTo(0.18, 3);
    // La vuelta suma sus 9 tramos y nada por el tiempo parado
    expect(estado.distanciaKm - antes).toBeCloseTo(0.18, 3);
  });

  it('ignora lecturas imprecisas y no las guarda como puntos', () => {
    const l = trayecto({ n: 10, cadaS: 2, kmh: 40 });
    l[4] = { ...l[4], precisionM: 80 };
    const { estado, puntos } = procesarLecturas(estadoInicial(1), l, FILTRO_POR_DEFECTO);
    expect(puntos).toHaveLength(9);
    // La distancia total no cambia: el tramo se mide desde la lectura 3 a la 5
    expect(estado.distanciaKm).toBeCloseTo((9 * 2 * 40) / 3600, 2);
  });

  it('un rebote aislado de 1 km no se suma', () => {
    const l = trayecto({ n: 10, cadaS: 2, kmh: 40 });
    l[5] = { ...l[5], lat: l[5].lat + 0.009 }; // +1 km en 2 s
    const { estado } = procesarLecturas(estadoInicial(1), l, FILTRO_POR_DEFECTO);
    expect(estado.distanciaKm).toBeCloseTo((9 * 2 * 40) / 3600, 2);
  });

  it('si el punto de partida era el malo, se recupera tras 3 saltos', () => {
    const malo: LecturaGps = { lat: 10.05, lon: -66, timestamp: 0, precisionM: 10, velocidadMs: 0 };
    const buenas = trayecto({ t0: 2000, n: 20, cadaS: 2, kmh: 40 });
    const { estado } = procesarLecturas(estadoInicial(1), [malo, ...buenas], FILTRO_POR_DEFECTO);
    // Pierde los 2 primeros tramos (3 saltos) y mide bien los 17 restantes de 22,2 m
    expect(estado.distanciaKm).toBeCloseTo((17 * 2 * 40) / 3600, 3);
  });

  it('un túnel de 2 min no cuenta como tiempo en movimiento completo', () => {
    const a = trayecto({ n: 5, cadaS: 2, kmh: 40 });
    const ult = a[a.length - 1];
    const b = trayecto({ desdeLat: ult.lat + (120 * 40) / 3.6 / 111_195, t0: ult.timestamp + 120_000, n: 5, cadaS: 2, kmh: 40 });
    const { estado } = procesarLecturas(estadoInicial(1), [...a, ...b], FILTRO_POR_DEFECTO);
    expect(estado.distanciaKm).toBeCloseTo((8 * 2 + 120) * (40 / 3600), 2);
    expect(estado.movimientoSegundos).toBe(8 * 2 + 30);
  });

  it('ignora lecturas repetidas', () => {
    const l = trayecto({ n: 10, cadaS: 2, kmh: 40 });
    const r1 = procesarLecturas(estadoInicial(1), l, FILTRO_POR_DEFECTO);
    const r2 = procesarLecturas(r1.estado, l.slice(5), FILTRO_POR_DEFECTO);
    expect(r2.estado.distanciaKm).toBe(r1.estado.distanciaKm);
    expect(r2.puntos).toHaveLength(0);
  });
});

describe('sinSenal', () => {
  it('detecta cuando no llegan lecturas', () => {
    const e = { ...estadoInicial(1), ultimaLecturaTs: 1000 };
    expect(sinSenal(e, 5000)).toBe(false);
    expect(sinSenal(e, 30_000)).toBe(true);
    expect(sinSenal(null, 0)).toBe(true);
  });
});
