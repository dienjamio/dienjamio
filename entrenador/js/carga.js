/* Carga de entrenamiento: forma (fitness), fatiga y frescura, como en TrainingPeaks / Garmin.
   - Carga de cada entreno: TRIMP de Banister si hay pulso; si no, RPE × minutos; si no, minutos × intensidad del tipo.
   - Forma (CTL) = media exponencial de 42 días · Fatiga (ATL) = 7 días · Frescura (TSB) = forma − fatiga.
   - Ratio agudo:crónico (fatiga / forma): por encima de 1,5 la carga sube demasiado rápido (más riesgo de lesión). */
import { hoy, sumaDias, diasEntre } from "./util.js?v=202611160954";

const num = x => parseFloat(String(x ?? "").replace(",", ".")) || 0;
const segs = t => { const p = String(t || "").trim().split(":").map(Number); if (!t || p.some(isNaN)) return 0; return p.length === 1 ? p[0] * 60 : p.reduce((a, b) => a * 60 + b, 0); };
const INT_TIPO = { calidad: 1.6, test: 1.8, competicion: 1.9, largo: 1.15, suave: 1, recuperacion: 0.7, iniciacion: 0.6, readapt: 0.7, activacion: 0.9, tecnica: 0.9, transicion: 1.4, fuerza: 0.8, movilidad: 0.3, manual: 1 };
const FACT_DEP = { run: 1, bike: 0.8, swim: 0.9, fuerza: 0.8, movilidad: 0.3 };

/** TRIMP de Banister (≈ 100 por una hora en torno al umbral). */
function trimp(min, fcMed, fcmax, fcrep, mujer) {
  const hrr = Math.min(1, Math.max(0, (fcMed - fcrep) / Math.max(1, fcmax - fcrep)));
  return min * hrr * (mujer ? 0.86 * Math.exp(1.67 * hrr) : 0.64 * Math.exp(1.92 * hrr));
}

/** Carga de una actividad importada o subida. */
export function cargaAct(a, Z = {}, mujer = false) {
  const min = (a.dur || 0) / 60;
  if (!min) return 0;
  if (a.fcMed && Z.fcmax && Z.fcrep && a.fcMed > Z.fcrep) return trimp(min, a.fcMed, Z.fcmax, Z.fcrep, mujer);
  return min * (FACT_DEP[a.dep] ?? 0.8);
}

/** Carga de un registro del deportista (sin archivo de reloj). */
export function cargaReg(r, ses) {
  if (r.hecho === "no") return 0;
  const min = segs(r.tiempo) / 60 || (+r.min || +ses?.min || 0) * (r.hecho === "parcial" ? 0.5 : 1);
  const rpe = num(r.rpe);
  if (rpe) return min * rpe * 0.25;
  return min * (INT_TIPO[ses?.tipo] ?? 1) * (FACT_DEP[ses?.dep] ?? 1);
}

/**
 * Serie diaria de carga, forma, fatiga y frescura.
 * semanas: instantáneas del plan (para saber el tipo de cada sesión registrada) · aportes: buzón del deportista
 * actividades: las del reloj · Z: { fcmax, fcrep } · dias: cuántos días devolver.
 */
export function calcCarga({ semanas = {}, aportes = [], actividades = [], Z = {}, mujer = false, dias = 84 }) {
  const h = hoy(), desde = sumaDias(h, -Math.max(dias, 120));
  const L = {};
  const conAct = new Set();
  for (const a of actividades) {
    if (!a.fecha || a.fecha < desde || a.fecha > h) continue;
    L[a.fecha] = (L[a.fecha] || 0) + cargaAct(a, Z, mujer);
    conAct.add(a.fecha + "|" + a.dep);
  }
  for (const r of aportes) {
    if (r.tipo !== "sesion" || !r.lunes) continue;
    const f = sumaDias(r.lunes, r.dia || 0);
    if (f < desde || f > h) continue;
    const ses = semanas[r.lunes]?.dias?.[r.dia]?.ses?.find(s => s.id === r.sesId);
    const dep = ses?.dep || r.act?.dep || "run";
    if (r.act) { if (!conAct.has(f + "|" + (r.act.dep || dep))) { L[f] = (L[f] || 0) + cargaAct(r.act, Z, mujer); conAct.add(f + "|" + (r.act.dep || dep)); } continue; }
    if (conAct.has(f + "|" + dep)) continue; // ya contado con el archivo del reloj
    L[f] = (L[f] || 0) + cargaReg(r, ses);
  }
  const fechas = Object.keys(L).sort();
  if (!fechas.length) return null;
  const serie = [];
  const ini = fechas[0] < desde ? desde : fechas[0];
  // arrancar con la carga media de las primeras 6 semanas (si no, la forma sale artificialmente baja al principio)
  let m0 = 0; for (let k = 0; k < 42; k++) m0 += L[sumaDias(ini, k)] || 0; m0 /= 42;
  let ctl = m0, atl = m0;
  for (let f = ini; f <= h; f = sumaDias(f, 1)) {
    const l = L[f] || 0;
    const tsb = ctl - atl; // frescura con la que se llega al día
    ctl += (l - ctl) / 42; atl += (l - atl) / 7;
    serie.push({ f, l: Math.round(l), ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +tsb.toFixed(1) });
  }
  const u = serie[serie.length - 1];
  const hace7 = serie[serie.length - 8];
  const historial = diasEntre(ini, h);
  const acwr = u.ctl > 8 && historial >= 21 ? u.atl / u.ctl : null;
  const tsb = u.ctl - u.atl;
  const estado = tsb > 15 ? ["fresco", "Muy fresco: buen momento para competir (o le falta carga)"]
    : tsb > 5 ? ["forma", "Fresco y en forma"]
    : tsb > -10 ? ["equilibrio", "Equilibrado: asimilando bien"]
    : tsb > -30 ? ["carga", "Cargando: fatiga productiva"]
    : ["fatiga", "Muy fatigado: necesita descanso"];
  return {
    serie: serie.slice(-dias), ctl: Math.round(u.ctl), atl: Math.round(u.atl), tsb: Math.round(tsb),
    acwr: acwr ? Math.round(acwr * 100) / 100 : null, tendencia: hace7 ? Math.round(u.ctl - hace7.ctl) : 0,
    estado: estado[0], estadoTxt: estado[1], historial
  };
}

