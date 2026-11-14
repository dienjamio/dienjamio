
## Forma, bienestar, tiempo y zapatillas

- **Forma y fatiga** (pestaña Progreso): forma (42 días), fatiga (7 días), frescura y ratio de carga
  agudo:crónico. Usa el pulso de las actividades (TRIMP), si no el RPE × minutos del registro.
  Aviso si el ratio pasa de 1,5 o la frescura baja de −30.
- **Bienestar diario**: el deportista marca sueño, energía, piernas, ánimo y dolor en 10 segundos.
  Si sale bajo, su tarjeta de hoy le recomienda bajar el entreno; el entrenador recibe el aviso.
- **Tiempo** (Open-Meteo, sin clave): mejor hora para entrenar y ajuste de ritmo por calor y humedad.
- **Zapatillas**: km automáticos, aviso a los 600 y 800 km.
- Necesita en las reglas de Firestore los tipos `bienestar` y `material` (ver `firestore.rules`).

## Chat, predicción e informe mensual

- **Chat** entrenador ↔ deportista (pestaña 💬 Chat / botón flotante), también sobre un entreno concreto. Con ✓✓ de leído.
- **Predicción de carrera** que se actualiza sola (carreras y tests, ritmo frente a pulso en rodajes y mejores tramos de las últimas 8 semanas),
  con botón para actualizar los ritmos del plan a su forma actual.
- **Informe mensual en PDF** (Progreso → 📄 Informe del mes), con valoración del entrenador (opcionalmente redactada con Claude).
- Reglas: el tipo `mensaje` también tiene que estar permitido en `aportes`.

## Previsión de carrera (v2), resumen 360 y más cuidado al deportista

- **Previsión realista** con su forma actual (predicción de entrenos + marcas), separada del **objetivo**:
  parciales km a km ajustados al perfil que suman exactamente el objetivo, veredicto y explicación de cada segundo.
  El desnivel de los GPX se calcula sin el ruido del GPS (suavizado ±100 m + histéresis de 3 m); los tracks antiguos se recalculan solos.
- **📊 Resumen** del deportista: cumplimiento, km y horas, RPE, forma/fatiga/ratio, bienestar, pulso en reposo, peso,
  zapatillas, predicción y próxima carrera, con análisis completo opcional con Claude.
- Deportista: semana de carrera con checklist, «¿Cómo fue la carrera?» (actualiza sus marcas si es mejor),
  resumen de su semana los lunes, pulso en reposo y peso opcionales y «👀 Tu entrenador lo ha visto».
- Los aportes con tipos nuevos funcionan aunque las reglas sean antiguas (se guardan como `sesion` + `clase`).

## Avisos al móvil (ntfy)

- Gratis, sin cuentas, tarjeta ni servidor: cada persona instala la app **ntfy** y se suscribe a su canal secreto.
- Entrenador (Herramientas → 🔔 Avisos): entrenos registrados, bienestar malo o con dolor, mensajes, resultados y valoraciones, con preferencias.
- Deportista (Progreso → 🔔 Avisos en tu móvil): mensajes y comentarios del entrenador, «🔔 Avisar al móvil» desde su ficha,
  y recordatorio diario del entreno a la hora que elija (se programan hasta 2 días por delante al abrir su enlace).
