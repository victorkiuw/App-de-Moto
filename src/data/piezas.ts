import { Categoria, NivelRiesgo } from './catalogo';
import { ahoraIso, aBool, Db } from './db';
import { obtenerMoto } from './moto';
import { empeoro, EstadoPieza, resumenPieza } from '../domain/semaforo';

export interface Pieza {
  id: string;
  nombre: string;
  categoria: Categoria;
  nivelRiesgo: NivelRiesgo;
  accionTecnica: string;
  intervaloKm: number;
  intervaloKmFabrica: number;
  odometroUltimoCambioKm: number;
  fechaUltimoCambio: string | null;
  ultimoEstadoNotificado: EstadoPieza;
  activa: boolean;
  /** Calculados con el odómetro actual. */
  kmAcumulados: number;
  kmRestantes: number;
  porcentaje: number;
  estado: EstadoPieza;
}

interface FilaPieza {
  id: string;
  nombre: string;
  categoria: Categoria;
  nivel_riesgo: NivelRiesgo;
  accion_tecnica: string;
  intervalo_km: number;
  intervalo_km_fabrica: number;
  odometro_ultimo_cambio_km: number;
  fecha_ultimo_cambio: string | null;
  ultimo_estado_notificado: EstadoPieza;
  activa: number;
}

function mapear(f: FilaPieza, odometroKm: number): Pieza {
  // El desgaste se deriva del odómetro: así nunca se desincroniza.
  const kmAcumulados = Math.max(0, odometroKm - f.odometro_ultimo_cambio_km);
  const r = resumenPieza(kmAcumulados, f.intervalo_km);
  return {
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    nivelRiesgo: f.nivel_riesgo,
    accionTecnica: f.accion_tecnica,
    intervaloKm: f.intervalo_km,
    intervaloKmFabrica: f.intervalo_km_fabrica,
    odometroUltimoCambioKm: f.odometro_ultimo_cambio_km,
    fechaUltimoCambio: f.fecha_ultimo_cambio,
    ultimoEstadoNotificado: f.ultimo_estado_notificado,
    activa: aBool(f.activa),
    kmAcumulados,
    kmRestantes: r.kmRestantes,
    porcentaje: r.porcentaje,
    estado: r.estado,
  };
}

export async function listarPiezas(
  db: Db,
  filtro: { categoria?: Categoria; soloActivas?: boolean } = {},
): Promise<Pieza[]> {
  const { odometroTotalKm } = await obtenerMoto(db);
  const where: string[] = [];
  const params: string[] = [];
  if (filtro.categoria) {
    where.push('categoria = ?');
    params.push(filtro.categoria);
  }
  if (filtro.soloActivas ?? true) where.push('activa = 1');
  const filas = await db.getAllAsync<FilaPieza>(
    `SELECT * FROM pieza_monitoreo ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY orden, id`,
    params,
  );
  return filas.map((f) => mapear(f, odometroTotalKm));
}

export async function obtenerPieza(db: Db, id: string): Promise<Pieza | null> {
  const { odometroTotalKm } = await obtenerMoto(db);
  const f = await db.getFirstAsync<FilaPieza>('SELECT * FROM pieza_monitoreo WHERE id = ?', [id]);
  return f ? mapear(f, odometroTotalKm) : null;
}

/** Cambia el intervalo (p. ej. aceite sintético). `null` restaura el de fábrica. */
export async function cambiarIntervalo(db: Db, id: string, intervaloKm: number | null): Promise<void> {
  if (intervaloKm != null && (!Number.isFinite(intervaloKm) || intervaloKm <= 0)) {
    throw new Error('El intervalo debe ser mayor que 0.');
  }
  await db.runAsync(
    `UPDATE pieza_monitoreo SET intervalo_km = COALESCE(?, intervalo_km_fabrica) WHERE id = ?`,
    [intervaloKm, id],
  );
}

export async function activarPieza(db: Db, id: string, activa: boolean): Promise<void> {
  await db.runAsync('UPDATE pieza_monitoreo SET activa = ? WHERE id = ?', [activa ? 1 : 0, id]);
}

export interface NuevoServicio {
  piezaId: string;
  /** ISO; por defecto ahora. */
  fecha?: string;
  /** Odómetro al momento del servicio; por defecto el actual. */
  odometroKm?: number;
  observaciones?: string | null;
  costoBs?: number | null;
  tasaBcv?: number | null;
}

