/* Predicción de carrera que se actualiza sola con los entrenos recientes.
   Fuentes (últimas 8 semanas), de más a menos fiable:
   1) Carreras y tests registrados (tiempo + distancia reales).
   2) Ritmo frente a pulso en rodajes continuos: a qué % de la reserva cardiaca va cada ritmo → VO2máx (VDOT).
   3) Mejores tramos de 5 km o más dentro de los entrenos (cota mínima: casi nunca son a tope). */
import { vdotDe, tiempoVdot } from "./motor.js?v=202611141916";
import { hoy, sumaDias, fmtHoras, fmtRitmo, esc, diasEntre } from "./util.js?v=202611141916";

const D = { "5k": 5000, "10k": 10000, media: 21097.5, maraton: 42195 };
const NOM = { "5k": "5 km", "10k": "10 km", media: "Media maratón", maraton: "Maratón" };
const vo2 = v => -4.60 + 0.182258 * v + 0.000104 * v * v; // v en m/min
const segs = t => { const p = String(t || "").trim().split(":").map(Number); if (!t || p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const num = x => parseFloat(String(x ?? "").replace(",", ".")) || 0;
const mediana = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

function vdotVentana({ actividades = [], aportes = [], semanas = {}, Z = {} }, fin, dias = 56) {
  const ini = sumaDias(fin, -dias);
  const enV = f => f && f > ini && f <= fin;
  // 1) carreras y tests
  const reales = [];
  for (const r of aportes) {
    if (r.tipo !== "sesion" || r.hecho === "no" || !r.lunes) continue;
    const f = sumaDias(r.lunes, r.dia || 0); if (!enV(f)) continue;
    const ses = semanas[r.lunes]?.dias?.[r.dia]?.ses?.find(s => s.id === r.sesId);
    if (!ses || !["competicion", "test"].includes(ses.tipo) || ses.dep !== "run") continue;
    const km = r.act?.km || num(r.km) || (ses.tipo === "test" ? 5 : D[ses.carrera?.prueba] / 1000);
    const t = r.act?.dur || segs(r.tiempo);
    if (km >= 3 && t && t / km > 150 && t / km < 600) reales.push({ v: vdotDe(km * 1000, t), f, que: ses.tipo === "test" ? "test de 5 km" : ses.carrera?.nombre || "carrera" });
  }
  // 2) ritmo frente a pulso
  const porPulso = [];
  const { fcmax, fcrep } = Z;
  // 3) mejores tramos
  const tramos = [];
  for (const a of actividades) {
    if (a.dep !== "run" || !enV(a.fecha) || !a.km || !a.dur) continue;
    const ritmo = a.dur / a.km;
    if (ritmo < 160 || ritmo > 600) continue;
    for (const k of ["5k", "10k", "media", "maraton"]) if (a.mejores?.[k] && a.mejores[k] / (D[k] / 1000) > 150) tramos.push(vdotDe(D[k], a.mejores[k]));
    if (fcmax && fcrep && a.fcMed && a.dur >= 1200 && a.km >= 3 && (!a.sube || a.sube / a.km < 15)) {
      const hrr = (a.fcMed - fcrep) / (fcmax - fcrep);
      if (hrr > 0.5 && hrr < 0.92) porPulso.push((vo2(1000 / ritmo * 60) - 3.5) / hrr + 3.5);
    }
  }
  const real = reales.sort((a, b) => b.v - a.v)[0] || null;
  const pulso = porPulso.length >= 3 ? mediana(porPulso) : null;
  const tramo = tramos.length ? Math.max(...tramos) : null;
  let v = null, fuente = "", fiab = "";
  if (real) { v = Math.max(real.v, tramo || 0); fuente = `su ${real.que} del ${real.f.slice(8)}/${real.f.slice(5, 7)}`; fiab = "alta"; }
  else if (pulso) { v = Math.max(pulso, tramo || 0); fuente = `ritmo y pulso de ${porPulso.length} rodajes`; fiab = porPulso.length >= 6 ? "media" : "baja"; }
  else if (tramo) { v = tramo; fuente = `sus mejores tramos de entreno (${tramos.length})`; fiab = "baja"; }
  return v ? { v, fuente, fiab, n: reales.length + porPulso.length + tramos.length } : null;
}

/**
 * Devuelve { vdot, tiempos: {5k: s, ...}, fuente, fiab, tend (VDOT de diferencia con hace 4 semanas), kmSem }
 */
export function predecir(datos) {
  const h = hoy();
  const ahora = vdotVentana(datos, h);
  if (!ahora) return null;
  const antes = vdotVentana(datos, sumaDias(h, -28));
  const kmSem = (datos.actividades || []).filter(a => a.dep === "run" && a.fecha > sumaDias(h, -28)).reduce((t, a) => t + (a.km || 0), 0) / 4;
  const tiempos = {};
  for (const [k, m] of Object.entries(D)) {
    let t = tiempoVdot(ahora.v, m);
    // fondo: con poco volumen las distancias largas salen más lentas de lo que dice el VDOT
    if (k === "media") t *= kmSem < 20 ? 1.04 : kmSem < 30 ? 1.02 : 1;
    if (k === "maraton") t *= kmSem < 30 ? 1.1 : kmSem < 45 ? 1.06 : kmSem < 60 ? 1.03 : 1.01;
    tiempos[k] = t;
  }
  return { vdot: Math.round(ahora.v * 10) / 10, tiempos, fuente: ahora.fuente, fiab: ahora.fiab, tend: antes ? Math.round((ahora.v - antes.v) * 10) / 10 : null, kmSem: Math.round(kmSem) };
}

/** Tarjeta de predicción. Z: zonas actuales (para comparar con los ritmos que está usando). prox: próxima carrera. */
export function htmlPrediccion(pr, Z = null, prox = null, ed = false) {
  if (!pr) return "";
  const t10 = pr.tiempos["10k"], ref = Z?.carrera?.["10k"]?.t;
  const dif = ref ? Math.round((ref - t10) / 10) : 0; // s/km
  const k = prox && D[prox.prueba] ? prox.prueba : null;
  const obj = k && prox.objetivo ? segs(prox.objetivo) : 0;
  return `<article class="dia pred"><div class="dia-cab"><h3>🔮 Predicción con su forma de ahora</h3><span class="fiab ${pr.fiab}">fiabilidad ${pr.fiab}</span></div>
    ${k ? `<div class="pred-prox"><span>🏁 ${esc(prox.nombre || NOM[k])} · ${diasEntre(hoy(), prox.fecha)} días</span><b>${fmtHoras(pr.tiempos[k])}</b><span>${fmtRitmo(pr.tiempos[k] / (D[k] / 1000))} /km${obj ? ` · objetivo ${esc(prox.objetivo)} ${pr.tiempos[k] <= obj * 1.005 ? "✅ a su alcance" : `(le faltan ${fmtHoras(pr.tiempos[k] - obj)})`}` : ""}</span></div>` : ""}
    <div class="wrap"><table><tr><th>Prueba</th><th>Tiempo</th><th>Ritmo</th></tr>
      ${Object.keys(D).map(x => `<tr${x === k ? ' class="sel"' : ""}><td>${NOM[x]}</td><td><b>${fmtHoras(pr.tiempos[x])}</b></td><td>${fmtRitmo(pr.tiempos[x] / (D[x] / 1000))} /km</td></tr>`).join("")}
    </table></div>
    <p class="small">VDOT ${String(pr.vdot).replace(".", ",")}${pr.tend != null && Math.abs(pr.tend) >= 0.3 ? ` · ${pr.tend > 0 ? "▲ mejorando" : "▼ bajando"} (${pr.tend > 0 ? "+" : ""}${String(pr.tend).replace(".", ",")} en 4 semanas)` : pr.tend != null ? " · estable en 4 semanas" : ""} · calculado con ${esc(pr.fuente)}${pr.kmSem ? ` · ${pr.kmSem} km/semana` : ""}.
    ${pr.kmSem < 45 ? " El maratón y la media se ajustan por el volumen que lleva." : ""}</p>
    ${ed && ref && Math.abs(dif) >= 3 ? `<div class="pred-acc"><span>${dif > 0 ? `Va <b>${dif} s/km más rápido</b> que los ritmos que usa su plan.` : `Va <b>${-dif} s/km más lento</b> que los ritmos que usa su plan.`}</span><button class="btn sec mini" data-acc="usar-pred">Actualizar sus ritmos</button></div>` : ""}
  </article>`;
}
