/**
 * Formato numérico venezolano: coma decimal y punto de miles.
 * Implementado a mano porque Intl en Hermes/Android puede no traer todos los locales.
 */
export function formatearNumero(valor: number, decimales = 0): string {
  if (!Number.isFinite(valor)) return '—';
  const negativo = valor < 0;
  const [entera, frac] = Math.abs(valor).toFixed(decimales).split('.');
  const conMiles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const texto = frac ? `${conMiles},${frac}` : conMiles;
  return negativo ? `-${texto}` : texto;
}

export const formatearKm = (km: number, decimales = 1) => `${formatearNumero(km, decimales)} km`;
export const formatearLitros = (l: number, decimales = 2) => `${formatearNumero(l, decimales)} L`;
export const formatearBs = (bs: number) => `Bs ${formatearNumero(bs, 2)}`;
export const formatearUsd = (usd: number) => `$${formatearNumero(usd, 2)}`;

/** Segundos → "hh:mm:ss". */
export function formatearDuracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Interpreta texto escrito por el usuario ("1.234,5" o "1234.5") como número. */
export function parsearNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '');
  if (!limpio) return null;
  let normal: string;
  if (limpio.includes(',')) {
    // Formato local: el punto es separador de miles, la coma decimal.
    normal = limpio.replace(/\./g, '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(limpio)) {
    // "1.500" o "12.345.678": puntos de miles sin parte decimal.
    normal = limpio.replace(/\./g, '');
  } else {
    // "0.026", "2.5": punto como separador decimal.
    normal = limpio;
  }
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  return Number(normal);
}
