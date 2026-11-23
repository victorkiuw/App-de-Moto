import { router } from 'expo-router';
import { View } from 'react-native';

import { Aviso, BarraProgreso, Boton, Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { obtenerMoto } from '@/data/moto';
import { useConsulta } from '@/data/use-db';
import { estadoTanque } from '@/domain/combustible';
import { formatearKm, formatearLitros, formatearNumero } from '@/domain/formato';
import { useColores } from '@/theme/colores';

/** Pantalla 1: Cockpit. En la Fase 1 muestra el estado general; el GPS llega en la Fase 2. */
export default function Cockpit() {
  const c = useColores();
  const { datos: moto, error } = useConsulta(obtenerMoto);

  if (error) {
    return (
      <Pantalla>
        <Aviso titulo="Error al leer la base de datos" color={c.rojo}>
          <Texto>{error.message}</Texto>
        </Aviso>
      </Pantalla>
    );
  }
  if (!moto) return <Pantalla>{null}</Pantalla>;

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

      <View style={{ opacity: 0.5 }}>
        <Tarjeta style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Texto variante="subtitulo">INICIAR VIAJE</Texto>
          <Texto variante="secundario">El GPS se activa en la Fase 2</Texto>
        </Tarjeta>
      </View>
    </Pantalla>
  );
}
