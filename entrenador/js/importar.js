/* Lectura de archivos de actividad: FIT, GPX, TCX y CSV (Garmin Connect / Strava).
   Todo se procesa en el navegador; solo se guarda el resumen de cada actividad. */
import { iso, parseTiempo, sumaDias, lunesDe, hoy } from "./util.js?v=202611141259";

const DISTANCIAS = { "1k": 1000, "5k": 5000, "10k": 10000, media: 21097.5, maraton: 42195 };

/** Lee un archivo (o un ZIP con todo el historial) y devuelve las actividades desde la fecha `desde`.
    opt.progreso(texto) informa del avance en los ZIP grandes. */
export async function leerArchivo(file, opt = {}) {
  const desde = opt.desde || "0000";
  const acts = await leerBlob(file, file.name, opt, 0);
  return acts.filter(a => a.fecha >= desde);
}
const ext = n => n.toLowerCase().replace(/\.gz$/, "").split(".").pop();
async function leerBlob(blob, nombre, opt, prof) {
  const n = nombre.toLowerCase();
  if (n.endsWith(".zip")) return deZip(blob, opt, prof);
  let datos = blob;
  if (n.endsWith(".gz")) datos = new Blob([await gunzip(new Uint8Array(await blob.arrayBuffer()))]);
  const e = ext(n);
  if (e === "fit") return [deSerie(leerFIT(await datos.arrayBuffer()), "FIT", nombre)];
  if (e === "gpx") return [deSerie(leerGPX(await datos.text()), "GPX", nombre)];
  if (e === "tcx") return [deSerie(leerTCX((await datos.text()).trim()), "TCX", nombre)];
  if (e === "csv") return leerCSV(await textoDe(datos));
  if (e === "json") return deJSON(await datos.text(), nombre);
  throw new Error("Formato no reconocido: usa .zip, .fit, .gpx, .tcx, .csv o .json");
}

