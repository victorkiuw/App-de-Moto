import { obtenerAjustes } from './ajustes';
import { ahoraIso, Db } from './db';
import { obtenerMoto } from './moto';
import { litrosConsumidos } from '../domain/combustible';
import { costoCombustibleBs } from '../domain/moneda';
import type { DiagnosticoGps, MotivoPunto } from '../domain/rastreo';

export type EstadoViaje = 'EN_CURSO' | 'FINALIZADO' | 'DESCARTADO';
export type OrigenViaje = 'GPS' | 'MANUAL';

export interface Viaje {
  id: number;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoViaje;
  origen: OrigenViaje;
  distanciaKm: number;
  litrosConsumidos: number;
  duracionSegundos: number;
  duracionMovimientoSegundos: number;
  velocidadPromedioKmh: number;
  velocidadMaximaKmh: number;
  factorConsumoLKm: number;
  precioLitroBs: number | null;
  tasaBcv: number | null;
  costoBs: number | null;
  odometroInicioKm: number | null;
  odometroFinKm: number | null;
  notas: string | null;
  /** Cómo se comportó el GPS (solo rodadas GPS desde la v0.2.1). */
  diagnostico: DiagnosticoGps | null;
}

interface FilaViaje {
  id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: EstadoViaje;
  origen: OrigenViaje;
  distancia_km: number;
  litros_consumidos: number;
  duracion_segundos: number;
  duracion_movimiento_segundos: number;
  velocidad_promedio_kmh: number;
  velocidad_maxima_kmh: number;
  factor_consumo_l_km: number;
  precio_litro_bs: number | null;
  tasa_bcv: number | null;
  costo_bs: number | null;
  odometro_inicio_km: number | null;
  odometro_fin_km: number | null;
  notas: string | null;
  diagnostico_json?: string | null;
}

function leerDiagnostico(json: string | null | undefined): DiagnosticoGps | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DiagnosticoGps;
  } catch {
    return null;
  }
}

const mapear = (f: FilaViaje): Viaje => ({
  id: f.id,
  fechaInicio: f.fecha_inicio,
  fechaFin: f.fecha_fin,
  estado: f.estado,
  origen: f.origen,
  distanciaKm: f.distancia_km,
  litrosConsumidos: f.litros_consumidos,
  duracionSegundos: f.duracion_segundos,
  duracionMovimientoSegundos: f.duracion_movimiento_segundos,
  velocidadPromedioKmh: f.velocidad_promedio_kmh,
  velocidadMaximaKmh: f.velocidad_maxima_kmh,
  factorConsumoLKm: f.factor_consumo_l_km,
  precioLitroBs: f.precio_litro_bs,
  tasaBcv: f.tasa_bcv,
  costoBs: f.costo_bs,
  odometroInicioKm: f.odometro_inicio_km,
  odometroFinKm: f.odometro_fin_km,
  notas: f.notas,
  diagnostico: leerDiagnostico(f.diagnostico_json),
});

export async function obtenerViaje(db: Db, id: number): Promise<Viaje | null> {
  const f = await db.getFirstAsync<FilaViaje>('SELECT * FROM viaje WHERE id = ?', [id]);
  return f ? mapear(f) : null;
}

/** El viaje que quedó abierto (sirve para recuperarlo si la app se cerró). */
export async function obtenerViajeEnCurso(db: Db): Promise<Viaje | null> {
  const f = await db.getFirstAsync<FilaViaje>(
    "SELECT * FROM viaje WHERE estado = 'EN_CURSO' ORDER BY id DESC LIMIT 1",
    [],
  );
  return f ? mapear(f) : null;
}

/** Inicia una rodada. Si ya hay una en curso, la devuelve en lugar de crear otra. */
export async function iniciarViaje(db: Db, fechaInicio: string = ahoraIso()): Promise<Viaje> {
  const abierto = await obtenerViajeEnCurso(db);
  if (abierto) return abierto;
  const moto = await obtenerMoto(db);
  const r = await db.runAsync(
    `INSERT INTO viaje (fecha_inicio, estado, origen, factor_consumo_l_km, odometro_inicio_km)
     VALUES (?, 'EN_CURSO', 'GPS', ?, ?)`,
    [fechaInicio, moto.factorConsumoLKm, moto.odometroTotalKm],
  );
  return (await obtenerViaje(db, r.lastInsertRowId))!;
}

