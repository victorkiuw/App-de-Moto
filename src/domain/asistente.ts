import { estimarKm, Periodo } from './estimacion';
import { resumenPieza, ResumenPieza } from './semaforo';

export type ModoPieza = 'ORIGINAL' | 'FECHA' | 'KM' | 'REVISAR';

export interface EntradaPieza {
  modo: ModoPieza;
  /** aaaa-mm-dd, para modo FECHA. */
  fecha?: string;
  /** Para modo KM. */
  km?: number;
}

export interface DatosEstimacion {
  /** aaaa-mm-dd */
  fechaCompra: string;
  kmPorSemana: number;
  paradas: Periodo[];
  odometroKm: number;
}

export interface ResultadoPieza extends ResumenPieza {
  kmDesdeServicio: number;
  /** Fecha del último servicio si se conoce o se deduce (aaaa-mm-dd). */
  fecha: string | null;
  /** true si la estimación por fecha superaba el odómetro y se recortó. */
  recortado: boolean;
}

/**
 * Convierte lo que el usuario contestó sobre una pieza en km desde su último servicio.
 * - ORIGINAL: nunca se cambió → todo el odómetro.
 * - FECHA: días de uso desde esa fecha × ritmo (descontando paradas).
 * - KM: el valor que el usuario sepa.
 * - REVISAR: no se sabe → se marca al 100 % para que se revise.
 */
export function calcularPieza(
  entrada: EntradaPieza,
  intervaloKm: number,
  datos: DatosEstimacion,
  hoy: string,
): ResultadoPieza {
  let km = 0;
  let fecha: string | null = null;
  let recortado = false;

  switch (entrada.modo) {
    case 'ORIGINAL':
      km = datos.odometroKm;
      fecha = datos.fechaCompra;
      break;
    case 'FECHA':
      if (entrada.fecha) {
        km = estimarKm(entrada.fecha, hoy, datos.kmPorSemana, datos.paradas);
        fecha = entrada.fecha;
      }
      break;
    case 'KM':
      km = Math.max(0, entrada.km ?? 0);
      break;
    case 'REVISAR':
      km = intervaloKm;
      break;
  }

  if (km > datos.odometroKm) {
    km = datos.odometroKm;
    recortado = true;
  }
  return { ...resumenPieza(km, intervaloKm), kmDesdeServicio: km, fecha, recortado };
}

/**
 * Odómetro de hoy a partir de una lectura vieja (p. ej. la que quedó congelada
 * al quitar la guaya del velocímetro) más lo rodado desde entonces al ritmo dado.
 */
export function estimarOdometro(
  lecturaKm: number,
  fechaLectura: string,
  hoy: string,
  kmPorSemana: number,
  paradas: Periodo[],
): number {
  return Math.max(0, lecturaKm) + estimarKm(fechaLectura, hoy, kmPorSemana, paradas);
}
