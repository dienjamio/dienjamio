# DiEnjamio · avisos

Mini app para el móvil que recibe los avisos de DiEnjamio (media mañana y merienda, de lunes a viernes) a través de OneSignal.

- `index.html`: activa los avisos y abre DiEnjamio.
- `OneSignalSDKWorker.js`: service worker de OneSignal.
- `manifest.webmanifest` e iconos: para instalarla en la pantalla de inicio.

La app de verdad sigue en Claude: https://claude.ai/artifact/LvGeruJa3M8ibwMCVNuSZZ

## Entrenador personal (`entrenador/`)

App web para entrenadores: metes los datos del deportista y genera su **plan semanal** completo.

- **Entrenos**: carrera, bici, natación, fuerza (con ejercicios, series y repeticiones), movilidad y días de descanso, con duración, zonas y estructura (calentamiento, parte principal, vuelta a la calma).
- **Periodización**: fase según las semanas que faltan para la prueba (base, construcción, específico, puesta a punto, semana de competición) y descarga cada 4.ª semana.
- **Objetivos**: salud, perder grasa, 5 km, 10 km, media maratón, maratón, marcha cicloturista y triatlón.
- **Zonas**: pulso (FC máx/reposo), ritmos por km (a partir de una marca de 5 o 10 km) y vatios (FTP).
- **Menú diario**: calorías y macros ajustados a la carga de cada día, con platos y cantidades; dieta omnívora, vegetariana o vegana, sin gluten y sin lactosa.
- Guarda varios deportistas en el navegador, imprime / exporta a PDF, copia el plan para WhatsApp y genera la semana siguiente con un botón.

Todo funciona en el navegador (sin servidor). Archivos: `index.html`, `styles.css`, `app.js`.
