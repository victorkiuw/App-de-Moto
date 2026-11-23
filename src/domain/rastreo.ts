import {
  debeActualizarReferencia,
  evaluarLectura,
  LecturaGps,
  ParametrosFiltro,
} from './filtro-gps';

/**
 * Estado del odómetro de la rodada en curso. Se guarda en la base de datos
 * después de cada lote de lecturas, para sobrevivir a que Android cierre la app.
 */
export interface EstadoRastreo {
  viajeId: number;
  /** Última lectura usada como punto de partida para medir. */
  referencia: LecturaGps | null;
  /** Saltos imposibles seguidos (si se repiten, la referencia era la mala). */
  saltosSeguidos: number;
  distanciaKm: number;
  /** Segundos en movimiento (sin contar paradas). */
  movimientoSegundos: number;
  velocidadMaximaKmh: number;
  velocidadActualKmh: number;
  /** Precisión de la última lectura, en metros. */
  precisionActualM: number | null;
  /** Epoch ms de la última lectura recibida (válida o no). */
  ultimaLecturaTs: number | null;
  enMovimiento: boolean;
  /** Contadores para entender cómo se comportó el GPS en la rodada. */
  diag: DiagnosticoGps;
}

export interface DiagnosticoGps {
  /** Lecturas recibidas (sin repetidas). */
  lecturas: number;
  /** Lecturas que sumaron distancia. */
  aceptadas: number;
  /** De las aceptadas, cuántas entraron con precisión relajada. */
  relajadas: number;
  descartePrecision: number;
  descarteSalto: number;
  descarteParado: number;
  /** Lecturas imprecisas que no se movieron más que su propio margen de error. */
  descarteRuido: number;
  /** Mayor tiempo entre dos lecturas, en segundos (detecta cuando el sistema frena el GPS). */
  huecoMaximoS: number;
}

export const DIAG_VACIO: DiagnosticoGps = {
  lecturas: 0,
  aceptadas: 0,
  relajadas: 0,
  descartePrecision: 0,
  descarteSalto: 0,
  descarteParado: 0,
  descarteRuido: 0,
  huecoMaximoS: 0,
};

export function estadoInicial(viajeId: number): EstadoRastreo {
  return {
    viajeId,
    referencia: null,
    saltosSeguidos: 0,
    distanciaKm: 0,
    movimientoSegundos: 0,
    velocidadMaximaKmh: 0,
    velocidadActualKmh: 0,
    precisionActualM: null,
    ultimaLecturaTs: null,
    enMovimiento: false,
    diag: { ...DIAG_VACIO },
  };
}

/**
 * Si no hay una lectura buena desde hace este tiempo (o todavía no hay punto de
 * partida), se aceptan lecturas menos precisas. Así no se pierde el arranque
 * mientras el GPS "agarra" señal, ni los tramos donde la precisión empeora.
 */
const SEGUNDOS_PARA_RELAJAR = 10;
export const PRECISION_RELAJADA_M = 50;

export type MotivoPunto = 'OK' | 'RELAJADA' | 'PRECISION' | 'SALTO' | 'PARADO' | 'TIEMPO' | 'RUIDO';

/** Con 3 saltos seguidos se asume que el punto de partida era el malo y se reinicia. */
const SALTOS_PARA_REINICIAR = 3;
/** Un hueco mayor (túnel, sin señal) no cuenta como tiempo en movimiento. */
const MAX_SEGUNDOS_ENTRE_LECTURAS = 30;

export interface PuntoProcesado {
  lectura: LecturaGps;
  velocidadKmh: number;
  contado: boolean;
  motivo: MotivoPunto;
}

/**
 * Pasa un lote de lecturas por el filtro y actualiza el odómetro del viaje.
 * Es una función pura: no toca la BD ni el GPS.
 */