export interface PuntoNuevo {
  timestamp: number;
  lat: number;
  lon: number;
  altitudM: number | null;
  precisionM: number | null;
  velocidadKmh: number | null;
  /** true si este punto sumó distancia al odómetro. */
  contado: boolean;
  /** Por qué se aceptó o descartó (null en puntos anteriores a la v0.2.1). */
  motivo?: MotivoPunto | null;
}

export async function agregarPuntos(db: Db, viajeId: number, puntos: PuntoNuevo[]): Promise<void> {
  if (puntos.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const p of puntos) {
      await db.runAsync(
        `INSERT INTO punto_gps (viaje_id, timestamp, lat, lon, altitud_m, precision_m, velocidad_kmh, contado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [viajeId, p.timestamp, p.lat, p.lon, p.altitudM, p.precisionM, p.velocidadKmh, p.contado ? 1 : 0],
      );
    }
  });
}

export interface PuntoGps extends PuntoNuevo {
  id: number;
}

export async function obtenerPuntos(db: Db, viajeId: number): Promise<PuntoGps[]> {
  const filas = await db.getAllAsync<{
    id: number;
    timestamp: number;
    lat: number;
    lon: number;
    altitud_m: number | null;
    precision_m: number | null;
    velocidad_kmh: number | null;
    contado: number;
    motivo: MotivoPunto | null;
  }>('SELECT * FROM punto_gps WHERE viaje_id = ? ORDER BY timestamp', [viajeId]);
  return filas.map((f) => ({
    id: f.id,
    timestamp: f.timestamp,
    lat: f.lat,
    lon: f.lon,
    altitudM: f.altitud_m,
    precisionM: f.precision_m,
    velocidadKmh: f.velocidad_kmh,
    contado: f.contado === 1,
    motivo: f.motivo,
  }));
}

export interface ProgresoViaje {
  distanciaKm: number;
  duracionMovimientoSegundos: number;
  velocidadMaximaKmh: number;
}

/** Guarda el avance mientras se rueda, para no perder km si la app se cierra. */
export async function guardarProgreso(db: Db, viajeId: number, p: ProgresoViaje): Promise<void> {
  await db.runAsync(
    `UPDATE viaje SET distancia_km = ?, duracion_movimiento_segundos = ?, velocidad_maxima_kmh = ?
     WHERE id = ? AND estado = 'EN_CURSO'`,
    [p.distanciaKm, p.duracionMovimientoSegundos, p.velocidadMaximaKmh, viajeId],
  );
}

/**
 * Cierra la rodada: calcula litros y costo, y suma los km al odómetro general.
 * Como el desgaste de las piezas se deriva del odómetro, quedan actualizadas solas.
 */
export async function finalizarViaje(
  db: Db,
  viajeId: number,
  opciones: { fechaFin?: string; progreso?: ProgresoViaje } = {},
): Promise<Viaje> {
  await db.withTransactionAsync(async () => {
    const v = await obtenerViaje(db, viajeId);
    if (!v) throw new Error(`Viaje ${viajeId} no existe.`);
    if (v.estado !== 'EN_CURSO') throw new Error(`El viaje ${viajeId} ya estaba cerrado.`);

    const p = opciones.progreso ?? {
      distanciaKm: v.distanciaKm,
      duracionMovimientoSegundos: v.duracionMovimientoSegundos,
      velocidadMaximaKmh: v.velocidadMaximaKmh,
    };
    const fechaFin = opciones.fechaFin ?? ahoraIso();
    const duracion = Math.max(
      0,
      Math.round((Date.parse(fechaFin) - Date.parse(v.fechaInicio)) / 1000),
    );
    const horasMov = p.duracionMovimientoSegundos / 3600;
    const velProm = horasMov > 0 ? p.distanciaKm / horasMov : 0;

    const moto = await obtenerMoto(db);
    const ajustes = await obtenerAjustes(db);
    const litros = litrosConsumidos(p.distanciaKm, v.factorConsumoLKm);
    const costo =
      ajustes.precioLitroBs != null ? costoCombustibleBs(litros, ajustes.precioLitroBs) : null;
    const odoFin = moto.odometroTotalKm + p.distanciaKm;

    await db.runAsync(
      `UPDATE viaje SET estado = 'FINALIZADO', fecha_fin = ?, distancia_km = ?, litros_consumidos = ?,
              duracion_segundos = ?, duracion_movimiento_segundos = ?, velocidad_promedio_kmh = ?,
              velocidad_maxima_kmh = ?, precio_litro_bs = ?, tasa_bcv = ?, costo_bs = ?,
              odometro_inicio_km = ?, odometro_fin_km = ?
       WHERE id = ?`,
      [
        fechaFin,
        p.distanciaKm,
        litros,
        duracion,
        p.duracionMovimientoSegundos,
        velProm,
        p.velocidadMaximaKmh,
        ajustes.precioLitroBs,
        ajustes.tasaBcv,
        costo,
        moto.odometroTotalKm,
        odoFin,
        viajeId,
      ],
    );
    await db.runAsync('UPDATE moto SET odometro_total_km = ?, actualizado_en = ? WHERE id = 1', [
      odoFin,
      ahoraIso(),
    ]);
  });
  return (await obtenerViaje(db, viajeId))!;
}

/** Cancela una rodada sin sumar km (p. ej. se inició por error). */
export async function descartarViaje(db: Db, viajeId: number): Promise<void> {
  await db.runAsync(
    "UPDATE viaje SET estado = 'DESCARTADO', fecha_fin = ? WHERE id = ? AND estado = 'EN_CURSO'",
    [ahoraIso(), viajeId],
  );
}

/** Para cuando se olvidó iniciar la rodada: carga km a mano. */
export async function registrarViajeManual(
  db: Db,
  datos: { distanciaKm: number; fecha?: string; notas?: string | null },
): Promise<Viaje> {
  if (!Number.isFinite(datos.distanciaKm) || datos.distanciaKm <= 0) {
    throw new Error('La distancia debe ser mayor que 0.');
  }
  let id = 0;
  await db.withTransactionAsync(async () => {
    const moto = await obtenerMoto(db);
    const ajustes = await obtenerAjustes(db);
    const fecha = datos.fecha ?? ahoraIso();
    const litros = litrosConsumidos(datos.distanciaKm, moto.factorConsumoLKm);
    const costo =
      ajustes.precioLitroBs != null ? costoCombustibleBs(litros, ajustes.precioLitroBs) : null;
    const odoFin = moto.odometroTotalKm + datos.distanciaKm;
    const r = await db.runAsync(
      `INSERT INTO viaje (fecha_inicio, fecha_fin, estado, origen, distancia_km, litros_consumidos,
                          factor_consumo_l_km, precio_litro_bs, tasa_bcv, costo_bs,
                          odometro_inicio_km, odometro_fin_km, notas)
       VALUES (?, ?, 'FINALIZADO', 'MANUAL', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha,
        fecha,
        datos.distanciaKm,
        litros,
        moto.factorConsumoLKm,
        ajustes.precioLitroBs,
        ajustes.tasaBcv,
        costo,
        moto.odometroTotalKm,
        odoFin,
        datos.notas ?? null,
      ],
    );
    id = r.lastInsertRowId;
    await db.runAsync('UPDATE moto SET odometro_total_km = ?, actualizado_en = ? WHERE id = 1', [
      odoFin,
      ahoraIso(),
    ]);
  });
  return (await obtenerViaje(db, id))!;
}

