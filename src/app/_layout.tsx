import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inicializarBaseDatos } from '@/data/esquema';
import { NOMBRE_BD } from '@/data/use-db';
import { useColores } from '@/theme/colores';

/**
 * Navegación raíz: una pila con las pestañas abajo y, encima, las pantallas
 * que se abren desde ellas (como el asistente de configuración).
 */
export default function RootLayout() {
  const c = useColores();
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={NOMBRE_BD} onInit={inicializarBaseDatos}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fondo } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="configuracion" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
