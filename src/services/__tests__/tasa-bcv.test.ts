import { interpretarRespuestaTasa } from '../tasa-bcv';

describe('interpretarRespuestaTasa', () => {
  it('lee el promedio de DolarAPI', () => {
    const r = interpretarRespuestaTasa({
      fuente: 'oficial',
      nombre: 'Oficial',
      compra: null,
      venta: null,
      promedio: 245.67,
      fechaActualizacion: '2026-11-21T00:00:00.000Z',
    });
    expect(r).toEqual({ bsPorUsd: 245.67, fecha: '2026-11-21T00:00:00.000Z' });
  });

  it('usa venta si no hay promedio', () => {
    expect(interpretarRespuestaTasa({ venta: 240, fechaActualizacion: 'x' }).bsPorUsd).toBe(240);
  });

  it('falla con datos inválidos', () => {
    expect(() => interpretarRespuestaTasa(null)).toThrow();
    expect(() => interpretarRespuestaTasa({ promedio: 0 })).toThrow();
    expect(() => interpretarRespuestaTasa({ promedio: 'abc' })).toThrow();
  });
});
