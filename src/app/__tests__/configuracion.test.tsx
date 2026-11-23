/**
 * Prueba de la pantalla del asistente: se llena como lo haría el usuario y se
 * verifica lo que quedó guardado en la base de datos (SQLite en memoria).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { crearDbMemoria } from '@/data/__tests__/db-memoria';
import { obtenerAjustes } from '@/data/ajustes';
import { CATALOGO_SBR150 } from '@/data/catalogo';
import type { Db } from '@/data/db';
import { obtenerMoto } from '@/data/moto';
import { listarHistorialServicios, obtenerPieza } from '@/data/piezas';
import { estimarKm, hoyIsoLocal } from '@/domain/estimacion';

let mockDb: Db;

jest.mock('@/data/use-db', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

// eslint-disable-next-line import/first
import Configuracion from '../configuracion';
// eslint-disable-next-line import/first
import { router as mockRouter } from 'expo-router';

const PARADA = [{ desde: '2026-04-26', hasta: '2026-08-03' }];
const iStrBear = CATALOGO_SBR150.findIndex((p) => p.id === 'STR_BEAR');

beforeEach(async () => {
  mockDb = await crearDbMemoria();
  jest.clearAllMocks();
});

async function escribir(etiqueta: string, texto: string, indice = 0) {
  await fireEvent.changeText(screen.getAllByLabelText(etiqueta)[indice], texto);
}

it('carga la moto con estimación por fechas y la guarda', async () => {
  await render(<Configuracion />);
  await screen.findByText('Configuración inicial');

  await escribir('Fecha de compra (0 km)', '18/10/2024');
  await escribir('Km por semana (promedio)', '350');

  await fireEvent.press(screen.getByText('+ Agregar periodo parado'));
  await escribir('Desde', '26/04/2026');
  await escribir('Hasta', '03/08/2026');

  // Calculadora: lectura congelada del velocímetro
  await escribir('Lectura congelada (km)', '26100');
  await escribir('Desde (fecha)', '23/11/2025');
  expect(screen.getByText(/^Usar estimado:/)).toBeTruthy();

  await escribir('Kilometraje de hoy', '45000');

  // Cunas de dirección: mantenimiento en agosto
  await fireEvent.press(screen.getAllByText('Por fecha')[iStrBear]);
  await escribir('Fecha del último cambio o mantenimiento', '04/08/2026');
  // Bujía: no se sabe → revisar
  const iBujia = CATALOGO_SBR150.findIndex((p) => p.id === 'SPK_CHK');
  await fireEvent.press(screen.getAllByText('No sé')[iBujia]);

  const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Guardar configuración'));

  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/salud'));
  expect(alerta).not.toHaveBeenCalled();

  const moto = await obtenerMoto(mockDb);
  expect(moto).toMatchObject({ odometroTotalKm: 45000, configuracionCompleta: true });

  const hoy = hoyIsoLocal();
  const cunas = await obtenerPieza(mockDb, 'STR_BEAR');
  expect(cunas?.fechaUltimoCambio).toBe('2026-08-04');
  expect(cunas?.kmAcumulados).toBeCloseTo(estimarKm('2026-08-04', hoy, 350, PARADA), 3);

  // Original: todo el kilometraje
  expect((await obtenerPieza(mockDb, 'WHL_BEAR'))?.kmAcumulados).toBe(45000);
  // No sé: al 100 %
  expect((await obtenerPieza(mockDb, 'SPK_CHK'))?.estado).toBe('VENCIDO');

  const { asistente } = await obtenerAjustes(mockDb);
  expect(asistente).toMatchObject({
    fechaCompra: '2024-10-18',
    kmPorSemana: 350,
    paradas: PARADA,
    odometroKm: 45000,
    lecturaCongeladaKm: 26100,
  });
  expect(asistente?.piezas.STR_BEAR).toEqual({ modo: 'FECHA', fecha: '2026-08-04' });

  const hist = await listarHistorialServicios(mockDb, { incluirIniciales: true, piezaId: 'STR_BEAR' });
  expect(hist[0].fechaServicio).toBe('2026-08-04');
});

it('al rehacerla, precarga lo guardado', async () => {
  await render(<Configuracion />);
  await screen.findByText('Configuración inicial');
  await escribir('Fecha de compra (0 km)', '18/10/2024');
  await escribir('Kilometraje de hoy', '45000');
  await fireEvent.press(screen.getByText('Guardar configuración'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  await screen.unmount();
  (mockRouter.replace as jest.Mock).mockClear();

  await render(<Configuracion />);
  expect(await screen.findByDisplayValue('18/10/2024')).toBeTruthy();
  expect(screen.getByDisplayValue('45000')).toBeTruthy();
});

it('intervalo propio del caucho trasero, y volver al de fábrica', async () => {
  const iCaucho = CATALOGO_SBR150.findIndex((p) => p.id === 'TYRE_R');
  await render(<Configuracion />);
  await screen.findByText('Configuración inicial');
  await escribir('Fecha de compra (0 km)', '18/10/2024');
  await escribir('Kilometraje de hoy', '45000');

  await escribir('Intervalo de servicio (km)', '30000', iCaucho);
  expect(screen.getByText('Personalizado. De fábrica: 18.000 km')).toBeTruthy();
  await fireEvent.press(screen.getByText('Guardar configuración'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  expect((await obtenerPieza(mockDb, 'TYRE_R'))?.intervaloKm).toBe(30000);
  // Las demás no se tocaron
  expect((await obtenerPieza(mockDb, 'TYRE_F'))?.intervaloKm).toBe(25000);
  await screen.unmount();

  // Al rehacerla aparece el 30.000 y se puede volver al de fábrica
  await render(<Configuracion />);
  expect((await screen.findAllByLabelText('Intervalo de servicio (km)'))[iCaucho].props.value).toBe('30000');
  await fireEvent.press(screen.getByText('Volver al de fábrica'));
  await fireEvent.press(screen.getByText('Guardar configuración'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledTimes(2));
  expect((await obtenerPieza(mockDb, 'TYRE_R'))?.intervaloKm).toBe(18000);
});

it('no guarda si faltan datos', async () => {
  const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Configuracion />);
  await screen.findByText('Configuración inicial');
  await fireEvent.press(screen.getByText('Guardar configuración'));
  expect(alerta).toHaveBeenCalledWith('Faltan datos', expect.any(String));
  expect((await obtenerMoto(mockDb)).configuracionCompleta).toBe(false);
});
