/* Lectura de archivos de actividad: FIT, GPX, TCX y CSV (Garmin Connect / Strava).
   Todo se procesa en el navegador; solo se guarda el resumen de cada actividad. */
import { iso, parseTiempo, sumaDias, lunesDe, hoy } from "./util.js";

const DISTANCIAS = { "1k": 1000, "5k": 5000, "10k": 10000, media: 21097.5, maraton: 42195 };

export async function leerArchivo(file) {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".fit")) return [deSerie(leerFIT(await file.arrayBuffer()), "FIT", file.name)];
  if (nombre.endsWith(".gpx")) return [deSerie(leerGPX(await file.text()), "GPX", file.name)];
  if (nombre.endsWith(".tcx")) return [deSerie(leerTCX(await file.text()), "TCX", file.name)];
  if (nombre.endsWith(".csv")) return leerCSV(await file.text());
  throw new Error("Formato no reconocido: usa .fit, .gpx, .tcx o .csv");
}

/* ---------------- Series → resumen ---------------- */
function deporteDe(t) {
  t = String(t || "").toLowerCase();
  if (/run|carrera|correr|trail|cinta|treadmill|footing|jog/.test(t)) return "run";
  if (/bik|cicl|ride|bici|cycling|mtb|gravel|spinning|indoor_cycling|virtual/.test(t)) return "bike";
  if (/swim|nata|piscina|pool|open_water/.test(t)) return "swim";
  if (/strength|fuerza|weight|gym|pesas|training/.test(t)) return "fuerza";
  if (/walk|camin|hik|sender/.test(t)) return "andar";
  return "otro";
}
function haversine(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function mejorTiempo(t, d, D) {
  // menor tiempo para cubrir D metros (dos punteros)
  let best = Infinity, i = 0;
  for (let j = 0; j < t.length; j++) {
    while (i + 1 < j && d[j] - d[i + 1] >= D) i++;
    const dd = d[j] - d[i];
    if (dd >= D && t[j] > t[i]) best = Math.min(best, (t[j] - t[i]) * D / dd);
  }
  return isFinite(best) ? Math.round(best) : null;
}
function mejorPotencia(t, p, seg) {
  let best = 0, i = 0, suma = 0;
  for (let j = 1; j < t.length; j++) {
    suma += (p[j] || 0) * (t[j] - t[j - 1]);
    while (t[j] - t[i] > seg && i < j) { suma -= (p[i + 1] || 0) * (t[i + 1] - t[i]); i++; }
    if (t[j] - t[i] >= seg * 0.98) best = Math.max(best, suma / (t[j] - t[i]));
  }
  return best ? Math.round(best) : null;
}
function deSerie(s, fuente, archivo) {
  const pts = s.puntos.filter(p => p.t != null).sort((a, b) => a.t - b.t);
  if (!pts.length && !s.resumen) throw new Error("El archivo no tiene datos de la actividad");
  // distancia acumulada
  let acum = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].d != null) { acum = pts[i].d; continue; }
    if (i && pts[i].lat != null && pts[i - 1].lat != null) acum += haversine(pts[i - 1], pts[i]);
    pts[i].d = acum;
  }
  const t0 = pts.length ? pts[0].t : s.resumen.inicio;
  const t = pts.map(p => (p.t - t0) / 1000), d = pts.map(p => p.d || 0);
  const hr = pts.map(p => p.hr).filter(x => x > 40 && x < 230);
  // FC máx "sostenida": máximo de la mínima de cada 5 muestras seguidas (evita picos falsos)
  let fcMax = null;
  if (hr.length > 5) { fcMax = 0; for (let i = 4; i < hr.length; i++) fcMax = Math.max(fcMax, Math.min(hr[i], hr[i - 1], hr[i - 2], hr[i - 3], hr[i - 4])); }
  const R = s.resumen || {};
  const dep = deporteDe(R.deporte || s.deporte || archivo);
  const dur = R.dur || (t.length ? t[t.length - 1] : 0);
  const dist = R.dist != null ? R.dist : (d.length ? d[d.length - 1] : 0);
  const act = {
    id: `${new Date(t0).toISOString().slice(0, 16)}-${dep}`,
    fecha: iso(new Date(t0)), dep, fuente, archivo,
    km: Math.round(dist / 10) / 100, dur: Math.round(dur),
    fcMed: R.fcMed || (hr.length ? Math.round(hr.reduce((x, y) => x + y, 0) / hr.length) : null),
    fcMax: R.fcMax ? Math.max(R.fcMax, fcMax || 0) : fcMax,
    potMed: R.potMed || null, mejores: {}
  };
  if (dep === "run" && pts.length > 10) for (const [k, D] of Object.entries(DISTANCIAS)) if (dist >= D) { const b = mejorTiempo(t, d, D); if (b) act.mejores[k] = b; }
  const pot = pts.map(p => p.w);
  if (dep === "bike" && pot.some(x => x > 0)) { act.p20 = mejorPotencia(t, pot, 1200); if (!act.potMed) act.potMed = Math.round(pot.reduce((x, y) => x + (y || 0), 0) / pot.length); }
  return act;
}

