export type EstadoPieza = 'OK' | 'ALERTA' | 'VENCIDO';

/** Límites del semáforo (spec §2.3). Verde ≤ 75 %, amarillo < 100 %, rojo ≥ 100 %. */
export const UMBRAL_ALERTA_PCT = 75;
export const UMBRAL_VENCIDO_PCT = 100;

export function porcentajeConsumido(kmAcumulados: number, intervaloKm: number): number {
  if (intervaloKm <= 0) return 0;
  return (Math.max(0, kmAcumulados) / intervaloKm) * 100;
}

export function estadoDesdePorcentaje(pct: number): EstadoPieza {
  if (pct >= UMBRAL_VENCIDO_PCT) return 'VENCIDO';
  if (pct > UMBRAL_ALERTA_PCT) return 'ALERTA';
  return 'OK';
}

export interface ResumenPieza {
  porcentaje: number;
  estado: EstadoPieza;
  /** Negativo si ya se pasó del intervalo. */
  kmRestantes: number;
}

export function resumenPieza(kmAcumulados: number, intervaloKm: number): ResumenPieza {
  const porcentaje = porcentajeConsumido(kmAcumulados, intervaloKm);
  return {
    porcentaje,
    estado: estadoDesdePorcentaje(porcentaje),
    kmRestantes: intervaloKm - kmAcumulados,
  };
}

const GRAVEDAD: Record<EstadoPieza, number> = { OK: 0, ALERTA: 1, VENCIDO: 2 };

/** true si `nuevo` es peor que `anterior` (sirve para notificar solo al empeorar). */
export function empeoro(anterior: EstadoPieza, nuevo: EstadoPieza): boolean {
  return GRAVEDAD[nuevo] > GRAVEDAD[anterior];
}
