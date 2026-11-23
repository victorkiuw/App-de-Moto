import { ahoraIso, aBool, Db } from './db';
import { obtenerMoto } from './moto';
import { consumoRealLKm } from '../domain/combustible';

/** Rango plausible para una 150cc; fuera de esto se asume un error al cargar datos. */
const FACTOR_MIN = 0.012; // ~83 km/L
const FACTOR_MAX = 0.06; // ~17 km/L

export interface Tanqueo {
  id: number;
  fecha: string;
  odometroKm: number;
  litros: number;
  precioLitroBs: number | null;
  costoBs: number | null;
  tasaBcv: number | null;
  tanqueLleno: boolean;
  notas: string | null;
}

export interface NuevoTanqueo {
  litros: number;
  tanqueLleno: boolean;
  precioLitroBs?: number | null;
  tasaBcv?: number | null;
  /** Por defecto, el odómetro actual. */
  odometroKm?: number;
  fecha?: string;
  notas?: string | null;
}

/**
 * Registra una carga de gasolina.
 * - Tanque lleno: reinicia el contador de reserva.
 * - Parcial: retrasa el contador lo equivalente a los litros cargados.
 * Después recalcula el consumo real si está activado.
 */
export async function registrarTanqueo(db: Db, t: NuevoTanqueo): Promise<number> {
  if (!Number.isFinite(t.litros) || t.litros <= 0) throw new Error('Los litros deben ser mayores que 0.');
  let id = 0;
  await db.withTransactionAsync(async () => {
    const moto = await obtenerMoto(db);
    const odo = t.odometroKm ?? moto.odometroTotalKm;
    const costo = t.precioLitroBs != null ? t.litros * t.precioLitroBs : null;
    const r = await db.runAsync(
      `INSERT INTO tanqueo (fecha, odometro_km, litros, precio_litro_bs, costo_bs, tasa_bcv, tanque_lleno, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.fecha ?? ahoraIso(),
        odo,
        t.litros,
        t.precioLitroBs ?? null,
        costo,
        t.tasaBcv ?? null,
        t.tanqueLleno ? 1 : 0,
        t.notas ?? null,
      ],
    );
    id = r.lastInsertRowId;

    let nuevaReferencia: number;
    if (t.tanqueLleno) {
      nuevaReferencia = odo;
    } else {
      const kmEquivalentes = t.litros / moto.factorConsumoLKm;
      nuevaReferencia = Math.min(odo, moto.odometroUltimoTanqueoKm + kmEquivalentes);
    }
    await db.runAsync('UPDATE moto SET odometro_ultimo_tanqueo_km = ?, actualizado_en = ? WHERE id = 1', [
      nuevaReferencia,
      ahoraIso(),
    ]);
  });
  await recalcularFactorConsumo(db);
  return id;
}

export async function listarTanqueos(db: Db, limite = 200): Promise<Tanqueo[]> {
  const filas = await db.getAllAsync<{
    id: number;
    fecha: string;
    odometro_km: number;
    litros: number;
    precio_litro_bs: number | null;
    costo_bs: number | null;
    tasa_bcv: number | null;
    tanque_lleno: number;
    notas: string | null;
  }>('SELECT * FROM tanqueo ORDER BY odometro_km DESC, id DESC LIMIT ?', [limite]);
  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    odometroKm: f.odometro_km,
    litros: f.litros,
    precioLitroBs: f.precio_litro_bs,
    costoBs: f.costo_bs,
    tasaBcv: f.tasa_bcv,
    tanqueLleno: aBool(f.tanque_lleno),
    notas: f.notas,
  }));
}

/**
 * Actualiza el factor L/km de la moto: el real (últimos ciclos de tanque lleno)
 * si está activado y hay datos razonables; si no, el de fábrica.
 * Devuelve el factor que quedó.
 */
export async function recalcularFactorConsumo(db: Db): Promise<number> {
  const moto = await obtenerMoto(db);
  let factor = moto.factorConsumoFabricaLKm;
  if (moto.usarConsumoReal) {
    const tanqueos = await listarTanqueos(db, 100);
    const real = consumoRealLKm(tanqueos);
    if (real != null && real >= FACTOR_MIN && real <= FACTOR_MAX) factor = real;
  }
  if (factor !== moto.factorConsumoLKm) {
    await db.runAsync('UPDATE moto SET factor_consumo_l_km = ?, actualizado_en = ? WHERE id = 1', [
      factor,
      ahoraIso(),
    ]);
  }
  return factor;
}
