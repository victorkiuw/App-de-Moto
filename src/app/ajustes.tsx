import Constants from 'expo-constants';

import { Fila, Pantalla, Tarjeta, Texto } from '@/components/ui';
import { obtenerAjustes } from '@/data/ajustes';
import { VERSION_ESQUEMA } from '@/data/esquema';
import { obtenerMoto } from '@/data/moto';
import { useConsulta } from '@/data/use-db';
import { formatearBs, formatearKm, formatearLitros, formatearNumero } from '@/domain/formato';

const siNo = (b: boolean) => (b ? 'Sí' : 'No');

/** Ajustes: en la Fase 1 solo muestra la configuración guardada. La edición llega después. */
export default function Ajustes() {
  const { datos } = useConsulta(async (db) => ({ moto: await obtenerMoto(db), ajustes: await obtenerAjustes(db) }));
  if (!datos) return <Pantalla>{null}</Pantalla>;
  const { moto, ajustes } = datos;

  return (
    <Pantalla>
      <Texto variante="titulo">Ajustes</Texto>

      <Tarjeta>
        <Texto variante="subtitulo">Moto</Texto>
        <Fila etiqueta="Modelo" valor={`${moto.modelo} (${moto.anio})`} />
        <Fila etiqueta="Capacidad del tanque" valor={formatearLitros(moto.capacidadTanqueL, 0)} />
        <Fila etiqueta="Alerta de reserva" valor={formatearKm(moto.kmAlertaReserva, 0)} />
        <Fila etiqueta="Consumo de fábrica" valor={`${formatearNumero(moto.factorConsumoFabricaLKm, 3)} L/km`} />
        <Fila etiqueta="Aprender consumo real" valor={siNo(moto.usarConsumoReal)} />
      </Tarjeta>

      <Tarjeta>
        <Texto variante="subtitulo">Dinero</Texto>
        <Fila
          etiqueta="Gasolina (por litro)"
          valor={ajustes.precioLitroBs != null ? formatearBs(ajustes.precioLitroBs) : 'Sin configurar'}
        />
        <Fila
          etiqueta="Tasa BCV"
          valor={ajustes.tasaBcv != null ? `${formatearNumero(ajustes.tasaBcv, 2)} Bs/$` : 'Sin descargar'}
        />
        <Fila etiqueta="Actualizar tasa sola" valor={siNo(ajustes.tasaAutomatica)} />
      </Tarjeta>

      <Tarjeta>
        <Texto variante="subtitulo">Notificaciones</Texto>
        <Fila etiqueta="Reserva de gasolina" valor={siNo(ajustes.notifReserva)} />
        <Fila etiqueta="Pieza en alerta" valor={siNo(ajustes.notifPiezaAlerta)} />
        <Fila etiqueta="Pieza vencida" valor={siNo(ajustes.notifPiezaVencida)} />
      </Tarjeta>

      <Tarjeta>
        <Texto variante="subtitulo">GPS</Texto>
        <Fila etiqueta="Pausa por debajo de" valor={`${ajustes.filtroVelocidadMinKmh} km/h`} />
        <Fila etiqueta="Precisión mínima" valor={`${ajustes.filtroPrecisionMaxM} m`} />
        <Fila etiqueta="Mapa" valor={siNo(ajustes.mapaActivo)} />
      </Tarjeta>

      <Texto variante="secundario">
        Versión {Constants.expoConfig?.version ?? '?'} · Base de datos v{VERSION_ESQUEMA}
      </Texto>
    </Pantalla>
  );
}
