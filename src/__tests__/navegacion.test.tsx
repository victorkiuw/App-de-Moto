/**
 * Navegación real con expo-router: renderiza las rutas de src/app y simula
 * los toques del usuario. SQLite se reemplaza por la BD en memoria.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { crearDbMemoria } from '@/data/__tests__/db-memoria';
import type { Db } from '@/data/db';

let mockDb: Db;

jest.mock('expo-sqlite', () => ({
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
  useSQLiteContext: () => mockDb,
}));

beforeEach(async () => {
  mockDb = await crearDbMemoria();
});

// Jest corre desde la raíz del proyecto.
declare const process: { cwd(): string };
const APP = `${process.cwd()}/src/app`;

it('el botón "Configurar mi moto" del Cockpit abre el asistente', async () => {
  await renderRouter(APP, { initialUrl: '/' });
  await fireEvent.press(await screen.findByText('Configurar mi moto'));
  expect(await screen.findByText('Configuración inicial')).toBeTruthy();
  expect(screen).toHavePathname('/configuracion');
});

it('desde Ajustes también se abre el asistente', async () => {
  await renderRouter(APP, { initialUrl: '/ajustes' });
  await fireEvent.press(await screen.findByText('Configurar mi moto'));
  expect(await screen.findByText('Configuración inicial')).toBeTruthy();
});

it('al guardar el asistente vuelve a la pestaña Salud', async () => {
  await renderRouter(APP, { initialUrl: '/configuracion' });
  await fireEvent.changeText(await screen.findByLabelText('Fecha de compra (0 km)'), '18/10/2024');
  await fireEvent.changeText(screen.getByLabelText('Kilometraje de hoy'), '45000');
  await fireEvent.press(screen.getByText('Guardar configuración'));
  expect(await screen.findByText('Salud de la moto')).toBeTruthy();
  expect(screen).toHavePathname('/salud');
});

it('Cancelar vuelve a donde estabas', async () => {
  await renderRouter(APP, { initialUrl: '/' });
  await fireEvent.press(await screen.findByText('Configurar mi moto'));
  await fireEvent.press(await screen.findByText('Cancelar'));
  expect(screen).toHavePathname('/');
});
