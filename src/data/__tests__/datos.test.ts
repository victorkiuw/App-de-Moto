import { crearDbMemoria } from './db-memoria';
import { guardarAjustes, obtenerAjustes } from '../ajustes';
import { CATALOGO_SBR150 } from '../catalogo';
import { Db } from '../db';
import { inicializarBaseDatos, VERSION_ESQUEMA } from '../esquema';
import { aplicarConfiguracionInicial, corregirOdometro, obtenerMoto } from '../moto';
import {
  cambiarIntervalo,
  listarHistorialServicios,
  listarPiezas,
  obtenerPieza,
  registrarServicio,
  tomarPiezasQueEmpeoraron,
} from '../piezas';
import { exportarRespaldo, importarRespaldo, RespaldoInvalidoError } from '../respaldo';
import { listarTanqueos, registrarTanqueo } from '../tanqueos';
import {
  agregarPuntos,
  descartarViaje,
  finalizarViaje,
  guardarProgreso,
  iniciarViaje,
  listarViajes,
  obtenerPuntos,
  obtenerViajeEnCurso,
  registrarViajeManual,
  resumenPeriodo,
} from '../viajes';

let db: Db & { cerrar(): void };
beforeEach(async () => {
  db = await crearDbMemoria();
});
afterEach(() => db.cerrar());

describe('esquema y catálogo', () => {
  it('crea la versión actual del esquema', async () => {
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(v?.user_version).toBe(VERSION_ESQUEMA);
  });

  it('precarga las 18 piezas de la SBR 150 con categoría', async () => {
    const piezas = await listarPiezas(db);
    expect(piezas).toHaveLength(18);
    expect(CATALOGO_SBR150).toHaveLength(18);
    expect(piezas.map((p) => p.id)).toEqual(CATALOGO_SBR150.map((p) => p.id));
    expect(piezas.find((p) => p.id === 'TYRE_R')?.categoria).toBe('CHASIS');
    expect(piezas.every((p) => p.estado === 'OK' && p.kmAcumulados === 0)).toBe(true);
  });

  it('filtra por categoría', async () => {
    const frenos = await listarPiezas(db, { categoria: 'FRENOS' });
    expect(frenos.map((p) => p.id).sort()).toEqual(['BRK_CHK', 'BRK_REP']);
  });

  it('inicializar dos veces no duplica ni pisa cambios del usuario', async () => {
    await cambiarIntervalo(db, 'MOT_OIL', 3000);
    await inicializarBaseDatos(db);
    expect(await listarPiezas(db)).toHaveLength(18);
    expect((await obtenerPieza(db, 'MOT_OIL'))?.intervaloKm).toBe(3000);
  });

  it('la moto arranca con los datos de fábrica', async () => {
    const m = await obtenerMoto(db);
    expect(m).toMatchObject({
      modelo: 'Bera SBR 150',
      anio: 2024,
      factorConsumoLKm: 0.026,
      capacidadTanqueL: 10,
      kmAlertaReserva: 320,
      configuracionCompleta: false,
    });
  });
});

