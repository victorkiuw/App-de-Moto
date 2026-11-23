import { obtenerAjustes } from './ajustes';
import { ahoraIso, Db } from './db';
import { descartarViaje, finalizarViaje, iniciarViaje, obtenerViaje, obtenerViajeEnCurso, Viaje } from './viajes';
import { FILTRO_POR_DEFECTO, LecturaGps, ParametrosFiltro } from '@/domain/filtro-gps';
import { EstadoRastreo, estadoInicial, procesarLecturas } from '@/domain/rastreo';

/** Estado del odómetro de la rodada en curso, o null si no se está rodando. */
export async function obtenerEstadoRastreo(db: Db): Promise<EstadoRastreo | null> {
  const f = await db.getFirstAsync<{ estado_json: string }>(
    'SELECT estado_json FROM rastreo_estado WHERE id = 1',
    [],
  );
  if (!f) return null;
  try {
    return JSON.parse(f.estado_json) as EstadoRastreo;
  } catch {
    return null;
  }
}

/** Guarda el estado. Debe llamarse dentro de una transacción o sola (es una sentencia). */
async function escribirEstado(db: Db, e: EstadoRastreo): Promise<void> {
  await db.runAsync(
    `INSERT INTO rastreo_estado (id, viaje_id, estado_json, actualizado_en) VALUES (1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET viaje_id = excluded.viaje_id, estado_json = excluded.estado_json,
                                    actualizado_en = excluded.actualizado_en`,
    [e.viajeId, JSON.stringify(e), ahoraIso()],
  );
}

async function parametrosFiltro(db: Db): Promise<ParametrosFiltro> {
  const a = await obtenerAjustes(db);
  return {
    ...FILTRO_POR_DEFECTO,
    velocidadMinimaKmh: a.filtroVelocidadMinKmh,
    precisionMaximaM: a.filtroPrecisionMaxM,
  };
}

/**
 * Empieza (o retoma) la rodada: crea el viaje si no hay uno abierto y deja el
 * odómetro listo. Si ya había estado guardado para ese viaje, lo conserva.
 */
export async function comenzarRastreo(db: Db): Promise<Viaje> {
  const viaje = await iniciarViaje(db);
  const actual = await obtenerEstadoRastreo(db);
  if (!actual || actual.viajeId !== viaje.id) {
    await escribirEstado(db, estadoInicial(viaje.id));
  }
  return viaje;
}

/**
 * Lo que hace la tarea del GPS con cada lote: filtra, suma km, guarda los
 * puntos de la ruta y el avance del viaje, todo en una sola transacción.
 * Si no hay rodada en curso (lecturas tardías tras finalizar), no hace nada.
 */
export async function registrarLecturas(db: Db, lecturas: LecturaGps[]): Promise<EstadoRastreo | null> {
  if (lecturas.length === 0) return obtenerEstadoRastreo(db);
  const params = await parametrosFiltro(db);
  let resultado: EstadoRastreo | null = null;

  await db.withTransactionAsync(async () => {
    const previo = await obtenerEstadoRastreo(db);
    if (!previo) return;
    const viaje = await db.getFirstAsync<{ estado: string }>('SELECT estado FROM viaje WHERE id = ?', [
      previo.viajeId,
    ]);
    if (viaje?.estado !== 'EN_CURSO') return;

    const { estado, puntos } = procesarLecturas(previo, lecturas, params);
    for (const p of puntos) {
      await db.runAsync(
        `INSERT INTO punto_gps (viaje_id, timestamp, lat, lon, altitud_m, precision_m, velocidad_kmh, contado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          estado.viajeId,
          p.lectura.timestamp,
          p.lectura.lat,
          p.lectura.lon,
          p.lectura.altitudM ?? null,
          p.lectura.precisionM,
          p.velocidadKmh,
          p.contado ? 1 : 0,
        ],
      );
    }
    await db.runAsync(
      `UPDATE viaje SET distancia_km = ?, duracion_movimiento_segundos = ?, velocidad_maxima_kmh = ?
       WHERE id = ? AND estado = 'EN_CURSO'`,
      [estado.distanciaKm, Math.round(estado.movimientoSegundos), estado.velocidadMaximaKmh, estado.viajeId],
    );
    await escribirEstado(db, estado);
    resultado = estado;
  });
  return resultado;
}

/** Cierra la rodada: suma los km al odómetro y a las piezas, y borra el estado. */
export async function terminarRastreo(db: Db): Promise<Viaje | null> {
  const estado = await obtenerEstadoRastreo(db);
  const viaje = estado ? await obtenerViaje(db, estado.viajeId) : await obtenerViajeEnCurso(db);
  let cerrado: Viaje | null = null;
  if (viaje && viaje.estado === 'EN_CURSO') {
    cerrado = await finalizarViaje(db, viaje.id, {
      progreso: estado
        ? {
            distanciaKm: estado.distanciaKm,
            duracionMovimientoSegundos: Math.round(estado.movimientoSegundos),
            velocidadMaximaKmh: estado.velocidadMaximaKmh,
          }
        : undefined,
    });
  }
  await db.runAsync('DELETE FROM rastreo_estado WHERE id = 1', []);
  return cerrado;
}

/** Cancela la rodada sin sumar km (se inició por error). */
export async function cancelarRastreo(db: Db): Promise<void> {
  const estado = await obtenerEstadoRastreo(db);
  const viaje = estado ? await obtenerViaje(db, estado.viajeId) : await obtenerViajeEnCurso(db);
  if (viaje) await descartarViaje(db, viaje.id);
  await db.runAsync('DELETE FROM rastreo_estado WHERE id = 1', []);
}
