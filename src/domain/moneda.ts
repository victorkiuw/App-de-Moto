/** Conversión Bs ↔ USD con la tasa oficial BCV (Bs por 1 USD). */

export function bsAUsd(montoBs: number, tasaBsPorUsd: number | null): number | null {
  if (tasaBsPorUsd == null || tasaBsPorUsd <= 0) return null;
  return montoBs / tasaBsPorUsd;
}

export function usdABs(montoUsd: number, tasaBsPorUsd: number | null): number | null {
  if (tasaBsPorUsd == null || tasaBsPorUsd <= 0) return null;
  return montoUsd * tasaBsPorUsd;
}

export function costoCombustibleBs(litros: number, precioLitroBs: number): number {
  return Math.max(0, litros) * Math.max(0, precioLitroBs);
}