describe('configuración inicial', () => {
  it('fija odómetro, reserva y estado de cada pieza', async () => {
    await aplicarConfiguracionInicial(db, {
      odometroActualKm: 8000,
      kmDesdeUltimoTanqueo: 100,
      kmDesdeServicioPorPieza: { MOT_OIL: 2000, CAD_LUB: 600 },
    });
    const m = await obtenerMoto(db);
    expect(m.odometroTotalKm).toBe(8000);
    expect(m.odometroUltimoTanqueoKm).toBe(7900);
    expect(m.configuracionCompleta).toBe(true);

    const aceite = await obtenerPieza(db, 'MOT_OIL');
    expect(aceite).toMatchObject({ kmAcumulados: 2000, porcentaje: 80, estado: 'ALERTA', kmRestantes: 500 });
    expect((await obtenerPieza(db, 'CAD_LUB'))?.estado).toBe('VENCIDO');
    expect((await obtenerPieza(db, 'TYRE_F'))?.kmAcumulados).toBe(0);

    // Los registros iniciales no salen en la bitácora normal
    expect(await listarHistorialServicios(db)).toHaveLength(0);
    expect(await listarHistorialServicios(db, { incluirIniciales: true })).toHaveLength(18);
  });

  it('aplica intervalos propios y puede volver al de fábrica', async () => {
    const base = { odometroActualKm: 45000, kmDesdeUltimoTanqueo: 0, kmDesdeServicioPorPieza: { TYRE_R: 21320 } };
    await aplicarConfiguracionInicial(db, { ...base, intervaloPorPieza: { TYRE_R: 30000 } });
    const caucho = await obtenerPieza(db, 'TYRE_R');
    expect(caucho).toMatchObject({ intervaloKm: 30000, intervaloKmFabrica: 18000, estado: 'OK' });
    expect(caucho?.porcentaje).toBeCloseTo(71.07, 1);
    // Sin tocarlo en otra configuración, se conserva
    await aplicarConfiguracionInicial(db, base);
    expect((await obtenerPieza(db, 'TYRE_R'))?.intervaloKm).toBe(30000);
    await aplicarConfiguracionInicial(db, { ...base, intervaloPorPieza: { TYRE_R: null } });
    expect((await obtenerPieza(db, 'TYRE_R'))?.intervaloKm).toBe(18000);
    await expect(
      aplicarConfiguracionInicial(db, { ...base, intervaloPorPieza: { TYRE_R: 0 } }),
    ).rejects.toThrow('mayor que 0');
  });

  it('repetirla reemplaza los registros iniciales', async () => {
    const c = { odometroActualKm: 100, kmDesdeUltimoTanqueo: 0, kmDesdeServicioPorPieza: {} };
    await aplicarConfiguracionInicial(db, c);
    await aplicarConfiguracionInicial(db, c);
    expect(await listarHistorialServicios(db, { incluirIniciales: true })).toHaveLength(18);
  });
});

