/**
 * Tasa oficial BCV (Bs por USD) desde DolarAPI, gratis y sin clave.
 * El BCV no tiene API oficial; DolarAPI la publica a partir de la fuente oficial.
 * Si falla (sin datos, servicio caído), la app sigue con la última tasa guardada
 * o con la que el usuario escriba a mano.
 */
export const URL_TASA_BCV = 'https://ve.dolarapi.com/v1/dolares/oficial';

export interface TasaBcv {
  bsPorUsd: number;
  /** Fecha de actualización según la fuente (ISO). */
  fecha: string;
}

export function interpretarRespuestaTasa(datos: unknown): TasaBcv {
  if (typeof datos !== 'object' || datos == null) throw new Error('Respuesta de tasa vacía.');
  const d = datos as Record<string, unknown>;
  const candidatos = [d.promedio, d.venta, d.compra];
  const valor = candidatos.find((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (valor == null) throw new Error('La respuesta no trae una tasa válida.');
  const fecha =
    typeof d.fechaActualizacion === 'string' && !Number.isNaN(Date.parse(d.fechaActualizacion))
      ? new Date(d.fechaActualizacion).toISOString()
      : new Date().toISOString();
  return { bsPorUsd: valor, fecha };
}

export async function descargarTasaBcv(timeoutMs = 10_000): Promise<TasaBcv> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), timeoutMs);
  try {
    const r = await fetch(URL_TASA_BCV, { signal: control.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Servicio de tasa respondió ${r.status}.`);
    return interpretarRespuestaTasa(await r.json());
  } finally {
    clearTimeout(t);
  }
}
