/* Previsión de carrera: track GPX → perfil kilómetro a kilómetro → ritmo y tiempo previstos. */
import { fmtRitmo, fmtHoras, parseTiempo } from "./util.js?v=202611141958";

const R = 6371000, RAD = Math.PI / 180;
function dist(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Lee un GPX (track o ruta) y devuelve el perfil resumido de la carrera. */
export function leerTrack(txt) {
  const doc = new DOMParser().parseFromString(txt, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El GPX está dañado");
  let pts = [...doc.getElementsByTagName("*")].filter(e => e.localName === "trkpt" || e.localName === "rtept")
    .map(p => { const ele = [...p.children].find(c => c.localName === "ele"); return { lat: +p.getAttribute("lat"), lon: +p.getAttribute("lon"), ele: ele ? +ele.textContent : null }; })
    .filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (pts.length < 2) throw new Error("El GPX no trae ningún recorrido");
  // distancia acumulada
  let d = 0; pts[0].d = 0;
  for (let i = 1; i < pts.length; i++) { d += dist(pts[i - 1], pts[i]); pts[i].d = d; }
  const conAltura = pts.filter(p => p.ele != null).length > pts.length * 0.8;
  // altura suavizada (media móvil de ±100 m) para quitar el ruido del GPS
  if (conAltura) {
    let ult = pts.find(p => p.ele != null).ele;
    pts.forEach(p => { if (p.ele == null) p.ele = ult; else ult = p.ele; });
    let i0 = 0, i1 = 0, suma = 0;
    const sm = [];
    for (let i = 0; i < pts.length; i++) {
      while (i1 < pts.length && pts[i1].d <= pts[i].d + 100) { suma += pts[i1].ele; i1++; }
      while (pts[i0].d < pts[i].d - 100) { suma -= pts[i0].ele; i0++; }
      sm.push(suma / (i1 - i0));
    }
    pts.forEach((p, i) => { p.e = sm[i]; });
  } else pts.forEach(p => { p.e = 0; });
  // subidas y bajadas con histéresis de 3 m: las oscilaciones pequeñas del GPS no cuentan como desnivel
  let refE = pts[0].e;
  pts.forEach(p => { p.g = 0; p.l = 0; const dz = p.e - refE; if (dz >= 3) { p.g = dz; refE = p.e; } else if (dz <= -3) { p.l = -dz; refE = p.e; } });
  // kilómetro a kilómetro
  const kms = [];
  let ini = 0;
  for (let k = 1000; ini < pts.length - 1; k += 1000) {
    let fin = pts.findIndex((p, i) => i > ini && p.d >= k);
    if (fin < 0) fin = pts.length - 1;
    let sube = 0, baja = 0;
    for (let i = ini + 1; i <= fin; i++) { sube += pts[i].g; baja += pts[i].l; }
    const len = pts[fin].d - pts[ini].d;
    if (len > 50) kms.push({ len: Math.round(len), sube: Math.round(sube), baja: Math.round(baja), net: Math.round(pts[fin].e - pts[ini].e) });
    ini = fin;
  }
  // perfil simplificado (≈ 160 puntos) para dibujarlo
  const paso = d / 160, perfil = [];
  for (let x = 0, j = 0; x <= d; x += paso) { while (j < pts.length - 1 && pts[j].d < x) j++; perfil.push([Math.round(pts[j].d), Math.round(pts[j].e)]); }
  // mapa simplificado
  const pasoM = Math.max(1, Math.floor(pts.length / 200));
  const mapa = pts.filter((_, i) => i % pasoM === 0).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
  return { v: 2, dist: Math.round(d), sube: kms.reduce((t, k) => t + k.sube, 0), baja: kms.reduce((t, k) => t + k.baja, 0), conAltura, kms, perfil, mapa };
}

/** Factor de ritmo por desnivel: cada 1 % de subida ≈ +3,3 %; la bajada ayuda menos y si es muy fuerte frena. */
function factorDesnivel(k) {
  const up = k.sube / k.len * 100, down = k.baja / k.len * 100;
  let f = 1 + 0.033 * up - 0.018 * Math.min(down, 8);
  if (down > 10) f += 0.01 * (down - 10);
  return Math.max(0.9, f);
}

/** Tracks guardados con la versión antigua (desnivel con ruido): se recalculan a partir del perfil guardado. */
export function normalizarTrack(t) {
  if (!t || t.v === 2 || !t.perfil?.length || !t.kms?.length) return t;
  const P = t.perfil;
  let ref = P[0][1];
  const g = P.map(([, e], i) => { if (!i) return [0, 0]; const dz = e - ref; if (dz >= 3) { ref = e; return [dz, 0]; } if (dz <= -3) { ref = e; return [0, -dz]; } return [0, 0]; });
  let ini = 0;
  const kms = t.kms.map(k => {
    const fin = ini + k.len;
    let sube = 0, baja = 0;
    P.forEach(([d], i) => { if (d > ini && d <= fin + (fin >= t.dist - 5 ? 50 : 0)) { sube += g[i][0]; baja += g[i][1]; } });
    ini = fin;
    return { ...k, sube: Math.round(sube), baja: Math.round(baja) };
  });
  return { ...t, v: 2, kms, sube: kms.reduce((x, k) => x + k.sube, 0), baja: kms.reduce((x, k) => x + k.baja, 0) };
}

const DIST = { "5k": 5, "10k": 10, media: 21.0975, maraton: 42.195 };

/** Tiempo objetivo escrito de cualquier forma: «48:48», «sub 48:48», «bajar de 48'48''», «1:45», «1:45:00». */
export function tiempoObjetivo(txt, km) {
  if (!txt) return 0;
  const t = String(txt).replace(/[’']{2}|″|"/g, "").replace(/[’'′h]/g, ":").replace(/\s+/g, "");
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (!m) return 0;
  if (m[3] != null) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  return km >= 21 && +m[1] <= 6 ? +m[1] * 3600 + +m[2] * 60 : +m[1] * 60 + +m[2];
}

/** Tiempo en llano para «km» desde un tiempo conocido en otra distancia (Riegel, 1,06). */
const riegel = (t, d0, d1) => t * Math.pow(d1 / d0, 1.06);
function desde(tiempos, km) {
  const [k] = Object.entries(DIST).sort((a, b) => Math.abs(Math.log(a[1] / km)) - Math.abs(Math.log(b[1] / km)))[0];
  return riegel(tiempos[k], DIST[k], km);
}

/**
 * Ritmo realista en llano (s/km) con su explicación.
 * Usa la forma actual (predicción de los entrenos) y las marcas de su ficha; nunca el objetivo.
 */
export function ritmoReal(c, Z, pred, km) {
  const deMarcas = Z?.carrera?.["10k"] && !Z.ritmoEstimado ? desde(Object.fromEntries(Object.keys(DIST).map(k => [k, Z.carrera[k].t])), km) : null;
  const dePred = pred?.tiempos ? desde(pred.tiempos, km) : null;
  if (dePred && (pred.fiab === "alta" || !deMarcas)) return { p: dePred / km, de: `su forma actual (VDOT ${String(pred.vdot).replace(".", ",")}, con ${pred.fuente})` };
  if (dePred && deMarcas) {
    const w = pred.fiab === "media" ? 0.6 : 0.3, t = dePred * w + deMarcas * (1 - w);
    return { p: t / km, de: `su forma actual (${fmtHoras(dePred)}, ${Math.round(w * 100)} %) y sus marcas (${fmtHoras(deMarcas)}, ${Math.round((1 - w) * 100)} %)` };
  }
  if (deMarcas) return { p: deMarcas / km, de: "sus marcas de la ficha" };
  return null;
}

/** Previsión realista + plan de parciales para el objetivo. pred: predicción por la forma actual (opcional). */
export function prevision(c, Z, pred = null) {
  if (c.track && c.track.v !== 2) c = { ...c, track: normalizarTrack(c.track) };
  const km = c.track ? c.track.dist / 1000 : (DIST[c.prueba] || +c.km || 0);
  if (!km) return null;
  const tramos = c.track ? c.track.kms : Array.from({ length: Math.ceil(km) }, (_, i) => ({ len: Math.min(1000, Math.round((km - i) * 1000)), sube: 0, baja: 0, net: 0 }));
  const neg = c.estrategia === "negativa";
  // factor de cada km: desnivel × estrategia
  const fT = tramos.map(factorDesnivel);
  const fE = tramos.map((t, i) => (neg ? (i < tramos.length / 2 ? 1.012 : 0.988) : 1) * (i === 0 && c.estrategia !== "agresiva" ? 1.01 : 1));
  const f = tramos.map((_, i) => fT[i] * fE[i]);
  const sumF = tramos.reduce((t, x, i) => t + x.len / 1000 * f[i], 0);
  const llano = tramos.reduce((t, x) => t + x.len / 1000, 0);
  const sumT = tramos.reduce((t, x, i) => t + x.len / 1000 * fT[i], 0);
  const real = ritmoReal(c, Z, pred, km);
  let objT = tiempoObjetivo(c.objetivo, km);
  if (!objT && c.ritmoObjetivo && parseTiempo(c.ritmoObjetivo)) objT = parseTiempo(c.ritmoObjetivo) * km;
  if (!real && !objT) return { km, falta: true };
  const baseObj = objT ? objT / sumF : null;
  let acR = 0, acO = 0;
  const kms = tramos.map((t, i) => {
    const ritmo = real ? real.p * f[i] : null, tiempo = ritmo ? ritmo * t.len / 1000 : null;
    const ritmoObj = baseObj ? baseObj * f[i] : null, tiempoObj = ritmoObj ? ritmoObj * t.len / 1000 : null;
    acR += tiempo || 0; acO += tiempoObj || 0;
    let nota = "";
    if (t.sube / t.len > 0.025) nota = "Subida: mantén el esfuerzo, no el ritmo";
    else if (t.baja / t.len > 0.025) nota = "Bajada: suelta piernas y aprovecha sin frenar";
    else if (i === 0 && c.estrategia !== "agresiva") nota = "Salida: controla, que el ritmo te lo pide la emoción";
    else if (i === tramos.length - 1) nota = "¡Último! Vacía lo que quede";
    return { km: i + 1, len: t.len, sube: t.sube, baja: t.baja, ritmo, tiempo, acum: acR, ritmoObj, tiempoObj, acumObj: acO, nota };
  });
  const duro = kms.slice().sort((a, b) => (b.sube - b.baja) / b.len - (a.sube - a.baja) / a.len)[0];
  const total = real ? acR : null;
  return {
    km, total: total ?? objT, ritmoMedio: (total ?? objT) / km, base: real?.p ?? baseObj, de: real?.de || "su objetivo", kms,
    real: !!real, obj: objT || null, ritmoObjMedio: objT ? objT / km : null, baseObj,
    costeDesnivel: real ? real.p * (sumT - llano) : baseObj ? baseObj * (sumT - llano) : 0,
    costeSalida: (real?.p ?? baseObj ?? 0) * 0.01 * (tramos[0]?.len || 0) / 1000 * (c.estrategia !== "agresiva" ? 1 : 0),
    sube: c.track?.sube || 0, baja: c.track?.baja || 0, duro: duro && duro.sube > 15 ? duro.km : null
  };
}

export const txtPrev = p => p && !p.falta ? `${fmtHoras(p.total)} (${fmtRitmo(p.ritmoMedio)} /km)` : "";
