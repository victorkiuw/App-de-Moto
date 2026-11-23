import { CATALOGO_SBR150 } from './catalogo';
import { Db } from './db';
import {
  CAPACIDAD_TANQUE_L,
  FACTOR_CONSUMO_FABRICA_L_KM,
  KM_ALERTA_RESERVA,
} from '../domain/combustible';

/**
 * Migraciones versionadas con PRAGMA user_version.
 * Nunca se edita una migración ya publicada: se agrega una nueva al final.
 */
const MIGRACIONES: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE moto (
  id                            INTEGER PRIMARY KEY CHECK (id = 1),
  modelo                        TEXT    NOT NULL,
  anio                          INTEGER NOT NULL,
  odometro_total_km             REAL    NOT NULL DEFAULT 0,
  factor_consumo_l_km           REAL    NOT NULL,
  factor_consumo_fabrica_l_km   REAL    NOT NULL,
  usar_consumo_real             INTEGER NOT NULL DEFAULT 1,
  capacidad_tanque_l            REAL    NOT NULL,
  km_alerta_reserva             REAL    NOT NULL,
  odometro_ultimo_tanqueo_km    REAL    NOT NULL DEFAULT 0,
  configuracion_completa        INTEGER NOT NULL DEFAULT 0,
  creado_en                     TEXT    NOT NULL,
  actualizado_en                TEXT    NOT NULL
);

CREATE TABLE ajustes (
  clave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);

CREATE TABLE viaje (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_inicio                  TEXT    NOT NULL,
  fecha_fin                     TEXT,
  estado                        TEXT    NOT NULL CHECK (estado IN ('EN_CURSO','FINALIZADO','DESCARTADO')),
  origen                        TEXT    NOT NULL CHECK (origen IN ('GPS','MANUAL')),
  distancia_km                  REAL    NOT NULL DEFAULT 0,
  litros_consumidos             REAL    NOT NULL DEFAULT 0,
  duracion_segundos             INTEGER NOT NULL DEFAULT 0,
  duracion_movimiento_segundos  INTEGER NOT NULL DEFAULT 0,
  velocidad_promedio_kmh        REAL    NOT NULL DEFAULT 0,
  velocidad_maxima_kmh          REAL    NOT NULL DEFAULT 0,
  factor_consumo_l_km           REAL    NOT NULL,
  precio_litro_bs               REAL,
  tasa_bcv                      REAL,
  costo_bs                      REAL,
  odometro_inicio_km            REAL,
  odometro_fin_km               REAL,
  notas                         TEXT
);
CREATE INDEX idx_viaje_fecha ON viaje (fecha_inicio);
CREATE INDEX idx_viaje_estado ON viaje (estado);

CREATE TABLE punto_gps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  viaje_id       INTEGER NOT NULL REFERENCES viaje (id) ON DELETE CASCADE,
  timestamp      INTEGER NOT NULL,
  lat            REAL    NOT NULL,
  lon            REAL    NOT NULL,
  altitud_m      REAL,
  precision_m    REAL,
  velocidad_kmh  REAL,
  contado        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_punto_viaje ON punto_gps (viaje_id, timestamp);

CREATE TABLE pieza_monitoreo (
  id                          TEXT    PRIMARY KEY,
  nombre                      TEXT    NOT NULL,
  categoria                   TEXT    NOT NULL CHECK (categoria IN ('MOTOR','TRACCION','FRENOS','CHASIS')),
  nivel_riesgo                TEXT    NOT NULL CHECK (nivel_riesgo IN ('CORTO','MEDIO','CRITICO','LARGO')),
  accion_tecnica              TEXT    NOT NULL,
  intervalo_km                REAL    NOT NULL CHECK (intervalo_km > 0),
  intervalo_km_fabrica        REAL    NOT NULL,
  odometro_ultimo_cambio_km   REAL    NOT NULL DEFAULT 0,
  fecha_ultimo_cambio         TEXT,
  ultimo_estado_notificado    TEXT    NOT NULL DEFAULT 'OK',
  activa                      INTEGER NOT NULL DEFAULT 1,
  orden                       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE historial_servicio (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  pieza_id                TEXT    NOT NULL REFERENCES pieza_monitoreo (id) ON DELETE CASCADE,
  fecha_servicio          TEXT    NOT NULL,
  km_al_momento_servicio  REAL    NOT NULL,
  km_recorridos_pieza     REAL,
  observaciones           TEXT,
  costo_bs                REAL,
  tasa_bcv                REAL,
  es_registro_inicial     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_servicio_pieza ON historial_servicio (pieza_id, fecha_servicio);

CREATE TABLE tanqueo (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha            TEXT    NOT NULL,
  odometro_km      REAL    NOT NULL,
  litros           REAL    NOT NULL CHECK (litros > 0),
  precio_litro_bs  REAL,
  costo_bs         REAL,
  tasa_bcv         REAL,
  tanque_lleno     INTEGER NOT NULL DEFAULT 1,
  notas            TEXT
);
CREATE INDEX idx_tanqueo_odometro ON tanqueo (odometro_km);

CREATE TABLE ajuste_odometro (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha                 TEXT NOT NULL,
  odometro_anterior_km  REAL NOT NULL,
  odometro_nuevo_km     REAL NOT NULL,
  motivo                TEXT
);
`,
  },
];

export const VERSION_ESQUEMA = MIGRACIONES[MIGRACIONES.length - 1].version;

/** Abre la BD: pragmas, migraciones pendientes y datos iniciales. Idempotente. */
export async function inicializarBaseDatos(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let actual = fila?.user_version ?? 0;

  for (const m of MIGRACIONES) {
    if (m.version <= actual) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    actual = m.version;
  }

  await sembrarDatosIniciales(db);
}

/**
 * Inserta la fila de la moto y el catálogo de piezas si faltan.
 * Usa INSERT OR IGNORE: no pisa intervalos que el usuario haya editado, y si en
 * una versión futura se agregan piezas al catálogo, aparecen solas.
 */
export async function sembrarDatosIniciales(db: Db): Promise<void> {
  const ahora = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR IGNORE INTO moto
         (id, modelo, anio, factor_consumo_l_km, factor_consumo_fabrica_l_km,
          capacidad_tanque_l, km_alerta_reserva, creado_en, actualizado_en)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Bera SBR 150',
        2024,
        FACTOR_CONSUMO_FABRICA_L_KM,
        FACTOR_CONSUMO_FABRICA_L_KM,
        CAPACIDAD_TANQUE_L,
        KM_ALERTA_RESERVA,
        ahora,
        ahora,
      ],
    );

    for (const [i, p] of CATALOGO_SBR150.entries()) {
      await db.runAsync(
        `INSERT OR IGNORE INTO pieza_monitoreo
           (id, nombre, categoria, nivel_riesgo, accion_tecnica, intervalo_km, intervalo_km_fabrica, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.nombre, p.categoria, p.riesgo, p.accion, p.intervaloKm, p.intervaloKm, i],
      );
    }
  });
}
