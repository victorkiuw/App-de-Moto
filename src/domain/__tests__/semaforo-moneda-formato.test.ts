import { bsAUsd, costoCombustibleBs, usdABs } from '../moneda';
import { formatearDuracion, formatearKm, formatearNumero, parsearNumero } from '../formato';
import { empeoro, estadoDesdePorcentaje, resumenPieza } from '../semaforo';

describe('semáforo', () => {
  it.each([
    [0, 'OK'],
    [75, 'OK'],
    [75.01, 'ALERTA'],
    [99.99, 'ALERTA'],
    [100, 'VENCIDO'],
    [180, 'VENCIDO'],
  ])('%p %% → %s', (pct, estado) => {
    expect(estadoDesdePorcentaje(pct as number)).toBe(estado);
  });

  it('resumen de cadena a 400 de 500 km', () => {
    expect(resumenPieza(400, 500)).toEqual({ porcentaje: 80, estado: 'ALERTA', kmRestantes: 100 });
  });

  it('km restantes negativos cuando está vencida', () => {
    expect(resumenPieza(2600, 2500).kmRestantes).toBe(-100);
  });

  it('empeoro solo al subir de gravedad', () => {
    expect(empeoro('OK', 'ALERTA')).toBe(true);
    expect(empeoro('ALERTA', 'VENCIDO')).toBe(true);
    expect(empeoro('VENCIDO', 'OK')).toBe(false);
    expect(empeoro('ALERTA', 'ALERTA')).toBe(false);
  });
});

describe('moneda', () => {
  it('convierte con tasa BCV', () => {
    expect(bsAUsd(500, 250)).toBe(2);
    expect(usdABs(2, 250)).toBe(500);
  });
  it('null sin tasa válida', () => {
    expect(bsAUsd(500, null)).toBeNull();
    expect(bsAUsd(500, 0)).toBeNull();
  });
  it('costo de combustible', () => {
    expect(costoCombustibleBs(0.84, 100)).toBeCloseTo(84, 6);
  });
});

describe('formato venezolano', () => {
  it('números', () => {
    expect(formatearNumero(1234567.891, 2)).toBe('1.234.567,89');
    expect(formatearNumero(32.4, 1)).toBe('32,4');
    expect(formatearNumero(-5, 0)).toBe('-5');
    expect(formatearKm(32.44)).toBe('32,4 km');
  });
  it('duración', () => {
    expect(formatearDuracion(45 * 60 + 12)).toBe('00:45:12');
    expect(formatearDuracion(3 * 3600 + 5)).toBe('03:00:05');
  });
  it.each([
    ['1.234,5', 1234.5],
    ['1234.5', 1234.5],
    ['0,026', 0.026],
    ['0.026', 0.026],
    ['1.500', 1500],
    ['2.5', 2.5],
    ['12.345.678', 12345678],
    ['  42 ', 42],
    ['abc', null],
    ['', null],
  ])('parsea %p → %p', (txt, esperado) => {
    expect(parsearNumero(txt as string)).toBe(esperado);
  });
});
