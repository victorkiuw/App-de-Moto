import { Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { listarHistorialServicios } from '@/data/piezas';
import { useConsulta } from '@/data/use-db';
import { listarViajes } from '@/data/viajes';
import { formatearKm, formatearLitros } from '@/domain/formato';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE');

/** Pantalla 3: Historial. En la Fase 1 lista lo que haya; los resúmenes llegan después. */
export default function Historial() {
  const { datos } = useConsulta(async (db) => ({
    viajes: await listarViajes(db, { limite: 50 }),
    servicios: await listarHistorialServicios(db, { limite: 50 }),
  }));

  return (
    <Pantalla>
      <Texto variante="titulo">Historial</Texto>

      <Texto variante="subtitulo">Rodadas</Texto>
      {datos?.viajes.length === 0 && <Texto variante="secundario">Todavía no hay rodadas.</Texto>}
      {datos?.viajes.map((v) => (
        <Tarjeta key={v.id}>
          <Fila etiqueta={fecha(v.fechaInicio)} valor={formatearKm(v.distanciaKm)} />
          <Fila etiqueta={v.origen === 'MANUAL' ? 'Carga manual' : 'GPS'} valor={formatearLitros(v.litrosConsumidos)} />
        </Tarjeta>
      ))}

      <Texto variante="subtitulo">Servicios realizados</Texto>
      {datos?.servicios.length === 0 && <Texto variante="secundario">Todavía no hay servicios registrados.</Texto>}
      {datos?.servicios.map((s) => (
        <Tarjeta key={s.id}>
          <Texto style={{ fontWeight: '700' }}>{s.nombrePieza}</Texto>
          <Fila etiqueta={fecha(s.fechaServicio)} valor={formatearKm(s.kmAlMomentoServicio, 0)} />
          {s.observaciones ? <Texto variante="secundario">{s.observaciones}</Texto> : null}
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
