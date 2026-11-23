import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColores } from '@/theme/colores';

const icono = (emoji: string) =>
  function Icono() {
    return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const c = useColores();
  // En Android 15+ la app se dibuja detrás de los botones de navegación del sistema:
  // la barra de pestañas tiene que dejarles su espacio.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.acento,
        tabBarInactiveTintColor: c.textoSecundario,
        tabBarStyle: {
          backgroundColor: c.superficie,
          borderTopColor: c.borde,
          height: 64 + bottom,
          paddingBottom: bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        sceneStyle: { backgroundColor: c.fondo },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Cockpit', tabBarIcon: icono('🏍️') }} />
      <Tabs.Screen name="salud" options={{ title: 'Salud', tabBarIcon: icono('🔧') }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: icono('📊') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icono('⚙️') }} />
    </Tabs>
  );
}
