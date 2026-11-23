/**
 * Adaptador de pruebas: implementa la interfaz `Db` sobre node:sqlite (Node ≥ 22),
 * para probar el esquema y los repositorios sin un teléfono.
 */
import type { Db, ValorSql } from '../db';
import { inicializarBaseDatos } from '../esquema';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

export async function crearDbMemoria(): Promise<Db & { cerrar(): void }> {
  const nativa = new DatabaseSync(':memory:');
  const db: Db & { cerrar(): void } = {
    async execAsync(sql) {
      nativa.exec(sql);
    },
    async runAsync(sql, params: ValorSql[]) {
      const r = nativa.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(sql: string, params: ValorSql[]) {
      return (nativa.prepare(sql).get(...params) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params: ValorSql[]) {
      return nativa.prepare(sql).all(...params) as T[];
    },
    async withTransactionAsync(tarea) {
      // Igual que expo-sqlite: BEGIN/COMMIT plano. Anidar transacciones falla,
      // así las pruebas detectan ese error antes de llegar al teléfono.
      nativa.exec('BEGIN');
      try {
        await tarea();
        nativa.exec('COMMIT');
      } catch (e) {
        try {
          nativa.exec('ROLLBACK');
        } catch {}
        throw e;
      }
    },
    cerrar() {
      nativa.close();
    },
  };

  await inicializarBaseDatos(db);
  return db;
}