describe('viajes', () => {
  it('flujo completo: iniciar, puntos, progreso, finalizar suma al odómetro y a las piezas', async () => {
    await guardarAjustes(db, { precioLitroBs: 100, tasaBcv: 250 });
    const v = await iniciarViaje(db, '2026-11-20T10:00:00.000Z');
    expect(v.estado).toBe('EN_CURSO');

    // Iniciar de nuevo devuelve el mismo (recuperación tras cierre de la app)
    expect((await iniciarViaje(db)).id).toBe(v.id);

    await agregarPuntos(db, v.id, [
      { timestamp: 1, lat: 10, lon: -66, altitudM: null, precisionM: 5, velocidadKmh: 0, contado: false },
      { timestamp: 2, lat: 10.001, lon: -66, altitudM: null, precisionM: 5, velocidadKmh: 40, contado: true },
    ]);
    expect(await obtenerPuntos(db, v.id)).toHaveLength(2);

    await guardarProgreso(db, v.id, { distanciaKm: 32.4, duracionMovimientoSegundos: 3600, velocidadMaximaKmh: 75 });
    const fin = await finalizarViaje(db, v.id, { fechaFin: '2026-11-20T10:45:12.000Z' });

    expect(fin.estado).toBe('FINALIZADO');
    expect(fin.duracionSegundos).toBe(45 * 60 + 12);
    expect(fin.litrosConsumidos).toBeCloseTo(0.8424, 4);
    expect(fin.costoBs).toBeCloseTo(84.24, 2);
    expect(fin.tasaBcv).toBe(250);
    expect(fin.velocidadPromedioKmh).toBeCloseTo(32.4, 6);
    expect(fin.odometroFinKm).toBeCloseTo(32.4, 6);

    expect((await obtenerMoto(db)).odometroTotalKm).toBeCloseTo(32.4, 6);
    expect((await obtenerPieza(db, 'CAD_LUB'))?.kmAcumulados).toBeCloseTo(32.4, 6);
    expect(await obtenerViajeEnCurso(db)).toBeNull();

    await expect(finalizarViaje(db, v.id)).rejects.toThrow('ya estaba cerrado');
  });

  it('descartar no suma km', async () => {
    const v = await iniciarViaje(db);
    await guardarProgreso(db, v.id, { distanciaKm: 5, duracionMovimientoSegundos: 600, velocidadMaximaKmh: 30 });
    await descartarViaje(db, v.id);
    expect((await obtenerMoto(db)).odometroTotalKm).toBe(0);
    expect(await listarViajes(db)).toHaveLength(0);
  });

  it('viaje manual por olvido', async () => {
    const v = await registrarViajeManual(db, { distanciaKm: 50, notas: 'Olvidé iniciar' });
    expect(v.origen).toBe('MANUAL');
    expect(v.litrosConsumidos).toBeCloseTo(1.3, 6);
    expect(v.costoBs).toBeNull(); // sin precio configurado
    expect((await obtenerMoto(db)).odometroTotalKm).toBe(50);
    await expect(registrarViajeManual(db, { distanciaKm: 0 })).rejects.toThrow();
  });

  it('resumen por periodo', async () => {
    await registrarViajeManual(db, { distanciaKm: 100, fecha: '2026-11-02T12:00:00.000Z' });
    await registrarViajeManual(db, { distanciaKm: 80, fecha: '2026-11-10T12:00:00.000Z' });
    await registrarViajeManual(db, { distanciaKm: 70, fecha: '2026-12-01T12:00:00.000Z' });
    const nov = await resumenPeriodo(db, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
    expect(nov.viajes).toBe(2);
    expect(nov.distanciaKm).toBe(180);
    expect(nov.litros).toBeCloseTo(4.68, 6);
  });
});

describe('servicios y semáforo', () => {
  it('registrar servicio reinicia la pieza y guarda historial', async () => {
    await registrarViajeManual(db, { distanciaKm: 2600 });
    expect((await obtenerPieza(db, 'MOT_OIL'))?.estado).toBe('VENCIDO');

    await registrarServicio(db, { piezaId: 'MOT_OIL', observaciones: 'Aceite 20W-50 JASO MA2', costoBs: 900, tasaBcv: 250 });
    const p = await obtenerPieza(db, 'MOT_OIL');
    expect(p).toMatchObject({ kmAcumulados: 0, estado: 'OK', odometroUltimoCambioKm: 2600 });

    const h = await listarHistorialServicios(db);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ piezaId: 'MOT_OIL', kmAlMomentoServicio: 2600, kmRecorridosPieza: 2600, costoBs: 900 });
  });

  it('no permite servicio con km mayor al odómetro', async () => {
    await expect(registrarServicio(db, { piezaId: 'MOT_OIL', odometroKm: 10 })).rejects.toThrow();
    // y la transacción no dejó rastro
    expect(await listarHistorialServicios(db)).toHaveLength(0);
  });

  it('intervalo personalizado y restaurar el de fábrica', async () => {
    await cambiarIntervalo(db, 'MOT_OIL', 4000);
    expect((await obtenerPieza(db, 'MOT_OIL'))?.intervaloKm).toBe(4000);
    await cambiarIntervalo(db, 'MOT_OIL', null);
    expect((await obtenerPieza(db, 'MOT_OIL'))?.intervaloKm).toBe(2500);
    await expect(cambiarIntervalo(db, 'MOT_OIL', 0)).rejects.toThrow();
  });

  it('avisa solo una vez cuando una pieza empeora', async () => {
    await registrarViajeManual(db, { distanciaKm: 400 }); // cadena 80 %
    const primera = await tomarPiezasQueEmpeoraron(db);
    expect(primera.map((p) => p.id)).toEqual(['CAD_LUB']);
    expect(await tomarPiezasQueEmpeoraron(db)).toHaveLength(0);

    await registrarViajeManual(db, { distanciaKm: 100 }); // cadena 100 %
    expect((await tomarPiezasQueEmpeoraron(db)).map((p) => p.id)).toEqual(['CAD_LUB']);
  });

  it('corregir odómetro queda registrado y afecta a las piezas', async () => {
    await registrarViajeManual(db, { distanciaKm: 100 });
    await corregirOdometro(db, 120, 'Igualar al tablero');
    expect((await obtenerMoto(db)).odometroTotalKm).toBe(120);
    expect((await obtenerPieza(db, 'CAD_LUB'))?.kmAcumulados).toBe(120);
    const a = await db.getAllAsync('SELECT * FROM ajuste_odometro', []);
    expect(a).toHaveLength(1);
  });
});

describe('tanqueos', () => {
  it('tanque lleno reinicia la reserva; parcial la retrasa', async () => {
    await registrarViajeManual(db, { distanciaKm: 300 });
    await registrarTanqueo(db, { litros: 2.6, tanqueLleno: false });
    // 2,6 L / 0,026 = 100 km equivalentes
    expect((await obtenerMoto(db)).odometroUltimoTanqueoKm).toBeCloseTo(100, 6);

    await registrarTanqueo(db, { litros: 7, tanqueLleno: true, precioLitroBs: 100, tasaBcv: 250 });
    expect((await obtenerMoto(db)).odometroUltimoTanqueoKm).toBe(300);
    const t = await listarTanqueos(db);
    expect(t[0]).toMatchObject({ litros: 7, costoBs: 700, tanqueLleno: true });
  });

  it('aprende el consumo real entre llenados', async () => {
    await registrarTanqueo(db, { litros: 9, tanqueLleno: true });
    await registrarViajeManual(db, { distanciaKm: 300 });
    await registrarTanqueo(db, { litros: 9, tanqueLleno: true }); // 0,03 L/km
    expect((await obtenerMoto(db)).factorConsumoLKm).toBeCloseTo(0.03, 6);
  });

  it('ignora consumos absurdos (error al anotar)', async () => {
    await registrarTanqueo(db, { litros: 9, tanqueLleno: true });
    await registrarViajeManual(db, { distanciaKm: 60 });
    await registrarTanqueo(db, { litros: 9, tanqueLleno: true }); // 0,15 L/km: imposible
    expect((await obtenerMoto(db)).factorConsumoLKm).toBe(0.026);
  });
});

