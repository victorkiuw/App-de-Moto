import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColores } from '@/theme/colores';

/**
 * Contenedor de pantalla. `sinPestanas` deja espacio abajo para los botones de
 * navegación de Android en pantallas que no tienen la barra de pestañas.
 */
export function Pantalla({
  children,
  scroll = true,
  sinPestanas = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  sinPestanas?: boolean;
}) {
  const c = useColores();
  const contenido = scroll ? (
    <ScrollView contentContainerStyle={estilos.contenido}>{children}</ScrollView>
  ) : (
    <View style={[estilos.contenido, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={sinPestanas ? ['top', 'bottom'] : ['top']} style={{ flex: 1, backgroundColor: c.fondo }}>
      {contenido}
    </SafeAreaView>
  );
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColores();
  return (
    <View style={[estilos.tarjeta, { backgroundColor: c.superficie, borderColor: c.borde }, style]}>
      {children}
    </View>
  );
}

type Variante = 'titulo' | 'subtitulo' | 'normal' | 'secundario' | 'grande';

export function Texto({
  children,
  variante = 'normal',
  style,
  color,
}: {
  children: ReactNode;
  variante?: Variante;
  style?: TextStyle;
  color?: string;
}) {
  const c = useColores();
  const esSecundario = variante === 'secundario';
  return (
    <Text
      style={[estilos[variante], { color: color ?? (esSecundario ? c.textoSecundario : c.texto) }, style]}>
      {children}
    </Text>
  );
}

/** Barra de desgaste: se llena según el %, y desde 100 % queda llena en rojo. */
export function BarraProgreso({ porcentaje, color }: { porcentaje: number; color: string }) {
  const c = useColores();
  const ancho = Math.max(0, Math.min(100, porcentaje));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ancho) }}
      style={[estilos.barra, { backgroundColor: c.borde }]}>
      <View style={{ width: `${ancho}%`, height: '100%', backgroundColor: color, borderRadius: 6 }} />
    </View>
  );
}

export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  const c = useColores();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={[
        estilos.chip,
        { borderColor: activo ? c.acento : c.borde, backgroundColor: activo ? c.acento : 'transparent' },
      ]}>
      <Text style={{ color: activo ? c.textoSobreAcento : c.texto, fontWeight: '700', fontSize: 14 }}>
        {texto}
      </Text>
    </Pressable>
  );
}

export function Aviso({ titulo, children, color }: { titulo: string; children?: ReactNode; color?: string }) {
  const c = useColores();
  return (
    <View style={[estilos.aviso, { borderColor: color ?? c.acento }]}>
      <Texto variante="subtitulo" color={color ?? c.acento}>
        {titulo}
      </Texto>
      {children}
    </View>
  );
}

export function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.fila}>
      <Texto variante="secundario">{etiqueta}</Texto>
      <Texto style={{ fontWeight: '700' }}>{valor}</Texto>
    </View>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  ...props
}: TextInputProps & { etiqueta: string; ayuda?: string; error?: string | null }) {
  const c = useColores();
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Texto variante="secundario">{etiqueta}</Texto>
      <TextInput
        placeholderTextColor={c.textoSecundario}
        accessibilityLabel={etiqueta}
        {...props}
        style={[
          estilos.campo,
          { color: c.texto, borderColor: error ? c.rojo : c.borde, backgroundColor: c.fondo },
        ]}
      />
      {error ? (
        <Texto variante="secundario" color={c.rojo}>
          {error}
        </Texto>
      ) : ayuda ? (
        <Texto variante="secundario">{ayuda}</Texto>
      ) : null}
    </View>
  );
}

export function Boton({
  texto,
  onPress,
  tipo = 'principal',
  deshabilitado,
}: {
  texto: string;
  onPress: () => void;
  tipo?: 'principal' | 'secundario' | 'peligro';
  deshabilitado?: boolean;
}) {
  const c = useColores();
  const fondo = tipo === 'principal' ? c.acento : tipo === 'peligro' ? c.rojo : 'transparent';
  const colorTexto = tipo === 'principal' ? c.textoSobreAcento : tipo === 'peligro' ? '#FFFFFF' : c.texto;
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.boton,
        {
          backgroundColor: fondo,
          borderColor: tipo === 'secundario' ? c.borde : fondo,
          opacity: deshabilitado ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}>
      <Text style={{ color: colorTexto, fontSize: 16, fontWeight: '800' }}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  campo: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18 },
  boton: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  contenido: { padding: 16, gap: 12, paddingBottom: 32 },
  tarjeta: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  titulo: { fontSize: 26, fontWeight: '800' },
  subtitulo: { fontSize: 18, fontWeight: '700' },
  normal: { fontSize: 16 },
  secundario: { fontSize: 14 },
  grande: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  barra: { height: 12, borderRadius: 6, overflow: 'hidden' },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  aviso: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 6 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