/** "Marcar servicio realizado": guarda historial y reinicia el contador de la pieza. */
export async function registrarServicio(db: Db, s: NuevoServicio): Promise<number> {
  let idServicio = 0;
  await db.withTransactionAsync(async () => {
    const moto = await obtenerMoto(db);
    const pieza = await db.getFirstAsync<FilaPieza>('SELECT * FROM pieza_monitoreo WHERE id = ?', [
      s.piezaId,
    ]);
    if (!pieza) throw new Error(`Pieza desconocida: ${s.piezaId}`);

    const odo = s.odometroKm ?? moto.odometroTotalKm;
    if (!Number.isFinite(odo) || odo < 0 || odo > moto.odometroTotalKm) {
      throw new Error('El kilometraje del servicio no puede ser mayor que el odómetro actual.');
    }
    const fecha = s.fecha ?? ahoraIso();
    const kmPieza = Math.max(0, odo - pieza.odometro_ultimo_cambio_km);

    const r = await db.runAsync(
      `INSERT INTO historial_servicio
         (pieza_id, fecha_servicio, km_al_momento_servicio, km_recorridos_pieza, observaciones, costo_bs, tasa_bcv)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.piezaId, fecha, odo, kmPieza, s.observaciones ?? null, s.costoBs ?? null, s.tasaBcv ?? null],
    );
    idServicio = r.lastInsertRowId;

    await db.runAsync(
      `UPDATE pieza_monitoreo SET odometro_ultimo_cambio_km = ?, fecha_ultimo_cambio = ?,
              ultimo_estado_notificado = 'OK' WHERE id = ?`,
      [odo, fecha, s.piezaId],
    );
  });
  return idServicio;
}

export interface ServicioHistorial {
  id: number;
  piezaId: string;
  nombrePieza: string;
  fechaServicio: string;
  kmAlMomentoServicio: number;
  kmRecorridosPieza: number | null;
  observaciones: string | null;
  costoBs: number | null;
  tasaBcv: number | null;
  esRegistroInicial: boolean;
}

export async function listarHistorialServicios(
  db: Db,
  opciones: { piezaId?: string; incluirIniciales?: boolean; limite?: number } = {},
): Promise<ServicioHistorial[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opciones.piezaId) {
    where.push('h.pieza_id = ?');
    params.push(opciones.piezaId);
  }
  if (!opciones.incluirIniciales) where.push('h.es_registro_inicial = 0');
  params.push(opciones.limite ?? 500);
  const filas = await db.getAllAsync<{
    id: number;
    pieza_id: string;
    nombre: string;
    fecha_servicio: string;
    km_al_momento_servicio: number;
    km_recorridos_pieza: number | null;
    observaciones: string | null;
    costo_bs: number | null;
    tasa_bcv: number | null;
    es_registro_inicial: number;
  }>(
    `SELECT h.*, p.nombre FROM historial_servicio h JOIN pieza_monitoreo p ON p.id = h.pieza_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY h.fecha_servicio DESC, h.id DESC LIMIT ?`,
    params,
  );
  return filas.map((f) => ({
    id: f.id,
    piezaId: f.pieza_id,
    nombrePieza: f.nombre,
    fechaServicio: f.fecha_servicio,
    kmAlMomentoServicio: f.km_al_momento_servicio,
    kmRecorridosPieza: f.km_recorridos_pieza,
    observaciones: f.observaciones,
    costoBs: f.costo_bs,
    tasaBcv: f.tasa_bcv,
    esRegistroInicial: aBool(f.es_registro_inicial),
  }));
}

/**
 * Piezas cuyo estado empeoró desde la última notificación. Las marca como
 * notificadas para no repetir el aviso en cada rodada.
 */
export async function tomarPiezasQueEmpeoraron(db: Db): Promise<Pieza[]> {
  const piezas = await listarPiezas(db);
  const empeoradas = piezas.filter((p) => empeoro(p.ultimoEstadoNotificado, p.estado));
  // También se sincronizan las que mejoraron (p. ej. tras corregir el odómetro hacia abajo),
  // para que vuelvan a avisar si empeoran de nuevo.
  const cambiadas = piezas.filter((p) => p.estado !== p.ultimoEstadoNotificado);
  if (cambiadas.length) {
    await db.withTransactionAsync(async () => {
      for (const p of cambiadas) {
        await db.runAsync('UPDATE pieza_monitoreo SET ultimo_estado_notificado = ? WHERE id = ?', [
          p.estado,
          p.id,
        ]);
      }
    });
  }
  return empeoradas;
}
