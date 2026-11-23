/**
 * Exporta los datos crudos del GPS de una rodada a un archivo JSON y abre el
 * menú de compartir de Android (WhatsApp, Drive, correo…). Sirve para revisar
 * por qué una rodada midió de más o de menos.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Db } from '@/data/db';
import { obtenerPuntos, obtenerViaje } from '@/data/viajes';

export async function compartirDatosGps(db: Db, viajeId: number): Promise<void> {
  const viaje = await obtenerViaje(db, viajeId);
  if (!viaje) throw new Error('La rodada no existe.');
  const puntos = await obtenerPuntos(db, viajeId);
  const datos = {
    formato: 'moto-sbr150-gps',
    viaje,
    puntos: puntos.map((p) => ({
      t: p.timestamp,
      lat: p.lat,
      lon: p.lon,
      prec: p.precisionM,
      vel: p.velocidadKmh,
      alt: p.altitudM,
      ok: p.contado,
      motivo: p.motivo ?? null,
    })),
  };
  const archivo = new File(Paths.cache, `rodada-${viajeId}-gps.json`);
  archivo.create({ overwrite: true });
  archivo.write(JSON.stringify(datos));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este teléfono no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/json', dialogTitle: 'Compartir datos GPS' });
}
