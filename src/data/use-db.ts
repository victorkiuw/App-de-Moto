import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import type { Db } from './db';
import { useRefresco } from '@/state/refresco';

export const NOMBRE_BD = 'moto-sbr150.db';

/** La BD abierta por <SQLiteProvider>, vista con la interfaz de la capa de datos. */
export function useDb(): Db {
  return useSQLiteContext();
}

/**
 * Ejecuta una consulta y la repite cuando alguien llama a `invalidar()` o cambia `clave`
 * (p. ej. el filtro activo). Devuelve `datos` (null mientras carga) y `error`.
 */
export function useConsulta<T>(consulta: (db: Db) => Promise<T>, clave = '') {
  const db = useDb();
  const version = useRefresco((s) => s.version);
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let vigente = true;
    consulta(db)
      .then((d) => {
        if (vigente) {
          setDatos(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      vigente = false;
    };
    // `consulta` suele ser una función nueva en cada render; se relee solo cuando
    // cambia la BD, la versión de datos o la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, clave]);

  return { datos, error };
}
