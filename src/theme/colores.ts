import { useColorScheme } from 'react-native';

import type { EstadoPieza } from '@/domain/semaforo';

/**
 * Paletas de alto contraste para leer bajo el sol.
 * Los colores del semáforo son los mismos en ambos temas para que se reconozcan siempre.
 */
const base = {
  verde: '#1FA84F',
  amarillo: '#F2B705',
  rojo: '#E5322D',
  acento: '#F5A623',
};

export const PALETAS = {
  oscuro: {
    ...base,
    fondo: '#0B0D10',
    superficie: '#171B21',
    borde: '#2C323B',
    texto: '#FFFFFF',
    textoSecundario: '#B7BEC8',
    textoSobreAcento: '#0B0D10',
  },
  claro: {
    ...base,
    fondo: '#FFFFFF',
    superficie: '#F1F3F5',
    borde: '#CED4DA',
    texto: '#000000',
    textoSecundario: '#343A40',
    textoSobreAcento: '#000000',
  },
} as const;

export type Paleta = (typeof PALETAS)[keyof typeof PALETAS];

export function useColores(): Paleta {
  return useColorScheme() === 'light' ? PALETAS.claro : PALETAS.oscuro;
}

export function colorEstado(c: Paleta, e: EstadoPieza): string {
  return e === 'VENCIDO' ? c.rojo : e === 'ALERTA' ? c.amarillo : c.verde;
}
