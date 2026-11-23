/** Factor de consumo de fábrica de la SBR 150 (spec §1.2): 2,6 L cada 100 km. */
export const FACTOR_CONSUMO_FABRICA_L_KM = 0.026;
export const CAPACIDAD_TANQUE_L = 10;
export const KM_ALERTA_RESERVA = 320;

export function litrosConsumidos(distanciaKm: number, factorLKm: number): number {
  return Math.max(0, distanciaKm) * factorLKm;
}

/** Autonomía total teórica con el tanque lleno. */
export function autonomiaTotalKm(capacidadL: number, factorLKm: number): number {
  return factorLKm > 0 ? capacidadL / factorLKm : 0;
}

export interface EstadoTanque {
  kmDesdeTanqueo: number;
  litrosEstimadosRestantes: number;
  kmRestantesEstimados: number;
  /** 0..1 */
  fraccionRestante: number;
  enReserva: boolean;
}

export function estadoTanque(params: {
  odometroKm: number;
  odometroUltimoTanqueoKm: number;
  capacidadL: number;
  factorLKm: number;
  kmAlertaReserva: number;
}): EstadoTanque {
  const kmDesdeTanqueo = Math.max(0, params.odometroKm - params.odometroUltimoTanqueoKm);
  const gastado = litrosConsumidos(kmDesdeTanqueo, params.factorLKm);
  const restantes = Math.max(0, params.capacidadL - gastado);
  return {
    kmDesdeTanqueo,
    litrosEstimadosRestantes: restantes,
    kmRestantesEstimados: params.factorLKm > 0 ? restantes / params.factorLKm : 0,
    fraccionRestante: params.capacidadL > 0 ? restantes / params.capacidadL : 0,
    enReserva: kmDesdeTanqueo >= params.kmAlertaReserva,
  };
}

export interface TanqueoParaCalculo {
  odometroKm: number;
  litros: number;
  tanqueLleno: boolean;
}

/**
 * Consumo real (L/km) por el método "tanque lleno a tanque lleno".
 *
 * Toma los tanqueos ordenados por odómetro. Entre dos llenados completos suma
 * todos los litros cargados después del primero (incluidos los parciales y el
 * llenado final) y los divide entre los km recorridos.
 *
 * Usa solo los últimos `maxCiclos` ciclos para reflejar el estado reciente de
 * la moto. Devuelve null si no hay al menos un ciclo completo y razonable.
 */
export function consumoRealLKm(
  tanqueos: TanqueoParaCalculo[],
  opciones: { maxCiclos?: number; kmMinimosPorCiclo?: number } = {},
): number | null {
  const maxCiclos = opciones.maxCiclos ?? 5;
  const kmMinimos = opciones.kmMinimosPorCiclo ?? 50;
  const orden = [...tanqueos].sort((a, b) => a.odometroKm - b.odometroKm);

  const ciclos: { km: number; litros: number }[] = [];
  let inicio: TanqueoParaCalculo | null = null;
  let litrosAcumulados = 0;

  for (const t of orden) {
    if (inicio == null) {
      if (t.tanqueLleno) inicio = t;
      continue;
    }
    litrosAcumulados += t.litros;
    if (t.tanqueLleno) {
      const km = t.odometroKm - inicio.odometroKm;
      if (km >= kmMinimos && litrosAcumulados > 0) ciclos.push({ km, litros: litrosAcumulados });
      inicio = t;
      litrosAcumulados = 0;
    }
  }

  const recientes = ciclos.slice(-maxCiclos);
  if (recientes.length === 0) return null;
  const km = recientes.reduce((s, c) => s + c.km, 0);
  const litros = recientes.reduce((s, c) => s + c.litros, 0);
  return litros / km;
}
