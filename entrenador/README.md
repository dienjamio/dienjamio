
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