describe('ajustes', () => {
  it('valores por defecto y guardado', async () => {
    const a = await obtenerAjustes(db);
    expect(a.notifReserva).toBe(true);
    expect(a.precioLitroBs).toBeNull();
    await guardarAjustes(db, { precioLitroBs: 50.5, notifReserva: false, tasaBcvOrigen: 'MANUAL' });
    const b = await obtenerAjustes(db);
    expect(b).toMatchObject({ precioLitroBs: 50.5, notifReserva: false, tasaBcvOrigen: 'MANUAL' });
  });
});

describe('respaldo', () => {
  it('exportar → importar en otra BD deja todo igual', async () => {
    await aplicarConfiguracionInicial(db, { odometroActualKm: 5000, kmDesdeUltimoTanqueo: 0, kmDesdeServicioPorPieza: { MOT_OIL: 1000 } });
    const v = await iniciarViaje(db);
    await agregarPuntos(db, v.id, [
      { timestamp: 1, lat: 10, lon: -66, altitudM: 900, precisionM: 4, velocidadKmh: 30, contado: true },
    ]);
    await finalizarViaje(db, v.id, { progreso: { distanciaKm: 12, duracionMovimientoSegundos: 900, velocidadMaximaKmh: 60 } });
    await registrarServicio(db, { piezaId: 'CAD_LUB', observaciones: 'ok' });
    await guardarAjustes(db, { precioLitroBs: 80 });
    await cambiarIntervalo(db, 'MOT_OIL', 3000);

    const respaldo = JSON.parse(JSON.stringify(await exportarRespaldo(db)));

    const otra = await crearDbMemoria();
    await importarRespaldo(otra, respaldo);
    expect(await obtenerMoto(otra)).toEqual(await obtenerMoto(db));
    expect(await listarPiezas(otra)).toEqual(await listarPiezas(db));
    expect(await listarViajes(otra)).toEqual(await listarViajes(db));
    expect(await obtenerPuntos(otra, v.id)).toHaveLength(1);
    expect(await obtenerAjustes(otra)).toEqual(await obtenerAjustes(db));
    expect(await listarHistorialServicios(otra, { incluirIniciales: true })).toEqual(
      await listarHistorialServicios(db, { incluirIniciales: true }),
    );
    otra.cerrar();
  });

  it('respaldo liviano sin puntos GPS', async () => {
    const r = await exportarRespaldo(db, { incluirPuntosGps: false });
    expect(r.tablas.punto_gps).toBeUndefined();
    expect(r.incluyePuntosGps).toBe(false);
  });

  it('rechaza archivos que no son respaldos y no toca los datos', async () => {
    await registrarViajeManual(db, { distanciaKm: 10 });
    await expect(importarRespaldo(db, { hola: 1 })).rejects.toBeInstanceOf(RespaldoInvalidoError);
    await expect(
      importarRespaldo(db, { formato: 'moto-sbr150-respaldo', versionEsquema: 999, tablas: {} }),
    ).rejects.toThrow('más nueva');
    expect((await obtenerMoto(db)).odometroTotalKm).toBe(10);
  });

  it('si la importación falla a mitad, se revierte todo', async () => {
    await registrarViajeManual(db, { distanciaKm: 10 });
    const malo = JSON.parse(JSON.stringify(await exportarRespaldo(db)));
    malo.tablas.viaje[0].estado = 'ESTADO_INVALIDO'; // viola el CHECK
    await expect(importarRespaldo(db, malo)).rejects.toThrow();
    expect(await listarViajes(db)).toHaveLength(1);
    expect((await obtenerMoto(db)).odometroTotalKm).toBe(10);
  });
});
