import { haversineKm } from './geo';

/** Lectura de GPS normalizada (independiente de expo-location). */
export interface LecturaGps {
  lat: number;
  lon: number;
  /** Epoch en milisegundos. */
  timestamp: number;
  /** Radio de incertidumbre horizontal en metros (null si el GPS no lo reporta). */
  precisionM: number | null;
  /** Velocidad reportada por el GPS en m/s (null o negativa si no está disponible). */
  velocidadMs: number | null;
}

export interface ParametrosFiltro {
  /** Por debajo de esta velocidad el odómetro se pausa (spec: 3 km/h). */
  velocidadMinimaKmh: number;
  /** Lecturas con peor precisión que esto se descartan. */
  precisionMaximaM: number;
  /** Saltos que impliquen más de esta velocidad se consideran rebote de señal. */
  velocidadMaximaPlausibleKmh: number;
}

export const FILTRO_POR_DEFECTO: ParametrosFiltro = {
  velocidadMinimaKmh: 3,
  precisionMaximaM: 25,
  velocidadMaximaPlausibleKmh: 160,
};

export type MotivoDescarte = 'PRECISION' | 'PARADO' | 'SALTO' | 'TIEMPO';

export type ResultadoLectura =
  | { aceptada: true; distanciaKm: number; velocidadKmh: number }
  | { aceptada: false; motivo: MotivoDescarte; velocidadKmh: number };

const msAKmh = (ms: number) => ms * 3.6;

/**
 * Decide si una lectura suma distancia al odómetro del viaje.
 *
 * `anterior` es la última lectura ACEPTADA como referencia (o null al iniciar).
 * Cuando la lectura se descarta por estar parado, el llamador puede igualmente
 * usarla como nueva referencia (ver `debeActualizarReferencia`), para que al
 * arrancar de nuevo no se sume el "salto" acumulado durante la parada.
 */
export function evaluarLectura(
  anterior: LecturaGps | null,
  actual: LecturaGps,
  params: ParametrosFiltro = FILTRO_POR_DEFECTO,
): ResultadoLectura {
  const velocidadReportada =
    actual.velocidadMs != null && actual.velocidadMs >= 0 ? msAKmh(actual.velocidadMs) : null;

  if (actual.precisionM != null && actual.precisionM > params.precisionMaximaM) {
    return { aceptada: false, motivo: 'PRECISION', velocidadKmh: velocidadReportada ?? 0 };
  }

  if (anterior == null) {
    // Primera lectura válida: sirve de ancla, no suma distancia.
    return { aceptada: false, motivo: 'PARADO', velocidadKmh: velocidadReportada ?? 0 };
  }

  const dtHoras = (actual.timestamp - anterior.timestamp) / 3_600_000;
  if (dtHoras <= 0) {
    return { aceptada: false, motivo: 'TIEMPO', velocidadKmh: velocidadReportada ?? 0 };
  }

  const distanciaKm = haversineKm(anterior, actual);
  const velocidadCalculada = distanciaKm / dtHoras;
  const velocidadKmh = velocidadReportada ?? velocidadCalculada;

  if (velocidadCalculada > params.velocidadMaximaPlausibleKmh) {
    return { aceptada: false, motivo: 'SALTO', velocidadKmh };
  }

  if (velocidadKmh < params.velocidadMinimaKmh) {
    return { aceptada: false, motivo: 'PARADO', velocidadKmh };
  }

  return { aceptada: true, distanciaKm, velocidadKmh };
}

/**
 * Si la lectura debe pasar a ser la nueva referencia para el siguiente cálculo.
 * Se actualiza en lecturas aceptadas y en paradas; no en ruido (precisión/salto).
 */
export function debeActualizarReferencia(r: ResultadoLectura, anterior: LecturaGps | null): boolean {
  if (r.aceptada) return true;
  if (r.motivo === 'PARADO') return true;
  // Sin referencia previa cualquier lectura con precisión válida sirve de ancla.
  return anterior == null && r.motivo !== 'PRECISION';
}
