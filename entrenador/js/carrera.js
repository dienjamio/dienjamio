/* Previsión de carrera: track GPX → perfil kilómetro a kilómetro → ritmo y tiempo previstos. */
import { fmtRitmo, fmtHoras, parseTiempo } from "./util.js?v=202611141518";

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
  // altura suavizada (media móvil de ±60 m) para quitar el ruido del GPS
  if (conAltura) {
    let ult = pts.find(p => p.ele != null).ele;
    pts.forEach(p => { if (p.ele == null) p.ele = ult; else ult = p.ele; });
    let i0 = 0, i1 = 0, suma = 0;
    const sm = [];
    for (let i = 0; i < pts.length; i++) {
      while (i1 < pts.length && pts[i1].d <= pts[i].d + 60) { suma += pts[i1].ele; i1++; }
      while (pts[i0].d < pts[i].d - 60) { suma -= pts[i0].ele; i0++; }
      sm.push(suma / (i1 - i0));
    }
    pts.forEach((p, i) => { p.e = sm[i]; });
  } else pts.forEach(p => { p.e = 0; });
  // kilómetro a kilómetro
  const kms = [];
  let ini = 0;
  for (let k = 1000; ini < pts.length - 1; k += 1000) {
    let fin = pts.findIndex((p, i) => i > ini && p.d >= k);
    if (fin < 0) fin = pts.length - 1;
    let sube = 0, baja = 0;
    for (let i = ini + 1; i <= fin; i++) { const dz = pts[i].e - pts[i - 1].e; if (dz > 0) sube += dz; else baja -= dz; }
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
  return { dist: Math.round(d), sube: kms.reduce((t, k) => t + k.sube, 0), baja: kms.reduce((t, k) => t + k.baja, 0), conAltura, kms, perfil, mapa };
}

/** Factor de ritmo por desnivel: cada 1 % de subida ≈ +3,3 %; la bajada ayuda menos y si es muy fuerte frena. */
function factorDesnivel(k) {
  const up = k.sube / k.len * 100, down = k.baja / k.len * 100;
  let f = 1 + 0.033 * up - 0.018 * Math.min(down, 8);
  if (down > 10) f += 0.01 * (down - 10);
  return Math.max(0.9, f);
}

/** Ritmo base en llano (s/km) para una distancia, por marcas del deportista o por el objetivo escrito. */
export function ritmoBase(c, Z, km) {
  if (c.ritmoObjetivo && parseTiempo(c.ritmoObjetivo)) return { p: parseTiempo(c.ritmoObjetivo), de: "ritmo objetivo marcado por el entrenador" };
  if (c.objetivo && /^\d{1,2}:\d{2}(:\d{2})?$/.test(c.objetivo.trim())) return { p: parseTiempo(c.objetivo.trim()) / km, de: "tiempo objetivo de la carrera" };
  if (Z?.carrera?.["10k"]) { const t = Z.carrera["10k"].t * Math.pow(km / 10, 1.06); return { p: t / km, de: "sus marcas (fórmula de Riegel)" }; }
  return null;
}

/** Previsión completa. Devuelve null si no hay con qué calcular el ritmo. */
export function prevision(c, Z) {
  const km = c.track ? c.track.dist / 1000 : ({ "5k": 5, "10k": 10, media: 21.0975, maraton: 42.195 }[c.prueba] || +c.km || 0);
  if (!km) return null;
  const base = ritmoBase(c, Z, km);
  if (!base) return { km, falta: true };
  const tramos = c.track ? c.track.kms : Array.from({ length: Math.ceil(km) }, (_, i) => ({ len: Math.min(1000, Math.round((km - i) * 1000)), sube: 0, baja: 0, net: 0 }));
  const fs = tramos.map(factorDesnivel);
  // estrategia: negativa = primera mitad un 1,5 % más lenta y segunda un 1,5 % más rápida
  const neg = c.estrategia === "negativa";
  let acum = 0;
  const kms = tramos.map((t, i) => {
    let f = fs[i];
    if (neg) f *= (i < tramos.length / 2 ? 1.015 : 0.985);
    if (i === 0 && c.estrategia !== "agresiva") f *= 1.01; // salida controlada
    const ritmo = base.p * f, tiempo = ritmo * t.len / 1000;
    acum += tiempo;
    const pend = t.net / t.len * 100;
    let nota = "";
    if (t.sube / t.len > 0.025) nota = "Subida: mantén el esfuerzo, no el ritmo";
    else if (t.baja / t.len > 0.025) nota = "Bajada: suelta piernas y recupera";
    else if (i === tramos.length - 1) nota = "¡Último! Vacía lo que quede";
    return { km: i + 1, len: t.len, sube: t.sube, baja: t.baja, pend: Math.round(pend * 10) / 10, ritmo, tiempo, acum, nota };
  });
  const duro = kms.slice().sort((a, b) => (b.sube - b.baja) / b.len - (a.sube - a.baja) / a.len)[0];
  return {
    km, total: acum, ritmoMedio: acum / km, base: base.p, de: base.de, kms,
    sube: c.track?.sube || 0, baja: c.track?.baja || 0, duro: duro && duro.sube > 15 ? duro.km : null
  };
}

export const txtPrev = p => p && !p.falta ? `${fmtHoras(p.total)} (${fmtRitmo(p.ritmoMedio)} /km)` : "";
