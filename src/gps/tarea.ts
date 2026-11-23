/**
 * Tarea de GPS en segundo plano. Android la ejecuta con cada lote de lecturas,
 * incluso con la pantalla apagada o la app cerrada (gracias al servicio con
 * notificación fija). Por eso se define al cargar el código (ver index.ts),
 * fuera de cualquier pantalla.
 */
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { abrirDbGps } from '@/data/expo-db';
import { registrarLecturas } from '@/data/rastreo';
import type { LecturaGps } from '@/domain/filtro-gps';

export const TAREA_GPS = 'moto-sbr150-gps';

export function aLectura(l: LocationObject): LecturaGps {
  return {
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    timestamp: l.timestamp,
    precisionM: l.coords.accuracy,
    velocidadMs: l.coords.speed,
    altitudM: l.coords.altitude,
  };
}

// Los lotes se procesan de a uno, en orden, aunque Android los mande seguidos.
let cola: Promise<unknown> = Promise.resolve();

export function procesarLote(locations: LocationObject[]): Promise<unknown> {
  const lecturas = locations.filter((l) => !l.mocked).map(aLectura);
  const trabajo = async () => {
    const db = await abrirDbGps();
    await registrarLecturas(db, lecturas);
  };
  cola = cola.then(trabajo, trabajo).catch((e) => {
    console.warn('[GPS] Error guardando lecturas', e);
  });
  return cola;
}

if (!TaskManager.isTaskDefined(TAREA_GPS)) {
  TaskManager.defineTask<{ locations: LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
    if (error) {
      console.warn('[GPS] Error de la tarea', error.message);
      return;
    }
    if (data?.locations?.length) await procesarLote(data.locations);
  });
}
