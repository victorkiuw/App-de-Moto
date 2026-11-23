/**
 * Interfaz mínima de base de datos que usa toda la capa de datos.
 *
 * `SQLiteDatabase` de expo-sqlite la cumple tal cual. Tenerla separada permite
 * probar migraciones y repositorios en Node (con node:sqlite) sin un teléfono.
 */
export type ValorSql = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: ValorSql[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, params: ValorSql[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: ValorSql[]): Promise<T[]>;
  withTransactionAsync(tarea: () => Promise<void>): Promise<void>;
}

export const ahoraIso = () => new Date().toISOString();
export const aBool = (v: number | null | undefined) => v === 1;
export const aInt = (b: boolean) => (b ? 1 : 0);
