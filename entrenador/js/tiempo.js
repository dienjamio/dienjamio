/* Tiempo para entrenar (Open-Meteo: gratis y sin clave) y ajuste del ritmo por calor y humedad.
   La ubicación solo se guarda en este móvil. */
const GEO = "entrenador.geo";
export const geoGuardada = () => { try { return JSON.parse(localStorage.getItem(GEO) || "null"); } catch (e) { return null; } };

export function pedirUbicacion() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error("Este móvil no deja saber la ubicación."));
    navigator.geolocation.getCurrentPosition(p => {
      const g = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) }; // ~1 km: suficiente y más privado
      try { localStorage.setItem(GEO, JSON.stringify(g)); } catch (e) { }
      ok(g);
    }, () => mal(new Error("Sin permiso de ubicación: actívalo para ver el tiempo.")), { timeout: 10000, maximumAge: 3600000 });
  });
}

const CACHE = "entrenador.tiempo";
export async function tiempoHoy(g) {
  try { const c = JSON.parse(sessionStorage.getItem(CACHE) || "null"); if (c && c.k === `${g.lat},${g.lon}` && Date.now() - c.t < 1800000) return c.d; } catch (e) { }
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&hourly=temperature_2m,dew_point_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code&forecast_days=2&timezone=auto`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("No se ha podido cargar el tiempo.");
  const d = await r.json();
  try { sessionStorage.setItem(CACHE, JSON.stringify({ k: `${g.lat},${g.lon}`, t: Date.now(), d })); } catch (e) { }
  return d;
}

const ICO = c => c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "❄️" : c <= 82 ? "🌦️" : "⛈️";

/** Ajuste por calor: suma de temperatura y punto de rocío en °F (tabla habitual de entrenadores). [% min, % max] */
export function ajusteCalor(t, dp) {
  const s = (t * 9 / 5 + 32) + (dp * 9 / 5 + 32);
  const T = [[100, 0, 0], [110, 0, 1], [120, 1, 2], [130, 2, 3], [140, 3, 4.5], [150, 4.5, 6], [160, 6, 8], [170, 8, 10], [180, 10, 12]];
  if (s <= 100) return null;
  if (s > 180) return { pct: [12, 15], extremo: true };
  const f = T.find(x => s <= x[0]);
  return { pct: [f[1], f[2]], extremo: false };
}

/**
 * Resumen para hoy: hora actual, mejor hora que queda (entre 7 y 21 h) y consejos.
 * ritmoRef: ritmo de rodaje en s/km para traducir el ajuste a segundos.
 */
export function resumenTiempo(d, ritmoRef = 360, ahora = new Date()) {
  const H = d.hourly, dia = H.time[0].slice(0, 10);
  const horas = H.time.map((t, i) => ({ t, h: +t.slice(11, 13), dia: t.slice(0, 10), temp: H.temperature_2m[i], dp: H.dew_point_2m[i], st: H.apparent_temperature[i], lluvia: H.precipitation_probability[i] ?? 0, viento: H.wind_speed_10m[i], code: H.weather_code[i] }));
  const hAhora = ahora.getHours();
  const hoyH = horas.filter(x => x.dia === dia);
  const ya = hoyH.find(x => x.h === hAhora) || hoyH[0];
  const quedan = hoyH.filter(x => x.h >= Math.max(hAhora, 7) && x.h <= 21);
  const nota = x => Math.abs(x.st - 12) + x.lluvia / 8 + Math.max(0, x.viento - 20) / 3;
  const mejor = quedan.length ? quedan.reduce((m, x) => nota(x) < nota(m) ? x : m) : null;
  const ref = mejor || ya;
  const consejos = [];
  const cal = ajusteCalor(ref.temp, ref.dp);
  if (cal) {
    const s1 = Math.round(ritmoRef * cal.pct[0] / 100), s2 = Math.round(ritmoRef * cal.pct[1] / 100);
    consejos.push(cal.extremo ? "🥵 Calor y humedad extremos: mejor cinta, piscina o cambia la hora. Nada de series fuera."
      : `🥵 Calor y humedad: ve ${s1 === s2 ? s2 : `${s1}-${s2}`} s/km más lento que tus ritmos y bebe antes de tener sed. Manda el pulso.`);
  }
  if (ref.temp <= 3) consejos.push("🧤 Frío: guantes, gorro y calienta más rato antes de apretar.");
  if (ref.viento >= 25) consejos.push(`💨 Viento de ${Math.round(ref.viento)} km/h: guíate por el pulso y las sensaciones, no por el ritmo. Empieza con viento de cara.`);
  if (ref.lluvia >= 60) consejos.push("🌧️ Probable lluvia: ropa técnica y vaselina en pies; cuidado con suelos resbaladizos en las series.");
  return { ahora: ya, mejor, consejos, ico: ICO };
}

export function htmlTiempo(R) {
  const f = x => `${R.ico(x.code)} ${Math.round(x.temp)} °C${Math.abs(x.st - x.temp) >= 3 ? ` (sensación ${Math.round(x.st)})` : ""} · 💨 ${Math.round(x.viento)} km/h${x.lluvia >= 20 ? ` · 🌧️ ${x.lluvia} %` : ""}`;
  return `<div class="tiempo">
    <div class="ti-fila"><b>Ahora</b><span>${f(R.ahora)}</span></div>
    ${R.mejor && R.mejor.t !== R.ahora.t ? `<div class="ti-fila"><b>Mejor hora: ${R.mejor.h}:00</b><span>${f(R.mejor)}</span></div>` : ""}
    ${R.consejos.map(c => `<p>${c}</p>`).join("")}
  </div>`;
}
