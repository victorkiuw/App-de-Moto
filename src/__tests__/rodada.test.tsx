/**
 * Rodada completa en el Cockpit con un GPS simulado: permisos, lecturas que
 * llegan a la tarea en segundo plano, pantalla en vivo y cierre del viaje.
 */
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { crearDbMemoria } from '@/data/__tests__/db-memoria';
import type { Db } from '@/data/db';
import { obtenerMoto } from '@/data/moto';
import { listarViajes, obtenerViajeEnCurso } from '@/data/viajes';

// El Cockpit relee la BD cada segundo: las esperas necesitan más del segundo por defecto.
configure({ asyncUtilTimeout: 3000 });

let mockDb: Db;
const mockGps = {
  activo: false,
  fondo: 'granted' as string,
};
type Ejecutor = (b: unknown) => Promise<unknown>;
// La tarea se define al importar el Cockpit (antes que el resto del archivo), por eso se guarda en global.
const tareaGps = () => (globalThis as { __tareaGps?: Ejecutor }).__tareaGps!;

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/data/expo-db', () => ({
  ...jest.requireActual('@/data/expo-db'),
  abrirDbGps: async () => mockDb,
}));
jest.mock('expo-task-manager', () => ({
  isTaskDefined: () => false,
  defineTask: (_: string, fn: unknown) => {
    (globalThis as { __tareaGps?: unknown }).__tareaGps = fn;
  },
}));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasServicesEnabledAsync: async () => true,
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestBackgroundPermissionsAsync: async () => ({ status: mockGps.fondo }),
  hasStartedLocationUpdatesAsync: async () => mockGps.activo,
  startLocationUpdatesAsync: jest.fn(async () => {
    mockGps.activo = true;
  }),
  stopLocationUpdatesAsync: jest.fn(async () => {
    mockGps.activo = false;
  }),
}));
jest.mock('expo-notifications', () => ({ requestPermissionsAsync: async () => ({ status: 'granted' }) }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

// eslint-disable-next-line import/first
import Cockpit from '@/app/(tabs)/index';

/** Lote de lecturas a 36 km/h (20 m cada 2 s), como las entrega Android. */
function lote(t0: number, n: number, lat0: number) {
  return {
    data: {
      locations: Array.from({ length: n }, (_, i) => ({
        timestamp: t0 + i * 2000,
        coords: {
          latitude: lat0 + (i * 20) / 111_195,
          longitude: -66,
          accuracy: 5,
          speed: 10,
          altitude: 900,
          altitudeAccuracy: null,
          heading: 0,
        },
      })),
    },
    error: null,
  };
}

beforeEach(async () => {
  mockDb = await crearDbMemoria();
  mockGps.activo = false;
  mockGps.fondo = 'granted';
});

it('iniciar → recibir GPS → ver km en vivo → finalizar', async () => {
  const alerta = jest.spyOn(Alert, 'alert');
  await render(<Cockpit />);
  await fireEvent.press(await screen.findByText('INICIAR VIAJE'));

  expect(await screen.findByText('FINALIZAR VIAJE')).toBeTruthy();
  expect(mockGps.activo).toBe(true);
  expect(tareaGps()).toBeDefined();

  // Android entrega 2 lotes a la tarea: 50 tramos de 20 m = 1 km
  const t0 = Date.now();
  await act(async () => {
    await tareaGps()(lote(t0, 26, 10));
    await tareaGps()(lote(t0 + 52_000, 25, 10 + (26 * 20) / 111_195));
  });
  expect(await screen.findByText('1,0')).toBeTruthy();
  expect(screen.getByText('● En movimiento')).toBeTruthy();

  // Finalizar: confirma en el diálogo
  alerta.mockImplementationOnce((_t, _m, botones) => {
    botones?.find((b) => b.text === 'Finalizar')?.onPress?.();
  });
  await fireEvent.press(screen.getByText('FINALIZAR VIAJE'));

  await waitFor(async () => expect(await obtenerViajeEnCurso(mockDb)).toBeNull());
  expect(mockGps.activo).toBe(false);
  const moto = await obtenerMoto(mockDb);
  expect(moto.odometroTotalKm).toBeCloseTo(1, 2);
  const [v] = await listarViajes(mockDb);
  expect(v.distanciaKm).toBeCloseTo(1, 2);
  await waitFor(() => expect(alerta).toHaveBeenCalledWith('Rodada guardada', expect.stringContaining('1,0 km')));
  expect(await screen.findByText('INICIAR VIAJE')).toBeTruthy();
});

it('sin "Permitir todo el tiempo" no arranca y explica qué hacer', async () => {
  mockGps.fondo = 'denied';
  const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Cockpit />);
  await fireEvent.press(await screen.findByText('INICIAR VIAJE'));
  await waitFor(() =>
    expect(alerta).toHaveBeenCalledWith('Falta un permiso', expect.stringContaining('Permitir todo el tiempo'), expect.any(Array)),
  );
  expect(mockGps.activo).toBe(false);
  expect(await obtenerViajeEnCurso(mockDb)).toBeNull();
});

it('si Android cerró el GPS, ofrece reanudar sin perder los km', async () => {
  await render(<Cockpit />);
  await fireEvent.press(await screen.findByText('INICIAR VIAJE'));
  await act(async () => {
    await tareaGps()(lote(Date.now(), 11, 10)); // 200 m
  });
  mockGps.activo = false; // el sistema mató el servicio
  expect(await screen.findByText('Reanudar GPS')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reanudar GPS'));
  await waitFor(() => expect(mockGps.activo).toBe(true));
  expect(screen.getByText('0,2')).toBeTruthy();
});

it('descartar no suma km', async () => {
  const alerta = jest.spyOn(Alert, 'alert');
  await render(<Cockpit />);
  await fireEvent.press(await screen.findByText('INICIAR VIAJE'));
  await act(async () => {
    await tareaGps()(lote(Date.now(), 11, 10));
  });
  alerta.mockImplementationOnce((_t, _m, botones) => {
    botones?.find((b) => b.text === 'Descartar')?.onPress?.();
  });
  await fireEvent.press(await screen.findByText('Descartar rodada'));
  expect(await screen.findByText('INICIAR VIAJE')).toBeTruthy();
  expect((await obtenerMoto(mockDb)).odometroTotalKm).toBe(0);
  expect(mockGps.activo).toBe(false);
});
