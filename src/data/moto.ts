import { aBool, ahoraIso, aInt, Db } from './db';

export interface Moto {
  modelo: string;
  anio: number;
  odometroTotalKm: number;
  /** Factor que se usa para estimar (real si hay datos y está activado, si no el de fábrica). */
  factorConsumoLKm: number;
  factorConsumoFabricaLKm: number;
  usarConsumoReal: boolean;
  capacidadTanqueL: number;
  kmAlertaReserva: number;
  odometroUltimoTanqueoKm: number;
  configuracionCompleta: boolean;
}

interface FilaMoto {
  modelo: string;
  anio: number;
  odometro_total_km: number;
  factor_consumo_l_km: number;
  factor_consumo_fabrica_l_km: number;
  usar_consumo_real: number;
  capacidad_tanque_l: number;
  km_alerta_reserva: number;
  odometro_ultimo_tanqueo_km: number;
  configuracion_completa: number;
}

export async function obtenerMoto(db: Db): Promise<Moto> {
  const f = await db.getFirstAsync<FilaMoto>('SELECT * FROM moto WHERE id = 1', []);
  if (!f) throw new Error('La base de datos no está inicializada (falta la fila de la moto).');
  return {
    modelo: f.modelo,
    anio: f.anio,
    odometroTotalKm: f.odometro_total_km,
    factorConsumoLKm: f.factor_consumo_l_km,
    factorConsumoFabricaLKm: f.factor_consumo_fabrica_l_km,
    usarConsumoReal: aBool(f.usar_consumo_real),
    capacidadTanqueL: f.capacidad_tanque_l,
    kmAlertaReserva: f.km_alerta_reserva,
    odometroUltimoTanqueoKm: f.odometro_ultimo_tanqueo_km,
    configuracionCompleta: aBool(f.configuracion_completa),
  };
}

const COLUMNAS: Partial<Record<keyof Moto, string>> = {
  modelo: 'modelo',
  anio: 'anio',
  factorConsumoLKm: 'factor_consumo_l_km',
  usarConsumoReal: 'usar_consumo_real',
  capacidadTanqueL: 'capacidad_tanque_l',
  kmAlertaReserva: 'km_alerta_reserva',
  odometroUltimoTanqueoKm: 'odometro_ultimo_tanqueo_km',
};

/**
 * Actualiza datos generales. El odómetro NO se cambia aquí: usar
 * `corregirOdometro` para que quede registrado en la bitácora.
 */
export async function actualizarMoto(
  db: Db,
  cambios: Partial<Omit<Moto, 'odometroTotalKm' | 'configuracionCompleta' | 'factorConsumoFabricaLKm'>>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  for (const [k, v] of Object.entries(cambios)) {
    const col = COLUMNAS[k as keyof Moto];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(typeof v === 'boolean' ? aInt(v) : (v as string | number));
  }
  if (sets.length === 0) return;
  sets.push('actualizado_en = ?');
  params.push(ahoraIso());
  await db.runAsync(`UPDATE moto SET ${sets.join(', ')} WHERE id = 1`, params);
}

/**
 * Corrige el odómetro (por ejemplo, para igualarlo al tablero de la moto) y lo
 * deja registrado. Como el desgaste de cada pieza se calcula desde el odómetro,
 * la corrección se refleja también en las piezas.
 */
export async function corregirOdometro(db: Db, nuevoKm: number, motivo: string | null): Promise<void> {
  if (!Number.isFinite(nuevoKm) || nuevoKm < 0) throw new Error('Odómetro inválido.');
  await db.withTransactionAsync(async () => {
    const m = await obtenerMoto(db);
    await db.runAsync(
      `INSERT INTO ajuste_odometro (fecha, odometro_anterior_km, odometro_nuevo_km, motivo) VALUES (?, ?, ?, ?)`,
      [ahoraIso(), m.odometroTotalKm, nuevoKm, motivo],
    );
    await db.runAsync('UPDATE moto SET odometro_total_km = ?, actualizado_en = ? WHERE id = 1', [
      nuevoKm,
      ahoraIso(),
    ]);
  });
}

export interface ConfiguracionInicial {
  /** Lo que marca el tablero de la moto hoy. */
  odometroActualKm: number;
  /** Km recorridos desde el último llenado de tanque (0 si acabas de llenar). */
  kmDesdeUltimoTanqueo: number;
  /** Para cada pieza, cuántos km lleva desde su último servicio. Las omitidas quedan en 0. */
  kmDesdeServicioPorPieza: Record<string, number>;
  /** Fecha (aaaa-mm-dd) del último servicio de cada pieza, si se conoce. */
  fechaServicioPorPieza?: Record<string, string>;
}

/**
 * Asistente de primer uso: fija el odómetro real y el estado de cada pieza.
 * Puede repetirse; deja un registro inicial en el historial de cada pieza.
 */
export async function aplicarConfiguracionInicial(db: Db, c: ConfiguracionInicial): Promise<void> {
  const odo = c.odometroActualKm;
  if (!Number.isFinite(odo) || odo < 0) throw new Error('Odómetro inválido.');
  const ahora = ahoraIso();

  await db.withTransactionAsync(async () => {
    const m = await obtenerMoto(db);
    if (m.odometroTotalKm !== odo) {
      await db.runAsync(
        `INSERT INTO ajuste_odometro (fecha, odometro_anterior_km, odometro_nuevo_km, motivo) VALUES (?, ?, ?, ?)`,
        [ahora, m.odometroTotalKm, odo, 'Configuración inicial'],
      );
    }
    await db.runAsync(
      `UPDATE moto SET odometro_total_km = ?, odometro_ultimo_tanqueo_km = ?, configuracion_completa = 1,
                       actualizado_en = ? WHERE id = 1`,
      [odo, Math.max(0, odo - Math.max(0, c.kmDesdeUltimoTanqueo)), ahora],
    );

    const piezas = await db.getAllAsync<{ id: string }>('SELECT id FROM pieza_monitoreo', []);
    for (const { id } of piezas) {
      const kmDesde = Math.max(0, c.kmDesdeServicioPorPieza[id] ?? 0);
      const odoCambio = Math.max(0, odo - kmDesde);
      const fecha = c.fechaServicioPorPieza?.[id] ?? null;
      await db.runAsync(
        `UPDATE pieza_monitoreo SET odometro_ultimo_cambio_km = ?, fecha_ultimo_cambio = ?,
                ultimo_estado_notificado = 'OK' WHERE id = ?`,
        [odoCambio, fecha, id],
      );
      await db.runAsync('DELETE FROM historial_servicio WHERE pieza_id = ? AND es_registro_inicial = 1', [id]);
      await db.runAsync(
        `INSERT INTO historial_servicio
           (pieza_id, fecha_servicio, km_al_momento_servicio, observaciones, es_registro_inicial)
         VALUES (?, ?, ?, ?, 1)`,
        [
          id,
          fecha ?? ahora,
          odoCambio,
          `Estado inicial: ${Math.round(kmDesde)} km desde el último servicio${fecha ? ' (estimado por fecha)' : ''}`,
        ],
      );
    }
  });
}
