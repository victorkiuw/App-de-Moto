/**
 * Estimación de kilómetros por fechas, para la configuración inicial cuando no
 * hay odómetro confiable: km ≈ días de uso × km por día, descontando los
 * periodos en que la moto estuvo parada.
 */

export interface Periodo {
  /** ISO (yyyy-mm-dd o fecha completa). */
  desde: string;
  hasta: string;
}

const MS_DIA = 86_400_000;

/** Día calendario (medianoche UTC) de una fecha ISO, para contar días sin líos de horario. */
function dia(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Une periodos que se solapan o tocan y los ordena. */
function unirPeriodos(periodos: Periodo[]): [number, number][] {
  const rangos = periodos
    .map((p) => [dia(p.desde), dia(p.hasta)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0]);
  const unidos: [number, number][] = [];
  for (const r of rangos) {
    const ult = unidos[unidos.length - 1];
    if (ult && r[0] <= ult[1]) ult[1] = Math.max(ult[1], r[1]);
    else unidos.push([...r]);
  }
  return unidos;
}

/**
 * Días de uso entre `desde` y `hasta` (sin contar el día final), restando los
 * días en que la moto estuvo parada (cada periodo parado incluye ambos extremos).
 */
export function diasDeUso(desde: string, hasta: string, parada: Periodo[] = []): number {
  const a = dia(desde);
  const b = dia(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  let dias = (b - a) / MS_DIA;
  for (const [pa, pb] of unirPeriodos(parada)) {
    const ini = Math.max(a, pa);
    const fin = Math.min(b - MS_DIA, pb); // último día contado es b-1
    if (fin >= ini) dias -= (fin - ini) / MS_DIA + 1;
  }
  return Math.max(0, dias);
}

export function estimarKm(
  desde: string,
  hasta: string,
  kmPorSemana: number,
  parada: Periodo[] = [],
): number {
  if (!Number.isFinite(kmPorSemana) || kmPorSemana <= 0) return 0;
  return (diasDeUso(desde, hasta, parada) * kmPorSemana) / 7;
}

/**
 * Lee "dd/mm/aaaa" (también "d/m/aa" o con guiones) y devuelve "aaaa-mm-dd".
 * Devuelve null si la fecha no existe (31/02) o el texto no es una fecha.
 */
export function parsearFechaCorta(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  let a = Number(m[3]);
  if (a < 100) a += 2000;
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** "aaaa-mm-dd" o ISO → "dd/mm/aaaa". */
export function formatearFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Fecha de hoy como "aaaa-mm-dd" en la zona horaria del teléfono. */
export function hoyIsoLocal(ahora: Date = new Date()): string {
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mm}-${dd}`;
}
