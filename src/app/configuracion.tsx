import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { Aviso, BarraProgreso, Boton, Campo, Chip, Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { DatosAsistente, guardarAjustes, obtenerAjustes } from '@/data/ajustes';
import { CATALOGO_SBR150 } from '@/data/catalogo';
import { aplicarConfiguracionInicial } from '@/data/moto';
import { listarPiezas } from '@/data/piezas';
import { useDb } from '@/data/use-db';
import { calcularPieza, EntradaPieza, estimarOdometro, ModoPieza } from '@/domain/asistente';
import { formatearFechaCorta, hoyIsoLocal, parsearFechaCorta } from '@/domain/estimacion';
import { formatearKm, formatearNumero, parsearNumero } from '@/domain/formato';
import { useRefresco } from '@/state/refresco';
import { colorEstado, useColores } from '@/theme/colores';

const MODOS: { modo: ModoPieza; texto: string }[] = [
  { modo: 'ORIGINAL', texto: 'Original' },
  { modo: 'FECHA', texto: 'Por fecha' },
  { modo: 'KM', texto: 'Sé los km' },
  { modo: 'REVISAR', texto: 'No sé' },
];

interface PiezaTexto {
  modo: ModoPieza;
  fecha: string;
  km: string;
}

interface ParadaTexto {
  desde: string;
  hasta: string;
}

const txtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const txtFecha = (iso: string | null | undefined) => (iso ? formatearFechaCorta(iso) : '');

/** Asistente de configuración inicial: odómetro, ritmo de uso y estado de cada pieza. */
export default function Configuracion() {
  const db = useDb();
  const c = useColores();
  const invalidar = useRefresco((s) => s.invalidar);
  const hoy = hoyIsoLocal();

  const [cargado, setCargado] = useState(false);
  const [intervalos, setIntervalos] = useState<Record<string, number>>({});
  const [fechaCompra, setFechaCompra] = useState('');
  const [kmSemana, setKmSemana] = useState('350');
  const [paradas, setParadas] = useState<ParadaTexto[]>([]);
  const [odometro, setOdometro] = useState('');
  const [lecturaKm, setLecturaKm] = useState('');
  const [lecturaFecha, setLecturaFecha] = useState('');
  const [kmTanqueo, setKmTanqueo] = useState('0');
  const [piezas, setPiezas] = useState<Record<string, PiezaTexto>>(() =>
    Object.fromEntries(CATALOGO_SBR150.map((p) => [p.id, { modo: 'ORIGINAL', fecha: '', km: '' }])),
  );
  const [guardando, setGuardando] = useState(false);

  // Precarga: intervalos actuales (pueden estar editados) y lo que se guardó la última vez.
  useEffect(() => {
    (async () => {
      const lista = await listarPiezas(db, { soloActivas: false });
      setIntervalos(Object.fromEntries(lista.map((p) => [p.id, p.intervaloKm])));
      const { asistente: a } = await obtenerAjustes(db);
      if (a) {
        setFechaCompra(txtFecha(a.fechaCompra));
        setKmSemana(txtNum(a.kmPorSemana));
        setParadas(a.paradas.map((p) => ({ desde: txtFecha(p.desde), hasta: txtFecha(p.hasta) })));
        setOdometro(txtNum(a.odometroKm));
        setLecturaKm(txtNum(a.lecturaCongeladaKm));
        setLecturaFecha(txtFecha(a.fechaLecturaCongelada));
        setKmTanqueo(txtNum(a.kmDesdeTanqueo));
        setPiezas((prev) => {
          const sig = { ...prev };
          for (const [id, e] of Object.entries(a.piezas)) {
            sig[id] = { modo: e.modo, fecha: txtFecha(e.fecha), km: txtNum(e.km) };
          }
          return sig;
        });
      }
      setCargado(true);
    })();
  }, [db]);

  // ---- Lectura y validación de lo escrito ----
  const v = useMemo(() => {
    const errores: Record<string, string> = {};
    const fc = parsearFechaCorta(fechaCompra);
    if (!fc) errores.fechaCompra = 'Escribe la fecha como dd/mm/aaaa';
    else if (fc > hoy) errores.fechaCompra = 'La fecha está en el futuro';

    const ritmo = parsearNumero(kmSemana);
    if (ritmo == null || ritmo <= 0) errores.kmSemana = 'Escribe un número mayor que 0';

    const paradasIso = paradas.map((p, i) => {
      const d = parsearFechaCorta(p.desde);
      const h = parsearFechaCorta(p.hasta);
      if (!d || !h) errores[`parada${i}`] = 'Fechas como dd/mm/aaaa';
      else if (h < d) errores[`parada${i}`] = 'La fecha final es antes que la inicial';
      return d && h ? { desde: d, hasta: h } : null;
    });

    const odo = parsearNumero(odometro);
    if (odo == null || odo < 0) errores.odometro = 'Escribe los km (aunque sea aproximados)';

    const tanq = parsearNumero(kmTanqueo || '0');
    if (tanq == null || tanq < 0) errores.kmTanqueo = 'Número inválido';

    const lk = parsearNumero(lecturaKm);
    const lf = parsearFechaCorta(lecturaFecha);
    const datosBase = {
      fechaCompra: fc ?? hoy,
      kmPorSemana: ritmo ?? 0,
      paradas: paradasIso.filter((p): p is NonNullable<typeof p> => p != null),
      odometroKm: odo ?? 0,
    };
    const odometroSugerido =
      lk != null && lf && ritmo ? estimarOdometro(lk, lf, hoy, ritmo, datosBase.paradas) : null;

    const entradas: Record<string, EntradaPieza> = {};
    for (const p of CATALOGO_SBR150) {
      const t = piezas[p.id];
      const e: EntradaPieza = { modo: t.modo };
      if (t.modo === 'FECHA') {
        const f = parsearFechaCorta(t.fecha);
        if (!f) errores[`p_${p.id}`] = 'Fecha como dd/mm/aaaa';
        else if (f > hoy) errores[`p_${p.id}`] = 'La fecha está en el futuro';
        else if (fc && f < fc) errores[`p_${p.id}`] = 'Es anterior a la compra de la moto';
        else e.fecha = f;
      } else if (t.modo === 'KM') {
        const k = parsearNumero(t.km);
        if (k == null || k < 0) errores[`p_${p.id}`] = 'Escribe los km';
        else e.km = k;
      }
      entradas[p.id] = e;
    }

    return { errores, datosBase, entradas, odometroSugerido, lecturaKm: lk, lecturaFecha: lf, kmTanqueo: tanq ?? 0 };
  }, [fechaCompra, kmSemana, paradas, odometro, kmTanqueo, lecturaKm, lecturaFecha, piezas, hoy]);

  const resultados = useMemo(
    () =>
      Object.fromEntries(
        CATALOGO_SBR150.map((p) => [
          p.id,
          calcularPieza(v.entradas[p.id], intervalos[p.id] ?? p.intervaloKm, v.datosBase, hoy),
        ]),
      ),
    [v, intervalos, hoy],
  );

  const hayErrores = Object.keys(v.errores).length > 0;
  const nVencidas = Object.values(resultados).filter((r) => r.estado === 'VENCIDO').length;
  const nAlerta = Object.values(resultados).filter((r) => r.estado === 'ALERTA').length;

  const cambiarPieza = (id: string, cambio: Partial<PiezaTexto>) =>
    setPiezas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }));

  async function guardar() {
    if (hayErrores) {
      Alert.alert('Faltan datos', 'Revisa los campos marcados en rojo.');
      return;
    }
    setGuardando(true);
    try {
      const datos: DatosAsistente = {
        ...v.datosBase,
        kmDesdeTanqueo: v.kmTanqueo,
        lecturaCongeladaKm: v.lecturaKm,
        fechaLecturaCongelada: v.lecturaFecha,
        piezas: v.entradas,
      };
      const kmDesde: Record<string, number> = {};
      const fechas: Record<string, string> = {};
      for (const [id, r] of Object.entries(resultados)) {
        kmDesde[id] = r.kmDesdeServicio;
        if (r.fecha) fechas[id] = r.fecha;
      }
      await aplicarConfiguracionInicial(db, {
        odometroActualKm: v.datosBase.odometroKm,
        kmDesdeUltimoTanqueo: v.kmTanqueo,
        kmDesdeServicioPorPieza: kmDesde,
        fechaServicioPorPieza: fechas,
      });
      await guardarAjustes(db, { asistente: datos });
      invalidar();
      router.replace('/salud');
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!cargado) return <Pantalla>{null}</Pantalla>;

  return (
    <Pantalla>
      <Texto variante="titulo">Configuración inicial</Texto>
      <Texto variante="secundario">
        Si no sabes un dato exacto, pon un aproximado. Todo se puede rehacer después desde Ajustes.
      </Texto>

      {/* 1. Uso de la moto */}
      <Tarjeta>
        <Texto variante="subtitulo">1. Cómo usas la moto</Texto>
        <Campo
          etiqueta="Fecha de compra (0 km)"
          placeholder="dd/mm/aaaa"
          keyboardType="numbers-and-punctuation"
          value={fechaCompra}
          onChangeText={setFechaCompra}
          error={fechaCompra ? v.errores.fechaCompra : null}
        />
        <Campo
          etiqueta="Km por semana (promedio)"
          ayuda="Mezcla tus semanas fuertes y flojas. Se usa para estimar las piezas por fecha."
          keyboardType="decimal-pad"
          value={kmSemana}
          onChangeText={setKmSemana}
          error={v.errores.kmSemana}
        />
        <Texto variante="secundario">Periodos en que la moto estuvo parada</Texto>
        {paradas.map((p, i) => (
          <View key={i} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Campo
                etiqueta="Desde"
                placeholder="dd/mm/aaaa"
                keyboardType="numbers-and-punctuation"
                value={p.desde}
                onChangeText={(t) => setParadas((ps) => ps.map((x, j) => (j === i ? { ...x, desde: t } : x)))}
              />
              <Campo
                etiqueta="Hasta"
                placeholder="dd/mm/aaaa"
                keyboardType="numbers-and-punctuation"
                value={p.hasta}
                onChangeText={(t) => setParadas((ps) => ps.map((x, j) => (j === i ? { ...x, hasta: t } : x)))}
              />
            </View>
            {v.errores[`parada${i}`] && (p.desde || p.hasta) ? (
              <Texto variante="secundario" color={c.rojo}>
                {v.errores[`parada${i}`]}
              </Texto>
            ) : null}
            <Boton texto="Quitar este periodo" tipo="secundario" onPress={() => setParadas((ps) => ps.filter((_, j) => j !== i))} />
          </View>
        ))}
        <Boton texto="+ Agregar periodo parado" tipo="secundario" onPress={() => setParadas((ps) => [...ps, { desde: '', hasta: '' }])} />
      </Tarjeta>

      {/* 2. Odómetro */}
      <Tarjeta>
        <Texto variante="subtitulo">2. Kilometraje de la moto</Texto>
        <Texto variante="secundario">
          Si el velocímetro está desconectado, escribe lo que quedó marcando y desde cuándo, y la app
          te sugiere el kilometraje de hoy.
        </Texto>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Campo etiqueta="Lectura congelada (km)" keyboardType="decimal-pad" value={lecturaKm} onChangeText={setLecturaKm} />
          <Campo
            etiqueta="Desde (fecha)"
            placeholder="dd/mm/aaaa"
            keyboardType="numbers-and-punctuation"
            value={lecturaFecha}
            onChangeText={setLecturaFecha}
          />
        </View>
        {v.odometroSugerido != null && (
          <Boton
            texto={`Usar estimado: ${formatearKm(v.odometroSugerido, 0)}`}
            tipo="secundario"
            onPress={() => setOdometro(String(Math.round(v.odometroSugerido!)))}
          />
        )}
        <Campo
          etiqueta="Kilometraje de hoy"
          keyboardType="decimal-pad"
          placeholder="Ej. 45000"
          value={odometro}
          onChangeText={setOdometro}
          error={odometro ? v.errores.odometro : null}
          ayuda="Desde ahora el GPS de la app pasa a ser tu odómetro."
        />
        <Campo
          etiqueta="Km desde el último tanque lleno"
          keyboardType="decimal-pad"
          value={kmTanqueo}
          onChangeText={setKmTanqueo}
          error={v.errores.kmTanqueo}
          ayuda="0 si acabas de llenar."
        />
      </Tarjeta>

      {/* 3. Piezas */}
      <Texto variante="subtitulo">3. Estado de cada pieza</Texto>
      <Texto variante="secundario">
        Original: nunca se ha cambiado. Por fecha: la app calcula los km con tu ritmo semanal (sin contar
        los periodos parados). No sé: queda en rojo para que la revises.
      </Texto>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Texto color={c.rojo} style={{ fontWeight: '700' }}>
          {nVencidas} vencidas
        </Texto>
        <Texto color={c.amarillo} style={{ fontWeight: '700' }}>
          {nAlerta} en alerta
        </Texto>
      </View>

      {CATALOGO_SBR150.map((p) => {
        const t = piezas[p.id];
        const r = resultados[p.id];
        const color = colorEstado(c, r.estado);
        const error = v.errores[`p_${p.id}`];
        return (
          <Tarjeta key={p.id} style={{ borderLeftWidth: 6, borderLeftColor: color }}>
            <Texto variante="subtitulo">{p.nombre}</Texto>
            <Texto variante="secundario">Cada {formatearKm(intervalos[p.id] ?? p.intervaloKm, 0)}</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {MODOS.map((m) => (
                <Chip key={m.modo} texto={m.texto} activo={t.modo === m.modo} onPress={() => cambiarPieza(p.id, { modo: m.modo })} />
              ))}
            </View>
            {t.modo === 'FECHA' && (
              <Campo
                etiqueta="Fecha del último cambio o mantenimiento"
                placeholder="dd/mm/aaaa"
                keyboardType="numbers-and-punctuation"
                value={t.fecha}
                onChangeText={(x) => cambiarPieza(p.id, { fecha: x })}
                error={t.fecha ? error : null}
              />
            )}
            {t.modo === 'KM' && (
              <Campo
                etiqueta="Km desde el último cambio"
                keyboardType="decimal-pad"
                value={t.km}
                onChangeText={(x) => cambiarPieza(p.id, { km: x })}
                error={t.km ? error : null}
              />
            )}
            <BarraProgreso porcentaje={r.porcentaje} color={color} />
            <Fila
              etiqueta={`≈ ${formatearKm(r.kmDesdeServicio, 0)} usados`}
              valor={`${formatearNumero(r.porcentaje, 0)} %`}
            />
            {r.recortado && (
              <Texto variante="secundario" color={c.amarillo}>
                La estimación pasaba del kilometraje total; se limitó a ese valor.
              </Texto>
            )}
          </Tarjeta>
        );
      })}

      {hayErrores && (
        <Aviso titulo="Faltan datos" color={c.rojo}>
          <Texto>Completa los campos marcados para poder guardar.</Texto>
        </Aviso>
      )}
      <Boton texto={guardando ? 'Guardando…' : 'Guardar configuración'} onPress={guardar} deshabilitado={guardando} />
      <Boton texto="Cancelar" tipo="secundario" onPress={() => router.back()} />
    </Pantalla>
  );
}