/* ---------------- GPX / TCX ---------------- */
const porNombre = (el, n) => [...el.getElementsByTagName("*")].filter(x => x.localName === n);
const hijo = (el, n) => [...el.children].find(x => x.localName === n);
function xml(txt) {
  const doc = new DOMParser().parseFromString(txt, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El archivo está dañado o no es XML válido");
  return doc;
}
function leerGPX(txt) {
  const doc = xml(txt);
  const tipo = porNombre(doc, "type")[0]?.textContent || porNombre(doc, "name")[0]?.textContent || "";
  const puntos = porNombre(doc, "trkpt").map(p => {
    const ext = n => { const e = porNombre(p, n)[0]; return e ? +e.textContent : null; };
    const time = hijo(p, "time")?.textContent;
    return { lat: +p.getAttribute("lat"), lon: +p.getAttribute("lon"), t: time ? Date.parse(time) : null, hr: ext("hr"), w: ext("power") ?? ext("PowerInWatts") };
  });
  return { deporte: tipo, puntos };
}
function leerTCX(txt) {
  const doc = xml(txt);
  const act = porNombre(doc, "Activity")[0];
  const deporte = act?.getAttribute("Sport") || "";
  const puntos = porNombre(doc, "Trackpoint").map(p => {
    const time = hijo(p, "Time")?.textContent;
    const pos = hijo(p, "Position");
    const hrEl = hijo(p, "HeartRateBpm");
    const dEl = hijo(p, "DistanceMeters");
    const wEl = porNombre(p, "Watts")[0];
    return {
      t: time ? Date.parse(time) : null, d: dEl ? +dEl.textContent : null,
      lat: pos ? +hijo(pos, "LatitudeDegrees")?.textContent : null, lon: pos ? +hijo(pos, "LongitudeDegrees")?.textContent : null,
      hr: hrEl ? +hijo(hrEl, "Value")?.textContent : null, w: wEl ? +wEl.textContent : null
    };
  });
  const laps = porNombre(doc, "Lap");
  let resumen = null;
  if (laps.length) {
    const num = (l, n) => +(hijo(l, n)?.textContent || 0);
    resumen = { deporte, dur: laps.reduce((t, l) => t + num(l, "TotalTimeSeconds"), 0), dist: laps.reduce((t, l) => t + num(l, "DistanceMeters"), 0) };
    const mx = laps.map(l => +(hijo(hijo(l, "MaximumHeartRateBpm") || l, "Value")?.textContent || 0));
    if (Math.max(...mx) > 0) resumen.fcMax = Math.max(...mx);
  }
  return { deporte, puntos, resumen };
}

/* ---------------- FIT (formato binario de Garmin y otros) ---------------- */
const FIT_EPOCH = 631065600; // 1989-12-31 en segundos unix
const SPORT = { 0: "otro", 1: "run", 2: "bike", 5: "swim", 10: "fuerza", 11: "andar", 17: "andar", 4: "otro" };
export function leerFIT(buf) {
  const v = new DataView(buf);
  const hs = v.getUint8(0);
  if (String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)) !== ".FIT") throw new Error("No es un archivo FIT válido");
  const fin = Math.min(hs + v.getUint32(4, true), buf.byteLength);
  const defs = {};
  const puntos = [];
  let resumen = null, lastTs = 0, pos = hs;
  const leerValor = (p, size, base, le) => {
    const b = base & 0x1F;
    try {
      if (size === 1) { const x = (b === 1) ? v.getInt8(p) : v.getUint8(p); return x === 0xFF || (b === 1 && x === 0x7F) ? null : x; }
      if (size === 2) { const x = (b === 3) ? v.getInt16(p, le) : v.getUint16(p, le); return x === 0xFFFF || (b === 3 && x === 0x7FFF) ? null : x; }
      if (size === 4) { if (b === 8) return v.getFloat32(p, le); const x = (b === 5) ? v.getInt32(p, le) : v.getUint32(p, le); return x === 0xFFFFFFFF || (b === 5 && x === 0x7FFFFFFF) ? null : x; }
    } catch (e) { return null; }
    return null;
  };
  while (pos < fin - 1) {
    const h = v.getUint8(pos++);
    let local, tsComp = null;
    if (h & 0x80) {
      local = (h >> 5) & 0x3;
      const off = h & 0x1F;
      tsComp = (lastTs & ~0x1F) + off + ((off < (lastTs & 0x1F)) ? 0x20 : 0);
      lastTs = tsComp;
    } else if (h & 0x40) {
      local = h & 0x0F;
      const le = v.getUint8(pos + 1) === 0;
      const global = v.getUint16(pos + 2, le);
      const n = v.getUint8(pos + 4);
      pos += 5;
      const campos = [];
      for (let i = 0; i < n; i++) { campos.push({ num: v.getUint8(pos), size: v.getUint8(pos + 1), base: v.getUint8(pos + 2) }); pos += 3; }
      let dev = 0;
      if (h & 0x20) { const nd = v.getUint8(pos++); for (let i = 0; i < nd; i++) { dev += v.getUint8(pos + 1); pos += 3; } }
      defs[local] = { le, global, campos, dev };
      continue;
    } else local = h & 0x0F;
    const def = defs[local];
    if (!def) throw new Error("Archivo FIT incompleto o dañado");
    const m = {};
    for (const c of def.campos) { m[c.num] = leerValor(pos, c.size, c.base, def.le); pos += c.size; }
    pos += def.dev;
    if (m[253] != null) lastTs = m[253];
    const ts = m[253] ?? tsComp;
    if (def.global === 20 && ts != null) {
      puntos.push({ t: (ts + FIT_EPOCH) * 1000, hr: m[3], d: m[5] != null ? m[5] / 100 : null, w: m[7], lat: null, lon: null });
    } else if (def.global === 18) {
      resumen = {
        deporte: SPORT[m[5]] || "otro", inicio: m[2] != null ? (m[2] + FIT_EPOCH) * 1000 : null,
        dur: m[8] != null ? m[8] / 1000 : m[7] != null ? m[7] / 1000 : null, dist: m[9] != null ? m[9] / 100 : null,
        fcMed: m[16], fcMax: m[17], potMed: m[20]
      };
    }
  }
  return { deporte: resumen?.deporte, puntos, resumen };
}

