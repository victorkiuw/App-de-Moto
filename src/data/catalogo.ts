/** Catálogo maestro de desgaste de la Bera SBR 150 (spec §3). */

export type Categoria = 'MOTOR' | 'TRACCION' | 'FRENOS' | 'CHASIS';
export type NivelRiesgo = 'CORTO' | 'MEDIO' | 'CRITICO' | 'LARGO';

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  MOTOR: 'Motor',
  TRACCION: 'Tracción',
  FRENOS: 'Frenos',
  CHASIS: 'Rodamientos/Chasis',
};

export const NOMBRE_RIESGO: Record<NivelRiesgo, string> = {
  CORTO: 'Corto',
  MEDIO: 'Medio',
  CRITICO: 'Crítico',
  LARGO: 'Largo',
};

export interface PiezaCatalogo {
  id: string;
  nombre: string;
  categoria: Categoria;
  intervaloKm: number;
  riesgo: NivelRiesgo;
  accion: string;
}

export const CATALOGO_SBR150: readonly PiezaCatalogo[] = [
  {
    id: 'CAD_LUB',
    nombre: 'Lubricación / Limpieza de Cadena',
    categoria: 'TRACCION',
    intervaloKm: 500,
    riesgo: 'CORTO',
    accion: 'Limpiar residuos con solvente y lubricar con aceite/grasa de cadena 428H.',
  },
  {
    id: 'CAD_TENS',
    nombre: 'Inspección de Holgura de Cadena',
    categoria: 'TRACCION',
    intervaloKm: 1000,
    riesgo: 'CORTO',
    accion: 'Calibrar tensores de basculante a holgura libre de 15 a 25 mm.',
  },
  {
    id: 'MOT_OIL',
    nombre: 'Cambio de Aceite de Motor',
    categoria: 'MOTOR',
    intervaloKm: 2500,
    riesgo: 'CRITICO',
    accion: 'Drenar y reponer 1.000 ml de lubricante 20W-50 con norma JASO MA/MA2.',
  },
  {
    id: 'AIR_FILT',
    nombre: 'Limpieza de Filtro de Aire',
    categoria: 'MOTOR',
    intervaloKm: 2500,
    riesgo: 'CORTO',
    accion: 'Lavar elemento de espuma con agua/jabón, secar y humectar ligeramente.',
  },
  {
    id: 'SPK_CHK',
    nombre: 'Inspección / Limpieza de Bujía',
    categoria: 'MOTOR',
    intervaloKm: 3000,
    riesgo: 'MEDIO',
    accion: 'Limpiar depósitos de carbón en electrodo (D8TC) y calibrar a 0,6–0,7 mm.',
  },
  {
    id: 'BRK_CHK',
    nombre: 'Inspección de Frenos',
    categoria: 'FRENOS',
    intervaloKm: 3000,
    riesgo: 'CRITICO',
    accion: 'Revisar espesor de bandas traseras y pastillas del cáliper delantero.',
  },
  {
    id: 'CARB_CLN',
    nombre: 'Limpieza y Entonación de Carburador',
    categoria: 'MOTOR',
    intervaloKm: 5000,
    riesgo: 'MEDIO',
    accion: 'Drenar cuba, limpiar chicleres de alta y baja (PZ27), ajustar mezcla.',
  },
  {
    id: 'VALV_ADJ',
    nombre: 'Calibración de Válvulas',
    categoria: 'MOTOR',
    intervaloKm: 6000,
    riesgo: 'MEDIO',
    accion: 'Reglaje en frío: Admisión 0,05 mm / Escape 0,06 mm.',
  },
  {
    id: 'WHL_BEAR',
    nombre: 'Inspección de Rolineras de Rueda',
    categoria: 'CHASIS',
    intervaloKm: 6000,
    riesgo: 'CRITICO',
    accion: 'Comprobar ausencia de juego radial/axial en ruedas delantera y trasera.',
  },
  {
    id: 'SPK_REP',
    nombre: 'Sustitución de Bujía',
    categoria: 'MOTOR',
    intervaloKm: 8000,
    riesgo: 'MEDIO',
    accion: 'Reemplazo preventivo de bujía D8TC o equivalente.',
  },
  {
    id: 'BRK_REP',
    nombre: 'Cambio de Pastillas y Bandas',
    categoria: 'FRENOS',
    intervaloKm: 10000,
    riesgo: 'CRITICO',
    accion: 'Reemplazo de componentes de fricción por desgaste de masa.',
  },
  {
    id: 'KIT_ARR',
    nombre: 'Kit de Arrastre Completo',
    categoria: 'TRACCION',
    intervaloKm: 15000,
    riesgo: 'CRITICO',
    accion: 'Sustituir piñón de ataque, corona y cadena 428H.',
  },
  {
    id: 'BEAR_REP',
    nombre: 'Sustitución de Rolineras de Rueda',
    categoria: 'CHASIS',
    intervaloKm: 15000,
    riesgo: 'CRITICO',
    accion: 'Cambio preventivo de rodamientos de masa para evitar engranamiento.',
  },
  {
    id: 'FORK_OIL',
    nombre: 'Aceite y Retenes de Suspensión',
    categoria: 'CHASIS',
    intervaloKm: 15000,
    riesgo: 'LARGO',
    accion: 'Drenaje y sustitución de fluido hidráulico en barras telescópicas.',
  },
  {
    id: 'TYRE_R',
    nombre: 'Caucho Trasero',
    categoria: 'CHASIS',
    intervaloKm: 18000,
    riesgo: 'CRITICO',
    accion: 'Sustitución por desgaste de huella en uso diario.',
  },
  {
    id: 'STR_BEAR',
    nombre: 'Cunas / Rodamientos de Dirección',
    categoria: 'CHASIS',
    intervaloKm: 20000,
    riesgo: 'CRITICO',
    accion: 'Engrase o cambio de pistas cónicas de la tija de dirección.',
  },
  {
    id: 'SWG_BUSH',
    nombre: 'Bujes de Horquilla / Tijera',
    categoria: 'CHASIS',
    intervaloKm: 20000,
    riesgo: 'LARGO',
    accion: 'Cambio de bujes de basculante trasero para eliminar bamboleo lateral.',
  },
  {
    id: 'TYRE_F',
    nombre: 'Caucho Delantero',
    categoria: 'CHASIS',
    intervaloKm: 25000,
    riesgo: 'CRITICO',
    accion: 'Sustitución por cristalización o desgaste lateral irregular.',
  },
];
