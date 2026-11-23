/** Radio medio de la Tierra en km (especificación §2.1). */
export const RADIO_TIERRA_KM = 6371;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

export interface Coordenada {
  lat: number;
  lon: number;
}

/**
 * Distancia geodésica entre dos coordenadas usando la fórmula de Haversine.
 * Devuelve kilómetros.
 */
export function haversineKm(a: Coordenada, b: Coordenada): number {
  const phi1 = aRadianes(a.lat);
  const phi2 = aRadianes(b.lat);
  const dPhi = aRadianes(b.lat - a.lat);
  const dLambda = aRadianes(b.lon - a.lon);

  const h =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  // min() protege contra errores de redondeo que dejen h ligeramente > 1.
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}
