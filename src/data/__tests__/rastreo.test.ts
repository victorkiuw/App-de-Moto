import { crearDbMemoria } from './db-memoria';
import { Db } from '../db';
import { guardarAjustes } from '../ajustes';
import { obtenerMoto } from '../moto';
import { obtenerPieza } from '../piezas';
import {
  cancelarRastreo,
  comenzarRastreo,
  obtenerEstadoRastreo,
  registrarLecturas,
  terminarRastreo,
} from '../rastreo';
import { listarViajes, obtenerPuntos, obtenerViaje, obtenerViajeEnCurso } from '../viajes';
import type { LecturaGps } from '@/domain/filtro-gps';

let db: Db & { cerrar(): void };
beforeEach(async () => {
  db = await crearDbMemoria();
});
afterEach(() => db.cerrar());

/** n lecturas cada 2 s a 36 km/h (20 m por tramo) hacia el norte. */
function tramo(t0: number, n: number, lat0 = 10): LecturaGps[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: lat0 + (i * 20) / 111_195,
    lon: -66,
    timestamp: t0 + i * 2000,
    precisionM: 5,
    velocidadMs: 10,
    altitudM: 900,
  }));
}

it('flujo completo de una rodada por GPS', async () => {
  await guardarAjustes(db, { precioLitroBs: 100 });
  const v = await comenzarRastreo(db);
  expect((await obtenerEstadoRastreo(db))?.viajeId).toBe(v.id);

  // Dos lotes (Android entrega las lecturas agrupadas)
  const l = tramo(1_000_000, 51); // 50 tramos × 20 m = 1 km
  await registrarLecturas(db, l.slice(0, 20));
  const e = await registrarLecturas(db, l.slice(20));
  expect(e?.distanciaKm).toBeCloseTo(1, 3);

  // El viaje en curso ya refleja el avance (para la pantalla y si la app se cierra)
  expect((await obtenerViaje(db, v.id))?.distanciaKm).toBeCloseTo(1, 3);
  const puntos = await obtenerPuntos(db, v.id);
  expect(puntos).toHaveLength(51);
  expect(puntos[0].altitudM).toBe(900);

  const fin = await terminarRastreo(db);
  expect(fin?.estado).toBe('FINALIZADO');
  expect(fin?.distanciaKm).toBeCloseTo(1, 3);
  expect(fin?.duracionMovimientoSegundos).toBe(100);
  expect(fin?.velocidadMaximaKmh).toBeCloseTo(36, 3);
  expect(fin?.costoBs).toBeCloseTo(2.6, 3); // 0,026 L × 100 Bs
  expect((await obtenerMoto(db)).odometroTotalKm).toBeCloseTo(1, 3);
  expect((await obtenerPieza(db, 'CAD_LUB'))?.kmAcumulados).toBeCloseTo(1, 3);
  expect(await obtenerEstadoRastreo(db)).toBeNull();
});

it('lecturas que llegan después de finalizar no suman nada', async () => {
  await comenzarRastreo(db);
  await registrarLecturas(db, tramo(0, 11));
  await terminarRastreo(db);
  const r = await registrarLecturas(db, tramo(30_000, 11, 10.01));
  expect(r).toBeNull();
  expect((await obtenerMoto(db)).odometroTotalKm).toBeCloseTo(0.2, 3);
});

it('si la app se cierra a mitad, al volver se retoma el mismo viaje sin perder km', async () => {
  const v = await comenzarRastreo(db);
  await registrarLecturas(db, tramo(0, 11)); // 200 m
  // "Reabrir la app": comenzar de nuevo devuelve el mismo viaje y conserva el odómetro
  const v2 = await comenzarRastreo(db);
  expect(v2.id).toBe(v.id);
  expect((await obtenerEstadoRastreo(db))?.distanciaKm).toBeCloseTo(0.2, 3);
  await registrarLecturas(db, tramo(22_000, 11, 10 + 220 / 111_195));
  const fin = await terminarRastreo(db);
  expect(fin?.distanciaKm).toBeCloseTo(0.42, 2);
});

it('respeta el filtro configurado en Ajustes', async () => {
  await guardarAjustes(db, { filtroVelocidadMinKmh: 50 }); // 36 km/h queda "parado"
  await comenzarRastreo(db);
  const e = await registrarLecturas(db, tramo(0, 11));
  expect(e?.distanciaKm).toBe(0);
});

it('cancelar descarta el viaje sin tocar el odómetro', async () => {
  await comenzarRastreo(db);
  await registrarLecturas(db, tramo(0, 11));
  await cancelarRastreo(db);
  expect(await obtenerViajeEnCurso(db)).toBeNull();
  expect(await listarViajes(db)).toHaveLength(0);
  expect((await obtenerMoto(db)).odometroTotalKm).toBe(0);
  expect(await obtenerEstadoRastreo(db)).toBeNull();
});

it('sin rodada iniciada, las lecturas se ignoran', async () => {
  expect(await registrarLecturas(db, tramo(0, 5))).toBeNull();
});

it('guarda el diagnóstico en el viaje y los puntos descartados con su motivo', async () => {
  await comenzarRastreo(db);
  const l = tramo(0, 11);
  l[5] = { ...l[5], precisionM: 90 };
  await registrarLecturas(db, l);
  const fin = await terminarRastreo(db);
  expect(fin?.diagnostico).toMatchObject({ lecturas: 11, descartePrecision: 1 });
  const [guardado] = await listarViajes(db);
  expect(guardado.diagnostico?.lecturas).toBe(11);
  const puntos = await obtenerPuntos(db, guardado.id);
  expect(puntos).toHaveLength(11);
  expect(puntos[5]).toMatchObject({ contado: false, motivo: 'PRECISION' });
});
