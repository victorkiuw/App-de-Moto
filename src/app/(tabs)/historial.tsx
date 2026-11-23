import { Alert } from 'react-native';

import { Boton, Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { listarHistorialServicios } from '@/data/piezas';
import { useConsulta, useDb } from '@/data/use-db';
import { listarViajes } from '@/data/viajes';
import { formatearDuracion, formatearKm, formatearLitros } from '@/domain/formato';
import { resumenDiagnostico } from '@/domain/rastreo';
import { compartirDatosGps } from '@/services/compartir-gps';
import { useColores } from '@/theme/colores';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

/** Pantalla 3: Historial. Rodadas y servicios; los resúmenes semanales llegan en la v0.5. */
export default function Historial() {
  const db = useDb();
  const c = useColores();
  const { datos } = useConsulta(async (d) => ({
    viajes: await listarViajes(d, { limite: 50 }),
    servicios: await listarHistorialServicios(d, { limite: 50 }),
  }));

  async function compartir(id: number) {
    try {
      await compartirDatosGps(db, id);
    } catch (e) {
      Alert.alert('No se pudo compartir', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Pantalla>
      <Texto variante="titulo">Historial</Texto>

      <Texto variante="subtitulo">Rodadas</Texto>
      {datos?.viajes.length === 0 && <Texto variante="secundario">Todavía no hay rodadas.</Texto>}
      {datos?.viajes.map((v) => {
        const diag = v.diagnostico ? resumenDiagnostico(v.diagnostico) : null;
        return (
          <Tarjeta key={v.id}>
            <Fila etiqueta={`${fecha(v.fechaInicio)} · ${hora(v.fechaInicio)}`} valor={formatearKm(v.distanciaKm)} />
            <Fila
              etiqueta={v.origen === 'MANUAL' ? 'Carga manual' : `GPS · ${formatearDuracion(v.duracionSegundos)}`}
              valor={formatearLitros(v.litrosConsumidos)}
            />
            {diag && <Texto variante="secundario">{diag.linea}</Texto>}
            {diag?.avisos.map((a) => (
              <Texto key={a} variante="secundario" color={c.amarillo}>
                ⚠ {a}
              </Texto>
            ))}
            {v.origen === 'GPS' && (
              <Boton texto="Compartir datos GPS" tipo="secundario" onPress={() => compartir(v.id)} />
            )}
          </Tarjeta>
        );
      })}

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
