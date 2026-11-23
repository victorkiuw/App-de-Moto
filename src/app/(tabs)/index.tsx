import { router } from 'expo-router';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { Aviso, BarraProgreso, Boton, Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { obtenerAjustes } from '@/data/ajustes';
import { obtenerMoto } from '@/data/moto';
import { tomarPiezasQueEmpeoraron } from '@/data/piezas';
import { useConsulta, useDb } from '@/data/use-db';
import { estadoTanque, litrosConsumidos } from '@/domain/combustible';
import {
  formatearBs,
  formatearDuracion,
  formatearKm,
  formatearLitros,
  formatearNumero,
  formatearUsd,
} from '@/domain/formato';
import { bsAUsd, costoCombustibleBs } from '@/domain/moneda';
import { sinSenal } from '@/domain/rastreo';
import { PermisoGpsError } from '@/gps/servicio';
import { useRodada } from '@/gps/use-rodada';
import { useColores } from '@/theme/colores';

/** Pantalla 1: Cockpit. Telemetría de la rodada en vivo y estado general de la moto. */
export default function Cockpit() {
  const c = useColores();
  const db = useDb();
  const { datos, error } = useConsulta(async (d) => ({ moto: await obtenerMoto(d), ajustes: await obtenerAjustes(d) }));
  const { rodada, ocupado, iniciar, finalizar, descartar } = useRodada();

  if (error) {
    return (
      <Pantalla>
        <Aviso titulo="Error al leer la base de datos" color={c.rojo}>
          <Texto>{error.message}</Texto>
        </Aviso>
      </Pantalla>
    );
  }
  if (!datos) return <Pantalla>{null}</Pantalla>;
  const { moto, ajustes } = datos;

  const enCurso = rodada.viaje != null;

  async function onIniciar() {
    try {
      await iniciar();
    } catch (e) {
      if (e instanceof PermisoGpsError) {
        Alert.alert('Falta un permiso', e.message, [
          { text: 'Ahora no', style: 'cancel' },
          e.problema === 'UBICACION_APAGADA'
            ? { text: 'Entendido' }
            : { text: 'Abrir permisos', onPress: () => Linking.openSettings() },
        ]);
      } else {
        Alert.alert('No se pudo iniciar el GPS', e instanceof Error ? e.message : String(e));
      }
    }
  }

  function onFinalizar() {
    Alert.alert('¿Finalizar la rodada?', 'Los kilómetros se suman al odómetro y al desgaste de las piezas.', [
      { text: 'Seguir rodando', style: 'cancel' },
      {
        text: 'Finalizar',
        style: 'destructive',
        onPress: async () => {
          try {
            const v = await finalizar();
            const empeoradas = await tomarPiezasQueEmpeoraron(db);
            if (v) {
              const lineas = [
                `${formatearKm(v.distanciaKm)} en ${formatearDuracion(v.duracionSegundos)}`,
                `Gasolina: ${formatearLitros(v.litrosConsumidos)}${v.costoBs != null ? ` (${formatearBs(v.costoBs)})` : ''}`,
                `Velocidad máxima: ${formatearNumero(v.velocidadMaximaKmh, 0)} km/h`,
              ];
              if (empeoradas.length) {
                lineas.push('', 'Piezas que cambiaron de color:');
                for (const p of empeoradas) lineas.push(`• ${p.nombre}: ${p.estado === 'VENCIDO' ? 'VENCIDA' : 'en alerta'}`);
              }
              Alert.alert('Rodada guardada', lineas.join('\n'));
            }
          } catch (e) {
            Alert.alert('No se pudo finalizar', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  function onDescartar() {
    Alert.alert('¿Descartar esta rodada?', 'No se suma ningún kilómetro. Úsalo si la iniciaste por error.', [
      { text: 'No', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => descartar().catch(() => undefined) },
    ]);
  }

  // ---- Rodada en curso ----
  if (enCurso) {
    const e = rodada.estado;
    const km = e?.distanciaKm ?? rodada.viaje!.distanciaKm;
    const litros = litrosConsumidos(km, rodada.viaje!.factorConsumoLKm);
    const costo = ajustes.precioLitroBs != null ? costoCombustibleBs(litros, ajustes.precioLitroBs) : null;
    const usd = costo != null ? bsAUsd(costo, ajustes.tasaBcv) : null;
    const segundos = (rodada.ahora - Date.parse(rodada.viaje!.fechaInicio)) / 1000;

    let estadoTexto: string;
    let estadoColor: string;
    if (!rodada.gps) {
      estadoTexto = 'GPS detenido';
      estadoColor = c.rojo;
    } else if (sinSenal(e, rodada.ahora)) {
      estadoTexto = 'Buscando señal GPS…';
      estadoColor = c.amarillo;
    } else if (e?.enMovimiento) {
      estadoTexto = '● En movimiento';
      estadoColor = c.verde;
    } else {
      estadoTexto = '⏸ En pausa (parado)';
      estadoColor = c.amarillo;
    }

    return (
      <Pantalla>
        <Texto variante="subtitulo" color={estadoColor}>
          {estadoTexto}
        </Texto>

        {!rodada.gps && (
          <Aviso titulo="La rodada quedó abierta pero el GPS no está midiendo" color={c.rojo}>
            <Texto>
              Pasa si el teléfono cerró la app. Toca Reanudar para seguir midiendo; los km ya contados se
              conservan.
            </Texto>
            <Boton texto="Reanudar GPS" onPress={onIniciar} deshabilitado={ocupado} />
          </Aviso>
        )}

        <Tarjeta style={{ alignItems: 'center' }}>
          <Texto variante="secundario">Rodada actual</Texto>
          <Text
            style={{ color: c.texto, fontSize: 88, fontWeight: '900', fontVariant: ['tabular-nums'] }}
            adjustsFontSizeToFit
            numberOfLines={1}>
            {formatearNumero(km, 1)}
          </Text>
          <Texto variante="subtitulo">km</Texto>
        </Tarjeta>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Metrica titulo="Velocidad" valor={formatearNumero(e?.velocidadActualKmh ?? 0, 0)} unidad="km/h" />
          <Metrica titulo="Tiempo" valor={formatearDuracion(segundos)} unidad="" />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Metrica titulo="Gasolina" valor={formatearNumero(litros, 2)} unidad="L" />
          <Metrica
            titulo="Costo"
            valor={costo != null ? formatearNumero(costo, 0) : '—'}
            unidad={costo != null ? (usd != null ? `Bs · ${formatearUsd(usd)}` : 'Bs') : 'sin precio'}
          />
        </View>

        <Tarjeta>
          <Fila etiqueta="Velocidad máxima" valor={`${formatearNumero(e?.velocidadMaximaKmh ?? 0, 0)} km/h`} />
          <Fila etiqueta="Tiempo en movimiento" valor={formatearDuracion(e?.movimientoSegundos ?? 0)} />
          <Fila
            etiqueta="Precisión del GPS"
            valor={e?.precisionActualM != null ? `± ${formatearNumero(e.precisionActualM, 0)} m` : '—'}
          />
        </Tarjeta>

        <BotonGrande texto="FINALIZAR VIAJE" color={c.rojo} onPress={onFinalizar} deshabilitado={ocupado} />
        <Boton texto="Descartar rodada" tipo="secundario" onPress={onDescartar} deshabilitado={ocupado} />
      </Pantalla>
    );
  }

  // ---- Sin rodada ----
  const tanque = estadoTanque({
    odometroKm: moto.odometroTotalKm,
    odometroUltimoTanqueoKm: moto.odometroUltimoTanqueoKm,
    capacidadL: moto.capacidadTanqueL,
    factorLKm: moto.factorConsumoLKm,
    kmAlertaReserva: moto.kmAlertaReserva,
  });

  return (
    <Pantalla>
      <Texto variante="titulo">{moto.modelo}</Texto>

      {!moto.configuracionCompleta && (
        <Aviso titulo="Falta la configuración inicial">
          <Texto>
            Antes de rodar hay que cargar el kilometraje y el estado de cada pieza. Si no sabes los km
            exactos, el asistente los estima por fechas.
          </Texto>
          <Boton texto="Configurar mi moto" onPress={() => router.push('/configuracion')} />
        </Aviso>
      )}

      <BotonGrande texto={ocupado ? 'INICIANDO…' : 'INICIAR VIAJE'} color={c.verde} onPress={onIniciar} deshabilitado={ocupado} />

      <Tarjeta>
        <Texto variante="secundario">Odómetro total</Texto>
        <Texto variante="grande">{formatearNumero(moto.odometroTotalKm, 1)}</Texto>
        <Texto variante="secundario">kilómetros</Texto>
      </Tarjeta>

      <Tarjeta>
        <Texto variante="subtitulo">Tanque (estimado)</Texto>
        <BarraProgreso
          porcentaje={tanque.fraccionRestante * 100}
          color={tanque.enReserva ? c.rojo : tanque.fraccionRestante < 0.35 ? c.amarillo : c.verde}
        />
        <Fila etiqueta="Desde el último tanqueo" valor={formatearKm(tanque.kmDesdeTanqueo)} />
        <Fila etiqueta="Gasolina restante" valor={formatearLitros(tanque.litrosEstimadosRestantes, 1)} />
        <Fila etiqueta="Autonomía" valor={formatearKm(tanque.kmRestantesEstimados, 0)} />
        <Fila
          etiqueta="Consumo usado"
          valor={`${formatearNumero(moto.factorConsumoLKm, 4)} L/km (${formatearNumero(1 / moto.factorConsumoLKm, 1)} km/L)`}
        />
      </Tarjeta>
    </Pantalla>
  );
}

function Metrica({ titulo, valor, unidad }: { titulo: string; valor: string; unidad: string }) {
  return (
    <Tarjeta style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Texto variante="secundario">{titulo}</Texto>
      <Texto style={{ fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{valor}</Texto>
      {unidad ? <Texto variante="secundario">{unidad}</Texto> : null}
    </Tarjeta>
  );
}

function BotonGrande({
  texto,
  color,
  onPress,
  deshabilitado,
}: {
  texto: string;
  color: string;
  onPress: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: color,
        borderRadius: 20,
        paddingVertical: 28,
        alignItems: 'center',
        opacity: deshabilitado ? 0.5 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 1 }}>{texto}</Text>
    </Pressable>
  );
}