export function procesarLecturas(
  estado: EstadoRastreo,
  lecturas: LecturaGps[],
  params: ParametrosFiltro,
): { estado: EstadoRastreo; puntos: PuntoProcesado[] } {
  const e: EstadoRastreo = { ...estado, diag: { ...DIAG_VACIO, ...estado.diag } };
  const puntos: PuntoProcesado[] = [];
  const orden = [...lecturas].sort((a, b) => a.timestamp - b.timestamp);

  for (const l of orden) {
    // Lecturas repetidas o atrasadas (Android a veces reenvía el lote) se ignoran.
    if (e.ultimaLecturaTs != null && l.timestamp <= e.ultimaLecturaTs) continue;
    if (e.ultimaLecturaTs != null) {
      e.diag.huecoMaximoS = Math.max(e.diag.huecoMaximoS, (l.timestamp - e.ultimaLecturaTs) / 1000);
    }
    e.ultimaLecturaTs = l.timestamp;
    e.precisionActualM = l.precisionM;
    e.diag.lecturas += 1;

    const anterior = e.referencia;
    const relajar =
      anterior == null || (l.timestamp - anterior.timestamp) / 1000 > SEGUNDOS_PARA_RELAJAR;
    const p = relajar
      ? { ...params, precisionMaximaM: Math.max(params.precisionMaximaM, PRECISION_RELAJADA_M) }
      : params;
    const esImprecisa = l.precisionM != null && l.precisionM > params.precisionMaximaM;

    let r = evaluarLectura(anterior, l, p);
    let motivo: MotivoPunto = r.aceptada ? (esImprecisa ? 'RELAJADA' : 'OK') : r.motivo;

    // Una lectura imprecisa solo cuenta si el propio GPS dice que hay movimiento
    // (su velocidad sale del efecto Doppler y es fiable aunque la posición no lo sea)
    // o si el salto es claramente mayor que su margen de error. Si no, puede ser
    // el GPS "bailando" estando parado.
    const gpsDiceQueSeMueve =
      l.velocidadMs != null && l.velocidadMs >= 0 && l.velocidadMs * 3.6 >= params.velocidadMinimaKmh;
    if (
      r.aceptada &&
      esImprecisa &&
      !gpsDiceQueSeMueve &&
      r.distanciaKm * 1000 < 2 * (l.precisionM ?? 0)
    ) {
      r = { aceptada: false, motivo: 'PARADO', velocidadKmh: r.velocidadKmh };
      motivo = 'RUIDO';
    }
    e.velocidadActualKmh = r.velocidadKmh;

    if (r.aceptada && anterior) {
      e.distanciaKm += r.distanciaKm;
      const dt = (l.timestamp - anterior.timestamp) / 1000;
      e.movimientoSegundos += Math.min(dt, MAX_SEGUNDOS_ENTRE_LECTURAS);
      e.velocidadMaximaKmh = Math.max(e.velocidadMaximaKmh, r.velocidadKmh);
      e.enMovimiento = true;
      e.saltosSeguidos = 0;
      e.diag.aceptadas += 1;
      if (motivo === 'RELAJADA') e.diag.relajadas += 1;
    } else if (motivo === 'SALTO') {
      e.diag.descarteSalto += 1;
      e.saltosSeguidos += 1;
      if (e.saltosSeguidos >= SALTOS_PARA_REINICIAR) {
        e.referencia = l;
        e.saltosSeguidos = 0;
      }
    } else if (motivo === 'PARADO') {
      e.diag.descarteParado += 1;
      e.enMovimiento = false;
      e.saltosSeguidos = 0;
    } else if (motivo === 'PRECISION') {
      e.diag.descartePrecision += 1;
    } else if (motivo === 'RUIDO') {
      e.diag.descarteRuido += 1;
    }

    if (motivo !== 'RUIDO' && debeActualizarReferencia(r, anterior)) e.referencia = l;

    // Se guardan todas, también las descartadas (con su motivo), para poder
    // revisar después qué pasó en la rodada.
    puntos.push({ lectura: l, velocidadKmh: r.velocidadKmh, contado: r.aceptada, motivo });
  }

  return { estado: e, puntos };
}

/** true si hace rato que no llegan lecturas (GPS sin señal o servicio detenido). */
export function sinSenal(estado: EstadoRastreo | null, ahoraMs: number, umbralS = 20): boolean {
  if (!estado?.ultimaLecturaTs) return true;
  return (ahoraMs - estado.ultimaLecturaTs) / 1000 > umbralS;
}

/**
 * Resumen legible del diagnóstico, con avisos si algo salió mal.
 * Las paradas cuentan como lecturas útiles (el GPS funcionó, solo que no te movías).
 */
export function resumenDiagnostico(d: DiagnosticoGps): { linea: string; avisos: string[] } {
  const utiles = d.aceptadas + d.descarteParado;
  const pct = d.lecturas > 0 ? Math.round((utiles / d.lecturas) * 100) : 0;
  const linea = `GPS: ${d.lecturas} lecturas · ${pct} % útiles · hueco máximo ${Math.round(d.huecoMaximoS)} s`;
  const avisos: string[] = [];
  if (d.huecoMaximoS > 30) {
    avisos.push(
      `El GPS estuvo ${Math.round(d.huecoMaximoS)} s sin mandar lecturas: puede que el sistema lo haya frenado (revisa la batería en Ajustes).`,
    );
  }
  if (d.lecturas >= 20 && d.descartePrecision / d.lecturas > 0.2) {
    avisos.push(`Muchas lecturas imprecisas (${Math.round((d.descartePrecision / d.lecturas) * 100)} %). Puede que el teléfono iba muy tapado.`);
  }
  return { linea, avisos };
}