/** Gráfica SVG: forma (línea), fatiga (línea) y frescura (barras). */
export function htmlCarga(C, titulo = "Forma y fatiga") {
  if (!C || C.serie.length < 7) return "";
  const S = C.serie, W = 600, H = 170, n = S.length;
  const max = Math.max(20, ...S.map(s => Math.max(s.ctl, s.atl))), lo = Math.max(0, Math.min(...S.map(s => Math.min(s.ctl, s.atl))) * 0.85), tmin = Math.min(-10, ...S.map(s => s.tsb)), tmax = Math.max(10, ...S.map(s => s.tsb));
  const x = i => (i / (n - 1) * W).toFixed(1), y = v => (8 + (1 - (v - lo) / Math.max(1, max - lo)) * 92).toFixed(1);
  const base = H - 34, esc_t = Math.max(Math.abs(tmin), tmax) || 1, yt = v => (base - v / esc_t * 24).toFixed(1);
  const lin = k => S.map((s, i) => `${x(i)},${y(s[k])}`).join(" ");
  const barras = S.map((s, i) => `<rect x="${(+x(i) - 1.5).toFixed(1)}" y="${Math.min(+yt(s.tsb), base)}" width="3" height="${Math.abs(+yt(s.tsb) - base).toFixed(1)}" class="${s.tsb >= 0 ? "tsb-pos" : s.tsb < -30 ? "tsb-mal" : "tsb-neg"}"/>`).join("");
  const meses = S.map((s, i) => s.f.endsWith("-01") ? `<text x="${x(i)}" y="${H - 2}" class="ax">${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+s.f.slice(5, 7) - 1]}</text>` : "").join("");
  const acwr = C.acwr ? `<div class="kpi ${C.acwr > 1.5 ? "mal" : C.acwr > 1.3 ? "ojo" : C.acwr < 0.8 ? "ojo" : "ok"}"><b>${String(C.acwr).replace(".", ",")}</b><span>ratio carga ${C.acwr > 1.5 ? "· ⚠️ sube demasiado rápido" : C.acwr > 1.3 ? "· al límite" : C.acwr < 0.8 ? "· perdiendo forma" : "· zona segura"}</span></div>` : "";
  return `<article class="dia carga-g"><div class="dia-cab"><h3>📈 ${titulo}</h3><span class="estado-c ${C.estado}">${C.estadoTxt}</span></div>
    <div class="kpis-c">
      <div class="kpi"><b>${C.ctl}</b><span>forma ${C.tendencia > 0 ? `▲ ${C.tendencia}` : C.tendencia < 0 ? `▼ ${-C.tendencia}` : ""} en 7 días</span></div>
      <div class="kpi"><b>${C.atl}</b><span>fatiga</span></div>
      <div class="kpi"><b>${C.tsb > 0 ? "+" : ""}${C.tsb}</b><span>frescura</span></div>${acwr}
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="graf-carga" role="img" aria-label="Forma ${C.ctl}, fatiga ${C.atl}, frescura ${C.tsb}">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="cero"/>${barras}
      <polyline points="${lin("atl")}" class="l-atl"/><polyline points="${lin("ctl")}" class="l-ctl"/>${meses}
    </svg>
    <div class="ley-c"><span class="c-ctl">Forma</span><span class="c-atl">Fatiga</span><span class="c-tsb">Frescura</span></div>
    ${C.historial < 42 ? `<p class="small">Con menos de 6 semanas de datos la forma sale baja: se irá afinando.</p>` : ""}
  </article>`;
}

/* ---------------- Bienestar diario (cómo se levanta) ---------------- */
export const BIEN_PREG = [["sueno", "Sueño", ["😫", "😕", "😐", "🙂", "😴"]], ["energia", "Energía", ["🪫", "😩", "😐", "💪", "⚡"]], ["piernas", "Piernas", ["🧱", "😣", "😐", "🙂", "🦵"]], ["animo", "Ánimo", ["😞", "😕", "😐", "🙂", "😄"]]];
/** 0-100 a partir de las respuestas (1-5); el dolor limita a 40. */
export function puntuarBien(b) {
  if (!b) return null;
  const v = BIEN_PREG.map(([k]) => +b[k]).filter(x => x >= 1 && x <= 5);
  if (!v.length) return null;
  let p = Math.round((v.reduce((t, x) => t + x, 0) / v.length - 1) / 4 * 100);
  if (b.dolor) p = Math.min(p, 40);
  return p;
}
export const nivelBien = p => p == null ? "" : p >= 70 ? "ok" : p >= 45 ? "ojo" : "mal";
