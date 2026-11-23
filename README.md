# Moto SBR 150 — Telemetría y mantenimiento

App Android personal para la **Bera SBR 150 (2024)**. Hace tres cosas:

- Mide las rodadas por GPS, incluso con la pantalla apagada.
- Estima el combustible y lo que cuesta, en Bs y en dólares a la tasa BCV.
- Lleva el desgaste de 18 piezas con un semáforo verde, amarillo y rojo.

Funciona sin internet. El mapa y la descarga de la tasa usan internet cuando hay conexión.

## Estado

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Proyecto, base de datos, catálogo, lógica, pruebas y asistente de configuración | ✅ Lista |
| 2 | GPS en segundo plano y filtro de parada | ✅ Lista (falta probar en la calle) |
| 3 | Consumo y odómetros conectados al viaje | ⏳ (la lógica ya está hecha) |
| 4 | Cockpit, semáforos, mantenimiento, ajustes editables, mapa | ⏳ |
| 5 | Pruebas en la calle y APK final | ⏳ |

## Cómo compilar el APK (desde el teléfono)

1. En GitHub, abre el repositorio y entra en **Actions**.
2. Elige **Compilar APK**, toca **Run workflow**, selecciona la rama y confirma.
3. Espera unos 15 a 25 minutos. El APK aparece en **Releases**. Descárgalo e instálalo; Android pedirá permiso para instalar apps de fuentes desconocidas.

Cada versión nueva se instala encima de la anterior sin perder datos, porque siempre se firma con la misma clave.

## Estructura

```
src/
  domain/      Lógica pura: Haversine, filtro GPS, combustible, semáforo, moneda, formato
  data/        SQLite: esquema y migraciones, catálogo, moto, piezas, viajes, tanqueos, respaldo
  gps/         Tarea de GPS en segundo plano, permisos y estado en vivo de la rodada
  services/    Tasa BCV (DolarAPI)
  app/         Pantallas (expo-router): Cockpit, Salud, Historial, Ajustes
  components/  Componentes de interfaz
  theme/       Paletas de alto contraste
```

## Decisiones de diseño

- **El desgaste se calcula desde el odómetro.** Cada pieza guarda en qué kilometraje se le hizo el último servicio, y el desgaste es `odómetro actual − ese kilometraje`. Así no hay contadores que se desincronicen. Corregir el odómetro también ajusta las piezas.
- **Semáforo:** verde hasta 75 %, amarillo por encima de 75 % y por debajo de 100 %, rojo desde 100 %.
- **Consumo real:** se aprende con el método de tanque lleno a tanque lleno, usando los últimos 5 ciclos. Se descartan los valores fuera de 17–83 km/L, que suelen ser errores al anotar. Si no hay datos suficientes, se usa el de fábrica: 0,026 L/km.
- **Tanqueo parcial:** atrasa el contador de reserva en los km equivalentes a los litros cargados.
- **Filtro GPS:** se descartan las lecturas con precisión peor que 25 m y los saltos imposibles (más de 160 km/h). El odómetro se pausa por debajo de 3 km/h.
- **Respaldo:** se exporta e importa un JSON con todos los datos. La importación ocurre en una sola transacción: si falla, no se pierde nada.
- **Estilos:** se usa `StyleSheet` nativo en lugar de NativeWind para evitar incompatibilidades con Expo SDK 58.

## GPS en segundo plano

- `index.ts` registra la tarea del GPS antes que cualquier pantalla: Android puede despertar la app solo para entregarle lecturas.
- La tarea usa su propia conexión a SQLite. Las transacciones usan `BEGIN IMMEDIATE` y `busy_timeout`, así el GPS y la pantalla no chocan.
- El odómetro de la rodada se guarda después de cada lote (tabla `rastreo_estado`). Si Android mata el servicio, al abrir la app se puede reanudar sin perder km.
- En Xiaomi/Poco hay que poner la batería de la app en "Sin restricciones" (ver Ajustes).

## Desarrollo

```bash
npm install
npm test           # pruebas (Jest; la BD se prueba con node:sqlite, requiere Node ≥ 22)
npm run typecheck
npm run lint
```