/* ---------------- ZIP (exportaciones completas de Garmin, Strava y Polar) ---------------- */
const gunzip = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
async function abrirZip(blob) {
  const tam = blob.size, finLen = Math.min(tam, 65557);
  const fin = new DataView(await blob.slice(tam - finLen).arrayBuffer());
  let eocd = -1;
  for (let i = finLen - 22; i >= 0; i--) if (fin.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("El ZIP está dañado o incompleto");
  let n = fin.getUint16(eocd + 10, true), cdSize = fin.getUint32(eocd + 12, true), cdOff = fin.getUint32(eocd + 16, true);
  const loc = eocd - 20;
  if ((cdOff === 0xFFFFFFFF || n === 0xFFFF) && loc >= 0 && fin.getUint32(loc, true) === 0x07064b50) {
    const off64 = Number(fin.getBigUint64(loc + 8, true));
    const e = new DataView(await blob.slice(off64, off64 + 56).arrayBuffer());
    n = Number(e.getBigUint64(32, true)); cdSize = Number(e.getBigUint64(40, true)); cdOff = Number(e.getBigUint64(48, true));
  }
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder(), entradas = [];
  let p = 0;
  for (let i = 0; i < n && p + 46 <= cdSize; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const metodo = cd.getUint16(p + 10, true);
    let comp = cd.getUint32(p + 20, true), size = cd.getUint32(p + 24, true), off = cd.getUint32(p + 42, true);
    const ln = cd.getUint16(p + 28, true), le = cd.getUint16(p + 30, true), lc = cd.getUint16(p + 32, true);
    const nombre = dec.decode(new Uint8Array(cd.buffer, p + 46, ln));
    if (comp === 0xFFFFFFFF || size === 0xFFFFFFFF || off === 0xFFFFFFFF) {
      let q = p + 46 + ln; const fin_ = q + le;
      while (q + 4 <= fin_) {
        const id = cd.getUint16(q, true), l = cd.getUint16(q + 2, true);
        if (id === 1) { let r = q + 4; if (size === 0xFFFFFFFF) { size = Number(cd.getBigUint64(r, true)); r += 8; } if (comp === 0xFFFFFFFF) { comp = Number(cd.getBigUint64(r, true)); r += 8; } if (off === 0xFFFFFFFF) off = Number(cd.getBigUint64(r, true)); }
        q += 4 + l;
      }
    }
    if (!nombre.endsWith("/")) entradas.push({ nombre, metodo, comp, size, off });
    p += 46 + ln + le + lc;
  }
  const blobDe = async e => {
    const h = new DataView(await blob.slice(e.off, e.off + 30).arrayBuffer());
    const ini = e.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    const datos = blob.slice(ini, ini + e.comp);
    if (e.metodo === 0) return datos;
    if (e.metodo === 8) return new Response(datos.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    throw new Error("Compresión del ZIP no soportada");
  };
  return { entradas, blobDe };
}
const numDe = n => Math.max(0, ...(n.match(/\d{4,}/g) || ["0"]).map(Number));
async function deZip(blob, opt, prof) {
  const z = await abrirZip(blob);
  const desde = opt.desde || "0000";
  const out = [];
  const avisar = t => opt.progreso && opt.progreso(t);
  // 1) resúmenes (rápidos): lista de actividades de Strava / Garmin
  for (const e of z.entradas.filter(e => /(^|\/)activities\.csv$/i.test(e.nombre) || /summarizedActivities.*\.json$/i.test(e.nombre))) {
    try { out.push(...await leerBlob(await z.blobDe(e), e.nombre, opt, prof + 1)); } catch (err) { console.warn(e.nombre, err); }
  }
  // 2) actividades con detalle (FIT/GPX/TCX y sesiones de Polar), de la más reciente a la más antigua
  const det = z.entradas.filter(e => /\.(fit|gpx|tcx)(\.gz)?$/i.test(e.nombre) || /training-session.*\.json$/i.test(e.nombre))
    .sort((a, b) => numDe(b.nombre) - numDe(a.nombre) || b.nombre.localeCompare(a.nombre));
  let viejas = 0, hechas = 0;
  for (const e of det) {
    if (viejas >= 25 || hechas >= 1500) break;
    try {
      const r = await leerBlob(await z.blobDe(e), e.nombre.split("/").pop(), opt, prof + 1);
      for (const a of r) { if (a.fecha >= desde) { out.push(a); viejas = 0; } else viejas++; }
    } catch (err) { /* archivo no legible: se salta */ }
    if (++hechas % 20 === 0) avisar(`Leyendo actividades… ${hechas}`);
  }
  // 3) ZIP dentro del ZIP (Garmin guarda así los FIT originales)
  if (prof < 2) for (const e of z.entradas.filter(e => /\.zip$/i.test(e.nombre))) {
    try { out.push(...await deZip(await z.blobDe(e), opt, prof + 1)); } catch (err) { console.warn(e.nombre, err); }
  }
  if (!out.length && prof === 0) throw new Error("No he encontrado actividades en el ZIP");
  return out;
}

/* ---------------- JSON: resumen de Garmin y sesiones de Polar ---------------- */
const durISO = d => { if (typeof d === "number") return d; const m = String(d || "").match(/P(?:\d+D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
function deJSON(txt, nombre) {
  const j = JSON.parse(txt);
  const lista = (Array.isArray(j) ? j : [j]).flatMap(x => x?.summarizedActivitiesExport || []);
  if (lista.length) return deGarminJSON(lista);
  return [dePolar(j, nombre)];
}
function deGarminJSON(lista) {
  const med = arr => { const v = arr.filter(x => x > 0).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 0; };
  const fDist = med(lista.map(x => x.distance)) > 100000 ? 0.01 : 1;   // Garmin da centímetros
  const fDur = med(lista.map(x => x.duration)) > 50000 ? 0.001 : 1;    // y milisegundos
  return lista.map(x => {
    const t = x.startTimeLocal ?? x.startTimeGmt ?? x.beginTimestamp;
    if (!t) return null;
    const dep = deporteDe(x.activityType?.typeKey || x.activityType || x.sportType || x.name);
    const km = Math.round((x.distance || 0) * fDist / 10) / 100, dur = Math.round((x.duration || x.elapsedDuration || 0) * fDur);
    const act = { id: `${iso(new Date(t))}-${dep}-${Math.round(km * 100)}-${dur}`, fecha: iso(new Date(t)), dep, fuente: "Garmin", km, dur,
      fcMed: x.avgHr ? Math.round(x.avgHr) : null, fcMax: x.maxHr ? Math.round(x.maxHr) : null, potMed: x.avgPower ? Math.round(x.avgPower) : null, mejores: {} };
    if (x.max20MinPower) act.p20 = Math.round(x.max20MinPower);
    if (dep === "run") marcasPorDistancia(act);
    return act;
  }).filter(Boolean);
}
function dePolar(j, nombre) {
  const ex = (j.exercises && j.exercises[0]) || j;
  const sport = ex.sport || j.sport || ex.sportId || nombre;
  const inicio = Date.parse(ex.startTime || j.startTime);
  if (isNaN(inicio)) throw new Error("JSON sin fecha de inicio");
  const hr = ex.heartRate || j.heartRate || {};
  const muestras = ex.samples || j.samples || {};
  const serie = (k) => Array.isArray(muestras[k]) ? muestras[k] : [];
  const fcS = serie("heartRate"), dS = serie("distance");
  const puntos = [];
  if (fcS.length) {
    const dist = new Map(dS.map(x => [x.dateTime, x.value]));
    for (const x of fcS) { const t = Date.parse(x.dateTime); if (!isNaN(t)) puntos.push({ t, hr: x.value, d: dist.get(x.dateTime) ?? null, lat: null, lon: null }); }
  }
  let ultD = null; for (const p of puntos) { if (p.d == null) p.d = ultD; else ultD = p.d; }
  if (puntos.length && puntos.every(p => p.d == null)) puntos.forEach(p => { delete p.d; });
  return deSerie({ deporte: sport, puntos, resumen: { deporte: sport, inicio, dur: durISO(ex.duration || j.duration), dist: ex.distance ?? j.distance ?? null, fcMed: hr.avg ?? hr.average ?? null, fcMax: hr.max ?? hr.maximum ?? null } }, "Polar", nombre);
}
function marcasPorDistancia(act) {
  if (!act.dur || !act.km) return;
  for (const [k, D] of Object.entries(DISTANCIAS)) if (Math.abs(act.km * 1000 - D) / D < 0.02) act.mejores[k] = Math.round(act.dur * D / (act.km * 1000));
}

/** Junta actividades nuevas con las que ya había, sin duplicar la misma actividad venida de dos sitios. */
export function fusionar(viejas, nuevas) {
  const lista = viejas.slice();
  let anadidas = 0;
  for (const x of nuevas) {
    const y = lista.find(y => y.id === x.id || (y.fecha === x.fecha && y.dep === x.dep &&
      ((x.dur && y.dur && Math.abs(x.dur - y.dur) <= Math.max(90, 0.04 * y.dur)) || (x.km > 0.5 && y.km > 0.5 && Math.abs(x.km - y.km) <= 0.03 * y.km + 0.05))));
    if (!y) { lista.push(x); anadidas++; continue; }
    for (const [k, v] of Object.entries(x)) if (v != null && (y[k] == null || k === "hr20" || k === "p20")) y[k] = v;
    for (const [k, v] of Object.entries(x.mejores || {})) if (!y.mejores?.[k] || v < y.mejores[k]) (y.mejores = y.mejores || {})[k] = v;
    if (x.fcMax && (!y.fcMax || x.fcMax > y.fcMax)) y.fcMax = x.fcMax;
  }
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { lista, anadidas };
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
  const hrS = pts.map(p => (p.hr > 40 && p.hr < 230) ? p.hr : null);
  if (hrS.filter(Boolean).length > 100 && dur >= 1200) { const m = mejorPotencia(t, hrS, 1200); if (m) act.hr20 = m; }
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
/** Texto de un archivo respetando UTF-16 (algunas exportaciones de Garmin) o UTF-8. */
async function textoDe(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(b);
  return new TextDecoder("utf-8").decode(b);
}
function leerCSV(txt) {
  const filas = partirCSV(txt.replace(/^\uFEFF/, ""));
  if (filas.length < 2) throw new Error("El CSV está vacío");
  const cab = filas[0].map(normal);
  // ¿Informe de pulso en reposo? (fecha + FC en reposo, sin distancias)
  const cRep = cab.findIndex(c => /reposo|resting/.test(c));
  if (cRep >= 0 && !cab.some(c => /^(distancia|distance)/.test(c))) {
    let cF = cab.findIndex(c => /^(fecha|date|dia|day)/.test(c));
    if (cF < 0) cF = cab.findIndex((_, i) => filas.slice(1, 6).some(f => fechaCSV(f[i] || "")));
    const out = [];
    for (const f of filas.slice(1)) { const fecha = fechaCSV(f[cF] || ""), v = numero(f[cRep]); if (fecha && v > 30 && v < 110) out.push({ medida: "fcrep", fecha, v: Math.round(v) }); }
    if (out.length) return out;
  }
  const col = (...nombres) => cab.findIndex(c => nombres.some(n => c === n)) >= 0 ? cab.findIndex(c => nombres.some(n => c === n)) : cab.findIndex(c => nombres.some(n => c.startsWith(n)));
  const cTipo = col("tipo de actividad", "activity type", "tipo", "type", "sport");
  const cFecha = col("fecha", "date", "activity date", "fecha de la actividad", "start time");
  const cDist = col("distancia", "distance");
  const cTiempo = col("tiempo", "time", "elapsed time", "duracion", "duration", "tiempo transcurrido", "moving time");
  const cFcMed = col("fc media", "avg hr", "average heart rate", "frecuencia cardiaca media");
  const cFcMax = col("fc maxima", "max hr", "max heart rate", "frecuencia cardiaca maxima");
  const cPot = col("potencia media", "avg power", "average watts");
  if (cFecha < 0 || cDist < 0) {
    const cols = filas[0].map(x => x.trim()).filter(Boolean).slice(0, 12).join(" · ");
    throw new Error(`no es una lista de actividades. Columnas que trae: «${cols}». Para las actividades: Garmin Connect (web) → Actividades → Todas las actividades → «Exportar CSV». Si este archivo te interesa, mándale una captura de sus columnas a quien te mantiene la app.`);
  }
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
    if (dep === "run") marcasPorDistancia(act);
    out.push(act);
  }
  if (!out.length) throw new Error("No he encontrado actividades en el CSV");
  return out;
}

/* ---------------- Resumen del historial ---------------- */
export function resumen(acts, medidas = []) {
  const h = hoy();
  const rep = medidas.filter(m => m.medida === "fcrep" && m.fecha >= sumaDias(h, -60)).map(m => m.v).sort((x, y) => x - y);
  const fcRep = rep.length ? rep[Math.floor(rep.length / 2)] : null;
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
  const horasMedia = Math.round(ult4.reduce((t, s) => t + s.horas, 0) / 4 * 10) / 10;
  const kmRun = Math.round(ult4.reduce((t, s) => t + s.run, 0) / 4);
  const sesiones = Math.round(ult4.reduce((t, s) => t + s.n, 0) / 4 * 10) / 10;
  // Tirada más larga de las últimas 6 semanas
  const runs6 = acts.filter(a => a.dep === "run" && a.fecha >= sumaDias(h, -42));
  const largoRun = runs6.length ? Math.round(Math.max(...runs6.map(a => a.dur || 0)) / 60) : null;
  // FC de umbral estimada: 95 % de su mejor media de 20' en carrera (si fue un esfuerzo fuerte)
  const hr20 = Math.max(0, ...acts.filter(a => a.dep === "run" && a.fecha >= sumaDias(h, -180)).map(a => a.hr20 || 0));
  const lthr = hr20 && (!fcMaxObs || hr20 >= 0.84 * fcMaxObs) ? Math.round(hr20 * 0.95) : null;
  // Cómo hace los rodajes suaves: la mitad más lenta de sus carreras recientes
  const conFC = acts.filter(a => a.dep === "run" && a.fecha >= sumaDias(h, -56) && a.fcMed && a.km >= 3 && a.dur).map(a => ({ ritmo: a.dur / a.km, fc: a.fcMed })).sort((x, y) => y.ritmo - x.ritmo);
  const lentas = conFC.slice(0, Math.max(1, Math.ceil(conFC.length / 2)));
  const mediana = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const suave = conFC.length >= 3 ? { ritmo: Math.round(mediana(lentas.map(x => x.ritmo))), fc: Math.round(mediana(lentas.map(x => x.fc))), n: conFC.length } : null;
  return { fecha: h, n: acts.length, fcRep, fcMaxObs, mejores, ftpEst: p20 ? Math.round(p20 * 0.95) : null, semanas, horasMedia, kmRun, sesiones, largoRun, lthr, suave };
}
const sum = (w, dep, k) => Math.round(w.filter(a => a.dep === dep).reduce((t, a) => t + (a[k] || 0), 0) * 10) / 10;
