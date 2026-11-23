import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { descartarRodada, finalizarRodada, gpsActivo, iniciarRodada } from './servicio';
import { obtenerEstadoRastreo } from '@/data/rastreo';
import { useDb } from '@/data/use-db';
import { obtenerViajeEnCurso, Viaje } from '@/data/viajes';
import type { EstadoRastreo } from '@/domain/rastreo';
import { useRefresco } from '@/state/refresco';

export interface Rodada {
  viaje: Viaje | null;
  estado: EstadoRastreo | null;
  /** true si el servicio de GPS está encendido. */
  gps: boolean;
  /** Epoch ms del último refresco (sirve como reloj de la pantalla). */
  ahora: number;
}

/**
 * Estado en vivo de la rodada para el Cockpit. Lee la BD cada segundo mientras
 * la pantalla está visible: la tarea del GPS es la que escribe.
 */
export function useRodada() {
  const db = useDb();
  const invalidar = useRefresco((s) => s.invalidar);
  const [rodada, setRodada] = useState<Rodada>(() => ({ viaje: null, estado: null, gps: false, ahora: Date.now() }));
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    const [viaje, estado, gps] = await Promise.all([obtenerViajeEnCurso(db), obtenerEstadoRastreo(db), gpsActivo()]);
    setRodada({ viaje, estado, gps, ahora: Date.now() });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      const tick = () => {
        if (vivo) leer().catch(() => undefined);
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => {
        vivo = false;
        clearInterval(id);
      };
    }, [leer]),
  );

  const conOcupado = useCallback(
    async <T,>(accion: () => Promise<T>): Promise<T> => {
      setOcupado(true);
      try {
        return await accion();
      } finally {
        setOcupado(false);
        await leer().catch(() => undefined);
        invalidar();
      }
    },
    [leer, invalidar],
  );

  return {
    rodada,
    ocupado,
    iniciar: () => conOcupado(() => iniciarRodada(db)),
    finalizar: () => conOcupado(() => finalizarRodada(db)),
    descartar: () => conOcupado(() => descartarRodada(db)),
  };
}
