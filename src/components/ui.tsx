import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColores } from '@/theme/colores';

export function Pantalla({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColores();
  const contenido = scroll ? (
    <ScrollView contentContainerStyle={estilos.contenido}>{children}</ScrollView>
  ) : (
    <View style={[estilos.contenido, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.fondo }}>
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

const estilos = StyleSheet.create({
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
