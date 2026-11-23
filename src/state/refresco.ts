import { create } from 'zustand';

/**
 * Señal global de "los datos cambiaron". Las pantallas la usan como dependencia
 * para volver a leer SQLite tras un viaje, un servicio o un tanqueo.
 */
interface EstadoRefresco {
  version: number;
  invalidar: () => void;
}

export const useRefresco = create<EstadoRefresco>((set) => ({
  version: 0,
  invalidar: () => set((s) => ({ version: s.version + 1 })),
}));
