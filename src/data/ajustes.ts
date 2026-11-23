import { ahoraIso, Db } from './db';

/**
 * Preferencias del usuario. Se guardan como clave/valor para poder agregar
 * nuevas sin migraciones; aquí se tipan y se les da valor por defecto.
 */
export interface Ajustes {
  /** Precio de la gasolina en Bs por litro. */
  precioLitroBs: number | null;
  /** Bs por 1 USD (tasa oficial BCV). */
  tasaBcv: number | null;
  /** Fecha (ISO) de la tasa según la fuente. */
  tasaBcvFecha: string | null;
  tasaBcvOrigen: 'API' | 'MANUAL' | null;
  /** Actualizar la tasa sola cuando haya internet. */
  tasaAutomatica: boolean;

  notifReserva: boolean;
  notifPiezaAlerta: boolean;
  notifPiezaVencida: boolean;

  filtroVelocidadMinKmh: number;
  filtroPrecisionMaxM: number;

  /** Mostrar mapa (requiere internet para los mosaicos). */
  mapaActivo: boolean;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  precioLitroBs: null,
  tasaBcv: null,
  tasaBcvFecha: null,
  tasaBcvOrigen: null,
  tasaAutomatica: true,
  notifReserva: true,
  notifPiezaAlerta: true,
  notifPiezaVencida: true,
  filtroVelocidadMinKmh: 3,
  filtroPrecisionMaxM: 25,
  mapaActivo: true,
};

type Clave = keyof Ajustes;

function deserializar<K extends Clave>(clave: K, texto: string): Ajustes[K] {
  const defecto = AJUSTES_POR_DEFECTO[clave];
  try {
    const v = JSON.parse(texto);
    if (v === null) return v;
    if (defecto !== null && typeof v !== typeof defecto) return defecto;
    return v;
  } catch {
    return defecto;
  }
}

export async function obtenerAjustes(db: Db): Promise<Ajustes> {
  const filas = await db.getAllAsync<{ clave: string; valor: string }>(
    'SELECT clave, valor FROM ajustes',
    [],
  );
  const resultado: Ajustes = { ...AJUSTES_POR_DEFECTO };
  for (const f of filas) {
    if (f.clave in AJUSTES_POR_DEFECTO) {
      const k = f.clave as Clave;
      (resultado as Record<Clave, unknown>)[k] = deserializar(k, f.valor);
    }
  }
  return resultado;
}

export async function guardarAjustes(db: Db, cambios: Partial<Ajustes>): Promise<void> {
  const ahora = ahoraIso();
  await db.withTransactionAsync(async () => {
    for (const [clave, valor] of Object.entries(cambios)) {
      if (!(clave in AJUSTES_POR_DEFECTO) || valor === undefined) continue;
      await db.runAsync(
        `INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
         ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`,
        [clave, JSON.stringify(valor), ahora],
      );
    }
  });
}
