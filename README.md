# DiEnjamio · avisos

Mini app para el móvil que recibe los avisos de DiEnjamio (media mañana y merienda, de lunes a viernes) a través de OneSignal.

- `index.html`: activa los avisos y abre DiEnjamio.
- `OneSignalSDKWorker.js`: service worker de OneSignal.
- `manifest.webmanifest` e iconos: para instalarla en la pantalla de inicio.

La app de verdad sigue en Claude: https://claude.ai/artifact/LvGeruJa3M8ibwMCVNuSZZ

## Entrenador personal (`entrenador/`)

App web para entrenadores. Cada deportista tiene su ficha, su plan semanal y un enlace propio.

- **Pestañas**: Deportistas · Nuevo deportista · ficha de cada deportista (Semana, Menú, Carreras, Datos, Zonas).
- **Disponibilidad por día** con tiempo máximo: el plan nunca se pasa (p. ej. L-V 1h15, S-D 2h30).
- **Carreras** con fecha y prioridad: la A marca las fases (base, construcción, específico, puesta a punto); B y C van en su día y el plan se ajusta alrededor. Las semanas sin cambios a mano se rehacen solas.
- **Cambios a mano**: cualquier sesión se puede cambiar, mover, borrar o añadir.
- **Pulso**: FC máx, reposo, umbral o las zonas propias del deportista. Ritmos por marcas, vatios por FTP y ritmo de nado.
- **Datos**: sube actividades .FIT/.GPX/.TCX, la lista .CSV de Garmin Connect o Strava, e informes PDF. Sugiere FC máxima, marcas, FTP y volumen.
- **Objetivos**: salud, bajar peso, ganar músculo, vuelta tras lesión, 5 km, 10 km, media, maratón, bici y triatlón.
- **Enlace del deportista** (`ver.html?d=…`): ve su día, su semana, su menú y sus carreras, siempre actualizado. Necesita Firebase.

Archivos: `index.html` (entrenador), `ver.html` (deportista), `js/` (motor, lectura de archivos, almacenamiento, pantallas) y `js/firebase-config.js` (configuración de Firebase).