/* ---------------- CSV (lista de actividades) ---------------- */
function partirCSV(txt) {
  const sep = (txt.split("\n")[0].match(/;/g) || []).length > (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const filas = []; let fila = [], campo = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => x.trim()));
}
const normal = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const MESES = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
function fechaCSV(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = normal(s).match(/([a-z]{3,4})\.? (\d{1,2}),? (\d{4})/) || normal(s).match(/(\d{1,2}) ([a-z]{3,4})\.?,? (\d{4})/);
  if (m) { const [mes, dia] = isNaN(+m[1]) ? [m[1], m[2]] : [m[2], m[1]]; const k = MESES[mes.slice(0, 4)] ?? MESES[mes.slice(0, 3)]; if (k != null) return `${m[3]}-${String(k + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`; }
  const t = Date.parse(s);
  return isNaN(t) ? null : iso(new Date(t));
}
const numero = s => { s = String(s ?? "").trim().replace(/[^\d.,:-]/g, ""); if (!s || s === "--") return null; if (/,\d{1,2}$/.test(s) && !/\.\d{3},/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); const x = parseFloat(s); return isNaN(x) ? null : x; };
function leerCSV(txt) {
  const filas = partirCSV(txt.replace(/^﻿/, ""));
  if (filas.length < 2) throw new Error("El CSV está vacío");
  const cab = filas[0].map(normal);
  const col = (...nombres) => cab.findIndex(c => nombres.some(n => c === n)) >= 0 ? cab.findIndex(c => nombres.some(n => c === n)) : cab.findIndex(c => nombres.some(n => c.startsWith(n)));
  const cTipo = col("tipo de actividad", "activity type", "tipo", "type", "sport");
  const cFecha = col("fecha", "date", "activity date", "fecha de la actividad", "start time");
  const cDist = col("distancia", "distance");
  const cTiempo = col("tiempo", "time", "elapsed time", "duracion", "duration", "tiempo transcurrido", "moving time");
  const cFcMed = col("fc media", "avg hr", "average heart rate", "frecuencia cardiaca media");
  const cFcMax = col("fc maxima", "max hr", "max heart rate", "frecuencia cardiaca maxima");
  const cPot = col("potencia media", "avg power", "average watts");
  if (cFecha < 0 || cDist < 0) throw new Error("No reconozco las columnas: exporta la lista de actividades de Garmin Connect o activities.csv de Strava");
  const esStrava = cab.includes("activity id");
  const out = [];
  for (const f of filas.slice(1)) {
    const fecha = fechaCSV(f[cFecha]);
    if (!fecha) continue;
    let km = numero(f[cDist]);
    if (km != null && km > 1000) km = km / 1000; // metros
    const tt = f[cTiempo] ?? "";
    const dur = tt.includes(":") ? parseTiempo(tt.split(".")[0]) : numero(tt);
    const dep = deporteDe(cTipo >= 0 ? f[cTipo] : "");
    if (dep === "swim" && km > 20) km = km / 1000; // natación en metros
    const act = {
      id: `${fecha}-${dep}-${Math.round((km || 0) * 100)}-${dur || 0}`, fecha, dep, fuente: esStrava ? "Strava CSV" : "CSV",
      km: km != null ? Math.round(km * 100) / 100 : 0, dur: Math.round(dur || 0),
      fcMed: cFcMed >= 0 ? numero(f[cFcMed]) : null, fcMax: cFcMax >= 0 ? numero(f[cFcMax]) : null,
      potMed: cPot >= 0 ? numero(f[cPot]) : null, mejores: {}
    };
    if (dep === "run" && act.dur && act.km) for (const [k, D] of Object.entries(DISTANCIAS)) if (Math.abs(act.km * 1000 - D) / D < 0.02) act.mejores[k] = Math.round(act.dur * D / (act.km * 1000));
    out.push(act);
  }
  if (!out.length) throw new Error("No he encontrado actividades en el CSV");
  return out;
}

