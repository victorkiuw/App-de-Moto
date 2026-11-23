import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inicializarBaseDatos } from '@/data/esquema';
import { NOMBRE_BD } from '@/data/use-db';
import { useColores } from '@/theme/colores';

const icono = (emoji: string) =>
  function Icono() {
    return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
  };

export default function RootLayout() {
  const c = useColores();
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={NOMBRE_BD} onInit={inicializarBaseDatos}>
        <StatusBar style="auto" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: c.acento,
            tabBarInactiveTintColor: c.textoSecundario,
            tabBarStyle: { backgroundColor: c.superficie, borderTopColor: c.borde, height: 64 },
            tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
            sceneStyle: { backgroundColor: c.fondo },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Cockpit', tabBarIcon: icono('🏍️') }} />
          <Tabs.Screen name="salud" options={{ title: 'Salud', tabBarIcon: icono('🔧') }} />
          <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: icono('📊') }} />
          <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icono('⚙️') }} />
        </Tabs>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
