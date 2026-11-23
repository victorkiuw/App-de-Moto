import {
  debeActualizarReferencia,
  evaluarLectura,
  LecturaGps,
  ParametrosFiltro,
} from './filtro-gps';

/**
 * Estado del odómetro de la rodada en curso. Se guarda en la base de datos
 * después de cada lote de lecturas, para sobrevivir a que Android cierre la app.
 */
export interface EstadoRastreo {
  viajeId: number;
  /** Última lectura usada como punto de partida para medir. */
  referencia: LecturaGps | null;
  /** Saltos imposibles seguidos (si se repiten, la referencia era la mala). */
  saltosSeguidos: number;
  distanciaKm: number;
  /** Segundos en movimiento (sin contar paradas). */
  movimientoSegundos: number;
  velocidadMaximaKmh: number;
  velocidadActualKmh: number;
  /** Precisión de la última lectura, en metros. */
  precisionActualM: number | null;
  /** Epoch ms de la última lectura recibida (válida o no). */
  ultimaLecturaTs: number | null;
  enMovimiento: boolean;
}

export function estadoInicial(viajeId: number): EstadoRastreo {
  return {
    viajeId,
    referencia: null,
    saltosSeguidos: 0,
    distanciaKm: 0,
    movimientoSegundos: 0,
    velocidadMaximaKmh: 0,
    velocidadActualKmh: 0,
    precisionActualM: null,
    ultimaLecturaTs: null,
    enMovimiento: false,
  };
}

/** Con 3 saltos seguidos se asume que el punto de partida era el malo y se reinicia. */
const SALTOS_PARA_REINICIAR = 3;
/** Un hueco mayor (túnel, sin señal) no cuenta como tiempo en movimiento. */
const MAX_SEGUNDOS_ENTRE_LECTURAS = 30;

export interface PuntoProcesado {
  lectura: LecturaGps;
  velocidadKmh: number;
  contado: boolean;
}

/**
 * Pasa un lote de lecturas por el filtro y actualiza el odómetro del viaje.
 * Es una función pura: no toca la BD ni el GPS.
 */
export function procesarLecturas(
  estado: EstadoRastreo,
  lecturas: LecturaGps[],
  params: ParametrosFiltro,
): { estado: EstadoRastreo; puntos: PuntoProcesado[] } {
  const e: EstadoRastreo = { ...estado };
  const puntos: PuntoProcesado[] = [];
  const orden = [...lecturas].sort((a, b) => a.timestamp - b.timestamp);

  for (const l of orden) {
    // Lecturas repetidas o atrasadas (Android a veces reenvía el lote) se ignoran.
    if (e.ultimaLecturaTs != null && l.timestamp <= e.ultimaLecturaTs) continue;
    e.ultimaLecturaTs = l.timestamp;
    e.precisionActualM = l.precisionM;

    const anterior = e.referencia;
    const r = evaluarLectura(anterior, l, params);
    e.velocidadActualKmh = r.velocidadKmh;

    if (r.aceptada && anterior) {
      e.distanciaKm += r.distanciaKm;
      const dt = (l.timestamp - anterior.timestamp) / 1000;
      e.movimientoSegundos += Math.min(dt, MAX_SEGUNDOS_ENTRE_LECTURAS);
      e.velocidadMaximaKmh = Math.max(e.velocidadMaximaKmh, r.velocidadKmh);
      e.enMovimiento = true;
      e.saltosSeguidos = 0;
    } else if (!r.aceptada && r.motivo === 'SALTO') {
      e.saltosSeguidos += 1;
      if (e.saltosSeguidos >= SALTOS_PARA_REINICIAR) {
        e.referencia = l;
        e.saltosSeguidos = 0;
      }
    } else if (!r.aceptada && r.motivo === 'PARADO') {
      e.enMovimiento = false;
      e.saltosSeguidos = 0;
    }

    if (debeActualizarReferencia(r, anterior)) e.referencia = l;

    // Las lecturas imprecisas no se guardan: ensuciarían el mapa de la ruta.
    if (r.aceptada || r.motivo !== 'PRECISION') {
      puntos.push({ lectura: l, velocidadKmh: r.velocidadKmh, contado: r.aceptada });
    }
  }

  return { estado: e, puntos };
}

/** true si hace rato que no llegan lecturas (GPS sin señal o servicio detenido). */
export function sinSenal(estado: EstadoRastreo | null, ahoraMs: number, umbralS = 20): boolean {
  if (!estado?.ultimaLecturaTs) return true;
  return (ahoraMs - estado.ultimaLecturaTs) / 1000 > umbralS;
}