/* ---------------- Resumen del historial ---------------- */
export function resumen(acts) {
  const h = hoy();
  const desde = sumaDias(h, -365);
  const rec = acts.filter(a => a.fecha >= desde);
  const fcMaxObs = Math.max(0, ...rec.map(a => a.fcMax || 0).filter(x => x < 225)) || null;
  const mejores = {};
  for (const a of rec) for (const [k, s] of Object.entries(a.mejores || {})) if (!mejores[k] || s < mejores[k].s) mejores[k] = { s, fecha: a.fecha };
  const p20 = Math.max(0, ...rec.map(a => a.p20 || 0));
  // semanas: últimas 8
  const lunesHoy = lunesDe(h);
  const semanas = [];
  for (let i = 7; i >= 0; i--) {
    const l = sumaDias(lunesHoy, -7 * i), f = sumaDias(l, 6);
    const w = acts.filter(a => a.fecha >= l && a.fecha <= f);
    semanas.push({ lunes: l, run: sum(w, "run", "km"), bike: sum(w, "bike", "km"), swim: sum(w, "swim", "km"), horas: Math.round(w.reduce((t, a) => t + (a.dur || 0), 0) / 360) / 10, n: w.length });
  }
  const ult4 = semanas.slice(3, 7); // 4 semanas completas anteriores a la actual
  const horasMedia = Math.round(ult4.reduce((t, s) => t + s.horas, 0) / 4 * 2) / 2;
  return { n: acts.length, fcMaxObs, mejores, ftpEst: p20 ? Math.round(p20 * 0.95) : null, semanas, horasMedia };
}
const sum = (w, dep, k) => Math.round(w.filter(a => a.dep === dep).reduce((t, a) => t + (a[k] || 0), 0) * 10) / 10;
