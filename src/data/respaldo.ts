import { Db, ValorSql } from './db';
import { sembrarDatosIniciales, VERSION_ESQUEMA } from './esquema';

/** Tablas en orden de dependencia (padres primero). */
const TABLAS = [
  'moto',
  'ajustes',
  'pieza_monitoreo',
  'historial_servicio',
  'viaje',
  'punto_gps',
  'tanqueo',
  'ajuste_odometro',
] as const;
type Tabla = (typeof TABLAS)[number];

export const FORMATO_RESPALDO = 'moto-sbr150-respaldo';

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  versionEsquema: number;
  exportadoEn: string;
  incluyePuntosGps: boolean;
  tablas: Partial<Record<Tabla, Record<string, ValorSql>[]>>;
}

/**
 * Exporta toda la información a un objeto JSON-serializable.
 * Los puntos GPS (la ruta de cada viaje) pueden pesar varios MB al mes;
 * se pueden excluir para un respaldo liviano.
 */
export async function exportarRespaldo(
  db: Db,
  opciones: { incluirPuntosGps?: boolean } = {},
): Promise<Respaldo> {
  const incluirPuntos = opciones.incluirPuntosGps ?? true;
  const tablas: Respaldo['tablas'] = {};
  for (const t of TABLAS) {
    if (t === 'punto_gps' && !incluirPuntos) continue;
    tablas[t] = await db.getAllAsync<Record<string, ValorSql>>(`SELECT * FROM ${t}`, []);
  }
  return {
    formato: FORMATO_RESPALDO,
    versionEsquema: VERSION_ESQUEMA,
    exportadoEn: new Date().toISOString(),
    incluyePuntosGps: incluirPuntos,
    tablas,
  };
}

export class RespaldoInvalidoError extends Error {}

export function validarRespaldo(datos: unknown): Respaldo {
  if (typeof datos !== 'object' || datos == null) throw new RespaldoInvalidoError('El archivo no es un respaldo.');
  const r = datos as Partial<Respaldo>;
  if (r.formato !== FORMATO_RESPALDO) throw new RespaldoInvalidoError('El archivo no es un respaldo de esta app.');
  if (typeof r.versionEsquema !== 'number' || r.versionEsquema > VERSION_ESQUEMA) {
    throw new RespaldoInvalidoError('El respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  }
  if (typeof r.tablas !== 'object' || r.tablas == null) throw new RespaldoInvalidoError('El respaldo está vacío.');
  for (const [nombre, filas] of Object.entries(r.tablas)) {
    if (!(TABLAS as readonly string[]).includes(nombre)) {
      throw new RespaldoInvalidoError(`Tabla desconocida en el respaldo: ${nombre}`);
    }
    if (!Array.isArray(filas)) throw new RespaldoInvalidoError(`Datos dañados en la tabla ${nombre}.`);
  }
  if (!r.tablas.moto?.length) throw new RespaldoInvalidoError('Al respaldo le faltan los datos de la moto.');
  return r as Respaldo;
}

/**
 * Reemplaza TODOS los datos por los del respaldo, en una sola transacción:
 * si algo falla, no se pierde nada de lo que había.
 * Si el respaldo no trae puntos GPS, se conservan los actuales de los viajes que sigan existiendo.
 */
export async function importarRespaldo(db: Db, datos: unknown): Promise<void> {
  const r = validarRespaldo(datos);

  await db.withTransactionAsync(async () => {
    const conservarPuntos = !r.incluyePuntosGps;
    for (const t of [...TABLAS].reverse()) {
      if (t === 'punto_gps' && conservarPuntos) continue;
      await db.runAsync(`DELETE FROM ${t}`, []);
    }

    for (const t of TABLAS) {
      const filas = r.tablas[t];
      if (!filas?.length) continue;
      const columnasValidas = new Set(
        (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`, [])).map((c) => c.name),
      );
      for (const fila of filas) {
        const cols = Object.keys(fila).filter((c) => columnasValidas.has(c));
        if (cols.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => fila[c] ?? null),
        );
      }
    }

    if (conservarPuntos) {
      await db.runAsync('DELETE FROM punto_gps WHERE viaje_id NOT IN (SELECT id FROM viaje)', []);
    }
  });

  // Si el respaldo es de una versión con menos piezas, se completan las nuevas.
  await sembrarDatosIniciales(db);
}
