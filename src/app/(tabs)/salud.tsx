import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BarraProgreso, Chip, Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { Categoria, NOMBRE_CATEGORIA, NOMBRE_RIESGO } from '@/data/catalogo';
import { obtenerMoto } from '@/data/moto';
import { listarPiezas, Pieza } from '@/data/piezas';
import { useConsulta } from '@/data/use-db';
import { formatearKm, formatearNumero } from '@/domain/formato';
import { colorEstado, useColores } from '@/theme/colores';

const FILTROS: { clave: Categoria | null; texto: string }[] = [
  { clave: null, texto: 'Todos' },
  { clave: 'MOTOR', texto: NOMBRE_CATEGORIA.MOTOR },
  { clave: 'TRACCION', texto: NOMBRE_CATEGORIA.TRACCION },
  { clave: 'FRENOS', texto: NOMBRE_CATEGORIA.FRENOS },
  { clave: 'CHASIS', texto: NOMBRE_CATEGORIA.CHASIS },
];

/** Pantalla 2: Tablero de estado mecánico. */
export default function Salud() {
  const c = useColores();
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const { datos } = useConsulta(
    async (db) => ({
      moto: await obtenerMoto(db),
      piezas: await listarPiezas(db, { categoria: categoria ?? undefined }),
    }),
    categoria ?? 'TODAS',
  );

  const vencidas = datos?.piezas.filter((p) => p.estado === 'VENCIDO').length ?? 0;
  const alertas = datos?.piezas.filter((p) => p.estado === 'ALERTA').length ?? 0;

  return (
    <Pantalla>
      <Texto variante="titulo">Salud de la moto</Texto>
      {datos && (
        <Tarjeta>
          <Fila etiqueta="Odómetro" valor={formatearKm(datos.moto.odometroTotalKm)} />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Texto color={c.rojo} style={{ fontWeight: '700' }}>
              {vencidas} vencidas
            </Texto>
            <Texto color={c.amarillo} style={{ fontWeight: '700' }}>
              {alertas} en alerta
            </Texto>
          </View>
        </Tarjeta>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTROS.map((f) => (
          <Chip key={f.texto} texto={f.texto} activo={categoria === f.clave} onPress={() => setCategoria(f.clave)} />
        ))}
      </ScrollView>

      {datos?.piezas.map((p) => <TarjetaPieza key={p.id} pieza={p} />)}
    </Pantalla>
  );
}

function TarjetaPieza({ pieza: p }: { pieza: Pieza }) {
  const c = useColores();
  const color = colorEstado(c, p.estado);
  const restantes =
    p.kmRestantes >= 0 ? `Faltan ${formatearKm(p.kmRestantes, 0)}` : `Vencido hace ${formatearKm(-p.kmRestantes, 0)}`;
  return (
    <Tarjeta style={{ borderLeftWidth: 6, borderLeftColor: color }}>
      <Texto variante="subtitulo">{p.nombre}</Texto>
      <Texto variante="secundario">
        {NOMBRE_CATEGORIA[p.categoria]} · Riesgo {NOMBRE_RIESGO[p.nivelRiesgo].toLowerCase()} · cada{' '}
        {formatearKm(p.intervaloKm, 0)}
      </Texto>
      <BarraProgreso porcentaje={p.porcentaje} color={color} />
      <Fila etiqueta={`${formatearNumero(p.porcentaje, 0)} % usado`} valor={restantes} />
      <Texto variante="secundario">{p.accionTecnica}</Texto>
    </Tarjeta>
  );
}