export async function listarViajes(
  db: Db,
  opciones: { desde?: string; hasta?: string; limite?: number } = {},
): Promise<Viaje[]> {
  const where = ["estado = 'FINALIZADO'"];
  const params: (string | number)[] = [];
  if (opciones.desde) {
    where.push('fecha_inicio >= ?');
    params.push(opciones.desde);
  }
  if (opciones.hasta) {
    where.push('fecha_inicio < ?');
    params.push(opciones.hasta);
  }
  params.push(opciones.limite ?? 200);
  const filas = await db.getAllAsync<FilaViaje>(
    `SELECT * FROM viaje WHERE ${where.join(' AND ')} ORDER BY fecha_inicio DESC LIMIT ?`,
    params,
  );
  return filas.map(mapear);
}

export interface ResumenPeriodo {
  viajes: number;
  distanciaKm: number;
  litros: number;
  costoBs: number;
}

/** Totales entre dos fechas ISO [desde, hasta). */
export async function resumenPeriodo(db: Db, desde: string, hasta: string): Promise<ResumenPeriodo> {
  const f = await db.getFirstAsync<{ n: number; km: number | null; l: number | null; bs: number | null }>(
    `SELECT COUNT(*) AS n, SUM(distancia_km) AS km, SUM(litros_consumidos) AS l, SUM(costo_bs) AS bs
     FROM viaje WHERE estado = 'FINALIZADO' AND fecha_inicio >= ? AND fecha_inicio < ?`,
    [desde, hasta],
  );
  return { viajes: f?.n ?? 0, distanciaKm: f?.km ?? 0, litros: f?.l ?? 0, costoBs: f?.bs ?? 0 };
}
