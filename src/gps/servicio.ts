/**
 * Encender y apagar el GPS de la rodada, con los permisos que pide Android.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { TAREA_GPS } from './tarea';
import type { Db } from '@/data/db';
import { cancelarRastreo, comenzarRastreo, terminarRastreo } from '@/data/rastreo';
import type { Viaje } from '@/data/viajes';

export type ProblemaPermiso = 'UBICACION_APAGADA' | 'SIN_PERMISO' | 'SIN_PERMISO_SEGUNDO_PLANO';

export class PermisoGpsError extends Error {
  constructor(
    public problema: ProblemaPermiso,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/**
 * Pide lo necesario para medir con la pantalla apagada:
 * 1) ubicación activada, 2) permiso de ubicación, 3) "Permitir todo el tiempo".
 * El permiso de notificaciones se pide pero no es obligatorio.
 */
export async function asegurarPermisos(): Promise<void> {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new PermisoGpsError('UBICACION_APAGADA', 'La ubicación del teléfono está apagada. Actívala para medir la rodada.');
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new PermisoGpsError('SIN_PERMISO', 'La app necesita permiso de ubicación para medir los kilómetros.');
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new PermisoGpsError(
      'SIN_PERMISO_SEGUNDO_PLANO',
      'Para medir con la pantalla apagada, en Permisos → Ubicación elige "Permitir todo el tiempo".',
    );
  }
  try {
    // Android 13+: sin este permiso la notificación fija no se ve (el GPS igual funciona).
    await Notifications.requestPermissionsAsync();
  } catch {
    // No es imprescindible.
  }
}

const OPCIONES_GPS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 2000,
  distanceInterval: 0,
  foregroundService: {
    notificationTitle: 'Rodada en curso',
    notificationBody: 'Midiendo kilómetros con GPS. Toca para abrir la app.',
    notificationColor: '#F5A623',
    killServiceOnDestroy: false,
  },
};

export async function gpsActivo(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TAREA_GPS);
  } catch {
    return false;
  }
}

/** Inicia la rodada (o retoma una que quedó abierta) y enciende el GPS. */
export async function iniciarRodada(db: Db): Promise<Viaje> {
  await asegurarPermisos();
  const viaje = await comenzarRastreo(db);
  try {
    if (!(await gpsActivo())) await Location.startLocationUpdatesAsync(TAREA_GPS, OPCIONES_GPS);
  } catch (e) {
    // Si el GPS no arrancó, no se deja un viaje vacío abierto.
    if (viaje.distanciaKm === 0) await cancelarRastreo(db);
    throw e;
  }
  return viaje;
}

async function apagarGps(): Promise<void> {
  if (await gpsActivo()) await Location.stopLocationUpdatesAsync(TAREA_GPS);
}

/** Apaga el GPS y cierra la rodada sumando los km a la moto. */
export async function finalizarRodada(db: Db): Promise<Viaje | null> {
  await apagarGps();
  return terminarRastreo(db);
}

/** Apaga el GPS y descarta la rodada sin sumar km. */
export async function descartarRodada(db: Db): Promise<void> {
  await apagarGps();
  await cancelarRastreo(db);
}
