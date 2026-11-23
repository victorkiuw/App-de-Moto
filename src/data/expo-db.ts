import * as SQLite from 'expo-sqlite';

import type { Db, ValorSql } from './db';
import { inicializarBaseDatos } from './esquema';

export const NOMBRE_BD = 'moto-sbr150.db';

/**
 * Adapta una conexión de expo-sqlite a la interfaz `Db`:
 * - Las transacciones de esta conexión van de una en una (cola), para que dos
 *   pantallas o el GPS no mezclen sus BEGIN/COMMIT.
 * - Usa BEGIN IMMEDIATE: toma el permiso de escritura al empezar, así la otra
 *   conexión (la del GPS) espera con busy_timeout en vez de fallar a mitad.
 */
export function adaptarExpo(sqlite: SQLite.SQLiteDatabase): Db {
  let cola: Promise<unknown> = Promise.resolve();

  return {
    execAsync: (sql) => sqlite.execAsync(sql),
    runAsync: (sql, params: ValorSql[]) => sqlite.runAsync(sql, params),
    getFirstAsync: <T>(sql: string, params: ValorSql[]) => sqlite.getFirstAsync<T>(sql, params),
    getAllAsync: <T>(sql: string, params: ValorSql[]) => sqlite.getAllAsync<T>(sql, params),
    withTransactionAsync(tarea) {
      const ejecutar = async () => {
        await sqlite.execAsync('BEGIN IMMEDIATE');
        try {
          await tarea();
          await sqlite.execAsync('COMMIT');
        } catch (e) {
          try {
            await sqlite.execAsync('ROLLBACK');
          } catch {
            // SQLite pudo haber revertido ya; se conserva el error original.
          }
          throw e;
        }
      };
      const resultado = cola.then(ejecutar, ejecutar);
      cola = resultado.catch(() => undefined);
      return resultado;
    },
  };
}

let conexionGps: Promise<Db> | null = null;

/**
 * Conexión propia para la tarea del GPS. La tarea puede correr sin pantallas
 * montadas (Android la despierta con la app cerrada), así que no puede usar
 * la del <SQLiteProvider>.
 */
export function abrirDbGps(): Promise<Db> {
  if (!conexionGps) {
    conexionGps = (async () => {
      const sqlite = await SQLite.openDatabaseAsync(NOMBRE_BD, { useNewConnection: true });
      const db = adaptarExpo(sqlite);
      await inicializarBaseDatos(db);
      return db;
    })().catch((e) => {
      conexionGps = null;
      throw e;
    });
  }
  return conexionGps;
}
