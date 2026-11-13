/* Entrenador personal · generador de plan semanal (entrenos + menú)
   Todo se calcula en el navegador; los deportistas se guardan en localStorage. */
"use strict";

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r5 = x => Math.max(5, Math.round(x / 5) * 5);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtMin = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r}'` : `${h} h`) : `${r}'`; };
const fmtRitmo = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const parseTiempo = t => { if (!t) return 0; const p = String(t).trim().split(":").map(Number); if (p.some(isNaN)) return 0; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0; };
const fmtHoras = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_C = ["L", "M", "X", "J", "V", "S", "D"];
const DEP = {
  run: { n: "Carrera", i: "🏃" }, bike: { n: "Bici", i: "🚴" }, swim: { n: "Natación", i: "🏊" },
  fuerza: { n: "Fuerza", i: "🏋️" }, movilidad: { n: "Movilidad", i: "🧘" }, carrera: { n: "Competición", i: "🏁" }, descanso: { n: "Descanso", i: "😴" }
};
const OBJ = {
  salud: "Forma física y salud", perder_grasa: "Perder grasa", "5k": "Carrera 5 km", "10k": "Carrera 10 km",
  media: "Media maratón", maraton: "Maratón", ciclismo: "Marcha cicloturista / gran fondo", triatlon: "Triatlón"
};
const RUN_GOALS = ["5k", "10k", "media", "maraton"];
const GENERAL = ["salud", "perder_grasa"];
const TAPER = { "5k": 1, "10k": 1, media: 2, maraton: 3, ciclismo: 2, triatlon: 2 };
const FASES = {
  base: { n: "Base aeróbica", vol: 0.9, d: "Construir el motor aeróbico: mucho volumen suave (Z2), técnica y fuerza general. La intensidad es poca y controlada." },
  construccion: { n: "Construcción", vol: 1, d: "Se mantiene el volumen y se introduce trabajo de umbral y VO2máx. La fuerza pasa a cargas más altas." },
  especifico: { n: "Específico", vol: 1, d: "Entrenos a ritmo de competición y tiradas largas específicas. La fuerza se orienta a potencia." },
  puesta: { n: "Puesta a punto", vol: 0.65, d: "Se reduce el volumen para llegar fresco, manteniendo toques cortos de intensidad a ritmo de carrera." },
  carrera: { n: "Semana de competición", vol: 0.45, d: "Semana muy ligera: activación, descanso y llegar con las piernas frescas. ¡A disfrutar!" },
  descarga: { n: "Semana de descarga", vol: 0.65, d: "Cada cuarta semana se baja la carga (~35 %) para asimilar el trabajo y evitar sobrecargas. Sin series duras." }
};

/* =========================================================
   Zonas de entrenamiento
   ========================================================= */
function calcZonas(a) {
  const fcmaxEst = !a.fcmax;
  const fcmax = a.fcmax || Math.round(208 - 0.7 * a.edad);
  const fcrep = a.fcrep || 0;
  const pct = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1]];
  const fc = pct.map(([lo, hi]) => fcrep
    ? [Math.round(fcrep + (fcmax - fcrep) * lo), Math.round(fcrep + (fcmax - fcrep) * hi)]
    : [Math.round(fcmax * lo), Math.round(fcmax * hi)]);

  let t10 = parseTiempo(a.marca10k);
  const t5 = parseTiempo(a.marca5k);
  if (!t10 && t5) t10 = t5 * Math.pow(2, 1.06);
  let ritmos = null, carrera = null;
  if (t10) {
    const p = t10 / 10;
    const m = [[1.38, 1.26], [1.26, 1.15], [1.15, 1.06], [1.06, 0.99], [0.99, 0.93]];
    ritmos = m.map(([lento, rapido]) => [p * rapido, p * lento]);
    const tt5 = t5 || t10 / Math.pow(2, 1.06);
    const t21 = t10 * Math.pow(2.10975, 1.06), t42 = t10 * Math.pow(4.2195, 1.08);
    carrera = {
      "5k": { p: tt5 / 5, t: tt5 }, "10k": { p: t10 / 10, t: t10 },
      media: { p: t21 / 21.0975, t: t21 }, maraton: { p: t42 / 42.195, t: t42 }
    };
  }
  let potencia = null;
  if (a.ftp) {
    const f = a.ftp;
    potencia = [[0, 0.55], [0.56, 0.75], [0.76, 0.90], [0.91, 1.05], [1.06, 1.20]].map(([lo, hi]) => [Math.round(f * lo), Math.round(f * hi)]);
  }
  return { fcmax, fcmaxEst, fcrep, fc, ritmos, carrera, potencia };
}

const ZNOM = ["Z1 · Recuperación", "Z2 · Aeróbico suave", "Z3 · Tempo", "Z4 · Umbral", "Z5 · VO2máx"];
const RPE = ["RPE 2-3 · conversación fácil", "RPE 4-5 · puedes hablar en frases", "RPE 6 · frases cortas", "RPE 7-8 · solo palabras sueltas", "RPE 9 · muy duro"];

/** Texto de zona: "Z2 (128-146 ppm · 5:40-6:15 /km)" */
function zt(Z, dep, z) {
  const i = z - 1, partes = [];
  if (dep !== "swim") partes.push(`${Z.fc[i][0]}-${Z.fc[i][1]} ppm`);
  if (dep === "run" && Z.ritmos) partes.push(`${fmtRitmo(Z.ritmos[i][0])}-${fmtRitmo(Z.ritmos[i][1])} /km`);
  if (dep === "bike" && Z.potencia) partes.push(i === 0 ? `<${Z.potencia[0][1]} W` : `${Z.potencia[i][0]}-${Z.potencia[i][1]} W`);
  if (dep === "swim") partes.push(RPE[i]);
  return `Z${z} (${partes.join(" · ")})`;
}
function ritmoCarrera(Z, obj) {
  if (!Z.carrera || !Z.carrera[obj]) return "";
  return ` (${fmtRitmo(Z.carrera[obj].p)} /km)`;
}

/* =========================================================
   Fase de la temporada
   ========================================================= */
function calcFase(a) {
  const t = TAPER[a.objetivo];
  let f;
  if (t && a.semanas > 0) {
    const s = a.semanas;
    f = s === 1 ? "carrera" : s <= t ? "puesta" : s <= t + 6 ? "especifico" : s <= t + 14 ? "construccion" : "base";
  } else if (t) {
    f = a.nivel === "principiante" ? "base" : "construccion";
  } else {
    // objetivos generales: bloques de 4 semanas alternando base y construcción
    f = (Math.floor((a.semanaNum - 1) / 4) % 2 === 0) ? "base" : "construccion";
  }
  const descarga = ["base", "construccion", "especifico"].includes(f) && a.semanaNum % 4 === 0;
  return { f, descarga, clave: descarga ? "descarga" : f };
}

/* =========================================================
   Plantilla de sesiones según objetivo
   ========================================================= */
const S = (dep, tipo, extra = {}) => ({ dep, tipo, ...extra });

function plantilla(a, F) {
  const d = a.deportes, ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const general = GENERAL.includes(a.objetivo);
  let P = [];
  let prim = "run";

  if (RUN_GOALS.includes(a.objetivo)) {
    P = [S("run", "largo"), S("run", "calidad", { q: 1 }), S("run", "suave")];
    P.push(ini ? S("run", "suave", { rectas: true }) : S("run", "calidad", { q: 2 }));
    P.push(d.bike ? S("bike", "suave") : d.swim ? S("swim", "suave") : S("run", "suave", { rectas: true }));
    P.push(S("run", "recuperacion"));
    if (adv) P.push(S("run", "suave", { rectas: true }), S(d.bike ? "bike" : "run", "recuperacion"));
  } else if (a.objetivo === "ciclismo") {
    prim = "bike";
    P = [S("bike", "largo"), S("bike", "calidad", { q: 1 }), S("bike", "suave")];
    P.push(ini ? S("bike", "suave") : S("bike", "calidad", { q: 2 }));
    P.push(d.run ? S("run", "suave") : S("bike", "recuperacion"));
    P.push(S("bike", "suave"));
    if (adv) P.push(S("bike", "recuperacion"), S("bike", "suave"));
  } else if (a.objetivo === "triatlon") {
    prim = "tri";
    P = [S("bike", "largo"), S("run", "largo"), S("swim", "tecnica"), S("run", "calidad", { q: 1 }),
      S("bike", "calidad", { q: 1 }), S("swim", "calidad", { q: 1 }), S("bike", "transicion"),
      S("run", "suave"), S("swim", "suave"), S("bike", "suave"), S("run", "recuperacion")];
  } else {
    const cardio = ["run", "bike", "swim"].filter(k => d[k]);
    if (!cardio.length) cardio.push("run");
    prim = cardio[0];
    const c = i => cardio[i % cardio.length];
    P = [S(c(0), "largo"), S(c(1), "calidad", { q: 1 }), S(c(2), "suave"), S(c(1), "suave"),
      S(c(0), "calidad", { q: 2 }), S(c(2), "recuperacion"), S(c(0), "suave")];
  }

  if (F.f === "carrera") {
    const comp = prim === "tri" ? "carrera" : prim;
    const act = prim === "tri" ? "run" : prim;
    P = [S(comp, "competicion"), S(act, "activacion"), S(act, "suave", { tope: 45 })];
    if (!ini) P.push(S(prim === "tri" ? "swim" : act, "recuperacion"));
    if (prim === "tri") P.push(S("bike", "suave"));
  } else if (F.f === "puesta") {
    P = P.filter(s => !(s.tipo === "calidad" && s.q === 2) && !(s.tipo === "recuperacion" && P.length > 5));
  }

  if (F.descarga) P = P.map(s => s.tipo === "calidad" ? S(s.dep, "suave", { rectas: true }) : s.tipo === "transicion" ? S(s.dep, "suave") : s);

  // Sesiones de fuerza
  let k = 0;
  if (d.fuerza) {
    k = general ? (ini ? 2 : 3) : 2;
    if (F.f === "especifico" && a.objetivo === "triatlon") k = 1;
    if (F.f === "puesta" || F.f === "carrera") k = F.f === "carrera" ? 0 : 1;
    if (F.descarga) k = Math.min(k, 1);
  }
  // Dobles sesiones permitidas
  let dobles = ini ? 0 : adv ? 3 : 1;
  if (a.objetivo === "triatlon") dobles += ini ? 1 : 2;
  if (F.f === "carrera" || F.f === "puesta") dobles = Math.min(dobles, prim === "tri" ? 1 : 0);

  return { P, k, dobles, prim, general };
}

/* =========================================================
   Colocación de sesiones en la semana
   ========================================================= */
const DURO = ["largo", "calidad", "competicion", "transicion"];
const esDura = s => DURO.includes(s.tipo);
const distD = (x, y) => { const d = Math.abs(x - y); return Math.min(d, 7 - d); };

function diasEntreno(a) {
  let dias = [...new Set(a.dias)].sort((x, y) => x - y);
  const minDesc = a.nivel === "principiante" ? 2 : 1;
  const orden = [a.descanso, 0, 4, 2, 3, 1, 5, 6];
  for (const d of orden) {
    if (7 - dias.length >= minDesc) break;
    dias = dias.filter(x => x !== d);
  }
  return dias;
}

function colocar(a, T, F) {
  const semana = Array.from({ length: 7 }, () => []);
  const train = diasEntreno(a);
  const libres = new Set(train);
  const N = train.length;
  const ini = a.nivel === "principiante";

  // Días propios reservados para fuerza en principiantes y objetivos generales
  let reservaF = 0;
  if (T.k && (ini || T.general)) reservaF = Math.min(T.k, Math.max(0, N - 3));
  const nPropias = Math.min(T.P.length, N - reservaF);
  const propias = T.P.slice(0, nPropias);
  const extra = T.P.slice(nPropias, nPropias + T.dobles);

  const rango = s => ({ competicion: 0, largo: 1, transicion: 2, calidad: 2, activacion: 3, tecnica: 4, recuperacion: 5, suave: 6 }[s.tipo] ?? 7);
  const duros = [];
  const orden = propias.map((s, i) => ({ s, i })).sort((x, y) => rango(x.s) - rango(y.s) || x.i - y.i);

  for (const { s } of orden) {
    let best = -1, bs = -Infinity;
    for (const d of libres) {
      let sc = 0;
      const minDist = duros.length ? Math.min(...duros.map(h => distD(h, d))) : 4;
      if (s.tipo === "competicion") sc = d === 6 ? 100 : d === 5 ? 90 : d;
      else if (s.tipo === "largo") sc = (d === 6 ? 50 : d === 5 ? 46 : d * 3) + (duros.length ? -2 * (minDist === 0 ? 10 : 0) : 0);
      else if (s.tipo === "calidad" || s.tipo === "transicion") sc = minDist * 10 + (d === 1 || d === 3 ? 3 : 0) - (d >= 5 ? 1 : 0);
      else if (s.tipo === "activacion") { const c = semana.findIndex(x => x.some(y => y.tipo === "competicion")); sc = c >= 0 ? (c - d === 2 ? 30 : c - d === 1 ? 20 : -distD(c, d)) : 0; }
      else if (s.tipo === "recuperacion") sc = (semana[(d + 6) % 7].some(esDura) ? 20 : 0) + minDist;
      else sc = minDist * 2 - d * 0.1;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best < 0) break;
    semana[best].push({ ...s });
    libres.delete(best);
    if (esDura(s)) duros.push(best);
  }

  // Dobles sesiones (segunda sesión del día)
  for (const s of extra) {
    let best = -1, bs = -Infinity;
    for (const d of train) {
      const dia = semana[d];
      if (dia.length !== 1) continue;
      const otro = dia[0];
      if (otro.tipo === "competicion") continue;
      if (esDura(s) && esDura(otro)) continue;
      let sc = 0;
      if (otro.dep !== s.dep) sc += 10;
      if (!esDura(otro)) sc += 4;
      if (esDura(s) && semana[(d + 1) % 7].some(esDura)) sc -= 8;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best >= 0) semana[best].push({ ...s, doble: true });
  }

  // Fuerza: primero días libres, si no, apilada
  const diasF = [];
  for (let n = 0; n < T.k; n++) {
    let best = -1, bs = -Infinity;
    const cands = libres.size ? [...libres] : train;
    for (const d of cands) {
      const dia = semana[d];
      if (dia.some(x => x.dep === "fuerza")) continue;
      if (dia.length >= 2) continue;
      let sc = 0;
      if (dia.some(x => x.tipo === "competicion")) continue;
      if (dia.some(x => x.tipo === "largo")) sc -= 70;
      const sig = semana[(d + 1) % 7];
      if (sig.some(x => x.tipo === "largo" || x.tipo === "competicion")) sc -= 25;
      if (!ini && dia.some(x => x.tipo === "calidad")) sc += 6;
      if (dia.some(x => x.tipo === "suave" || x.tipo === "recuperacion")) sc += 3;
      if (!dia.length) sc += 12;
      sc += diasF.length ? Math.min(...diasF.map(f => distD(f, d))) * 5 : 0;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best < 0 || bs < -40) break;
    semana[best].push(S("fuerza", "fuerza", { bloque: n }));
    libres.delete(best);
    diasF.push(best);
  }

  // Días disponibles sin nada: movilidad o descanso
  for (const d of libres) {
    if (!semana[d].length && !["carrera", "puesta"].includes(F.f)) semana[d].push(S("movilidad", "movilidad"));
  }

  // Orden dentro del día: resistencia primero, fuerza después
  semana.forEach(dia => dia.sort((x, y) => (x.dep === "fuerza") - (y.dep === "fuerza")));
  return semana;
}

/* =========================================================
   Duraciones
   ========================================================= */
const PESO = { largo: 2.2, calidad: 1.3, suave: 1, recuperacion: 0.65, tecnica: 0.9, transicion: 1.4, activacion: 0.45 };
const MULT = { run: 1, bike: 1.6, swim: 1 };
function topes(a, s) {
  const ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const f = ini ? 0.75 : 1;
  if (s.dep === "run") {
    const largo = { "5k": 80, "10k": 95, media: 130, maraton: 180, triatlon: 100, ciclismo: 70 }[a.objetivo] || 90;
    return { largo: largo * f, calidad: 75, suave: (s.tope || (adv ? 80 : 65)) * f, recuperacion: 45, activacion: 30 }[s.tipo] ?? 60;
  }
  if (s.dep === "bike") return { largo: (a.objetivo === "ciclismo" ? 330 : 240) * f, calidad: 120, suave: 120, recuperacion: 60, transicion: 120 }[s.tipo] ?? 90;
  return { tecnica: 70, calidad: 75, suave: 75, recuperacion: 45 }[s.tipo] ?? 60;
}
const MIN_D = { run: 20, bike: 30, swim: 30 };

function duraciones(a, semana, F) {
  const ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const vol = FASES[F.clave].vol;
  const todas = semana.flat();
  const minFuerza = ["puesta", "carrera"].includes(F.f) || F.descarga ? 30 : ini ? 35 : adv ? 50 : 45;
  let fijos = 0;
  for (const s of todas) {
    if (s.dep === "fuerza") { s.min = minFuerza; fijos += s.min; }
    else if (s.tipo === "movilidad") { s.min = 25; }
    else if (s.tipo === "competicion") {
      const Z = calcZonas(a);
      const est = Z.carrera && Z.carrera[a.objetivo] ? Z.carrera[a.objetivo].t / 60 : { "5k": 30, "10k": 60, media: 125, maraton: 250, ciclismo: 330, triatlon: 160 }[a.objetivo];
      s.min = r5(est); fijos += 0; // la competición no cuenta para el reparto
    }
  }
  const resis = todas.filter(s => s.min == null);
  let E = Math.max(a.horas * 60 * vol - fijos, resis.length * 25);
  // Reparto proporcional con topes (2 pasadas)
  let libres = resis.slice();
  for (let it = 0; it < 3 && libres.length; it++) {
    const W = libres.reduce((t, s) => t + PESO[s.tipo] * MULT[s.dep], 0);
    const asignado = resis.filter(s => !libres.includes(s)).reduce((t, s) => t + s.min, 0);
    const resto = E - asignado;
    const sig = [];
    for (const s of libres) {
      const m = resto * PESO[s.tipo] * MULT[s.dep] / W;
      const tope = topes(a, s);
      if (m > tope) s.min = tope; else { s.min = m; sig.push(s); }
    }
    if (sig.length === libres.length) break;
    libres = sig;
  }
  for (const s of resis) s.min = r5(Math.max(MIN_D[s.dep] || 20, s.min));
}

/* =========================================================
   Contenido de cada sesión
   ========================================================= */
function describir(s, a, F, Z) {
  const ini = a.nivel === "principiante";
  const fk = F.descarga ? "descarga" : F.f;
  const obj = a.objetivo, general = GENERAL.includes(obj);
  const z = (n, dep = s.dep) => zt(Z, dep, n);
  const out = { titulo: "", zona: "", pasos: [], nota: "" };
  const wu = ini ? 10 : 15, cd = 10;
  const M = Math.max(10, s.min - wu - cd);
  const tipo = s.tipo;

  if (s.dep === "run") {
    if (tipo === "largo") {
      out.titulo = "Tirada larga";
      out.zona = z(2);
      let main = `Carrera continua ${fmtMin(s.min)} en ${z(2)}`;
      if (fk === "construccion") main = `${fmtMin(s.min - 15)} en Z2 y los últimos 15' en ${z(3)}`;
      if (fk === "especifico") {
        if (obj === "maraton") main = `${fmtMin(s.min - 50)} en Z2 + 2 × 20' a ritmo maratón${ritmoCarrera(Z, "maraton")} con 5' suaves entre bloques`;
        else if (obj === "media") main = `${fmtMin(s.min - 25)} en Z2 y los últimos 25' a ritmo de media maratón${ritmoCarrera(Z, "media")}`;
        else if (RUN_GOALS.includes(obj)) main = `${fmtMin(s.min - 5)} en Z2 + 6 × 20'' rectas rápidas al final`;
      }
      out.pasos = [main, "5-10' de estiramientos suaves al terminar"];
      if (s.min >= 75) out.nota = "Lleva agua. A partir de 75' toma 30-60 g de hidratos por hora (gel, dátiles, bebida isotónica).";
    } else if (tipo === "calidad") {
      out.titulo = s.q === 2 ? "Series (2.º día de calidad)" : "Series / calidad";
      const reps = (w, lo, hi) => clamp(Math.floor(M / w), lo, hi);
      let main;
      if (general || fk === "base") {
        if (s.q === 1) { main = `Fartlek: ${reps(2, 5, 12)} × (1' en ${z(4)} / 1' trote en Z1)`; out.titulo = "Fartlek"; }
        else { main = `Cuestas: ${reps(2.5, 5, 10)} × 30-45'' subiendo fuerte (${z(5)}), bajada trotando`; out.titulo = "Cuestas"; }
      } else if (fk === "construccion") {
        if (s.q === 1) { const b = M >= 35 ? 10 : 8; main = `Umbral: ${reps(b + 2, 2, 4)} × ${b}' en ${z(4)}, recuperando 2' al trote`; out.titulo = "Umbral"; }
        else { main = `VO2máx: ${reps(5, 4, 7)} × 3' en ${z(5)}, recuperando 2' al trote`; out.titulo = "Series VO2máx"; }
      } else if (fk === "especifico") {
        if (s.q === 1) {
          out.titulo = "Ritmo de competición";
          main = ({
            maraton: `${reps(18, 2, 3)} × 15' a ritmo maratón${ritmoCarrera(Z, "maraton")}, 3' suaves entre bloques`,
            media: `${reps(14, 2, 4)} × 12' a ritmo media maratón${ritmoCarrera(Z, "media")}, 2' trote`,
            "10k": `${reps(6.5, 4, 7)} × 1000 m a ritmo 10 km${ritmoCarrera(Z, "10k")}, 90'' trote`,
            "5k": `${reps(5.5, 4, 8)} × 800 m a ritmo 5 km${ritmoCarrera(Z, "5k")}, 2' trote`,
            triatlon: `${reps(8, 3, 6)} × 5' a ritmo de carrera de triatlón (${z(4)}), 2' trote`
          })[obj] || `${reps(12, 2, 4)} × 10' en ${z(4)}, 2' trote`;
        } else { main = `Umbral: ${reps(12, 2, 4)} × 10' en ${z(4)}, 2' trote`; out.titulo = "Umbral"; }
      } else {
        main = `2 × 8' a ritmo de carrera${ritmoCarrera(Z, obj)}, 3' trote + 4 × 20'' progresivos`;
        out.titulo = "Toque de ritmo";
      }
      out.zona = main.includes("Z5") ? "Z4-Z5" : "Z3-Z4";
      out.pasos = [`Calentamiento ${wu}' en Z1-Z2 + movilidad dinámica + 3 progresivos`, main, `Vuelta a la calma ${cd}' en Z1`];
    } else if (tipo === "suave") {
      out.titulo = "Rodaje suave";
      out.zona = z(2);
      out.pasos = [`Rodaje continuo ${fmtMin(s.min)} en ${z(2)}`];
      if (s.rectas && !["carrera"].includes(fk)) out.pasos.push("Al final: 4-6 rectas de 20'' rápidas y relajadas (técnica)");
      if (ini) out.nota = "Si no puedes mantener Z2 corriendo, alterna 3' de carrera con 1' andando.";
    } else if (tipo === "recuperacion") {
      out.titulo = "Rodaje regenerativo";
      out.zona = z(1);
      out.pasos = [`Trote muy suave ${fmtMin(s.min)} en ${z(1)}`, "10' de movilidad de cadera y tobillo"];
    } else if (tipo === "activacion") {
      out.titulo = "Activación precompetición";
      out.zona = "Z2 + toques";
      out.pasos = [`${fmtMin(Math.max(15, s.min - 5))} suave en Z2`, `4 × 20'' a ritmo de carrera${ritmoCarrera(Z, obj)}, 1' suave entre ellos`];
      out.nota = "Revisa material, dorsal y desayuno de carrera. Cena rica en hidratos.";
    } else if (tipo === "competicion") {
      out.titulo = `¡Competición! ${OBJ[obj] || ""}`;
      out.zona = "Ritmo objetivo";
      const est = Z.carrera && Z.carrera[obj] ? ` Tiempo estimado: ${fmtHoras(Z.carrera[obj].t)}${ritmoCarrera(Z, obj)}.` : "";
      out.pasos = ["Desayuno 3 h antes (rico en hidratos, conocido, bajo en fibra)", "Calentamiento 10-15' suave + 3 progresivos", `Salida controlada, primeros km algo por debajo del ritmo objetivo.${est}`];
    }
  } else if (s.dep === "bike") {
    if (tipo === "largo") {
      out.titulo = "Salida larga";
      out.zona = z(2);
      let main = `Rodar ${fmtMin(s.min)} en ${z(2)}, cadencia 85-95 rpm`;
      if (fk === "construccion") main += `, incluyendo 3 subidas de 8-10' en ${z(3)}`;
      if (fk === "especifico") main += obj === "ciclismo" ? ". Simula el perfil de la marcha: subidas en Z3 y bajadas recuperando" : `, con 2 × 20' en ${z(3)}`;
      out.pasos = [main];
      out.nota = s.min >= 120 ? "Practica la nutrición de carrera: 60-90 g de hidratos/hora y 500-750 ml de bebida/hora." : "Bebe cada 15-20' y lleva algo de comer.";
    } else if (tipo === "calidad") {
      const reps = (w, lo, hi) => clamp(Math.floor(M / w), lo, hi);
      let main;
      if (general) {
        main = s.q === 1 ? `HIIT: ${reps(3, 6, 12)} × (1' fuerte en ${z(5)} / 2' suave)` : `Tempo: 2 × ${clamp(Math.floor((M - 5) / 2), 8, 25)}' en ${z(3)}, 5' suave entre bloques`;
        out.titulo = s.q === 1 ? "HIIT en bici" : "Tempo";
      } else if (fk === "base") {
        main = s.q === 1 ? `Sweet spot: ${reps(15, 2, 4)} × 10' al 88-93 % FTP (Z3-Z4), 5' suave` : `Cadencia: ${reps(8, 3, 6)} × 5' a 100-110 rpm en ${z(3)}, 3' suave`;
        out.titulo = s.q === 1 ? "Sweet spot" : "Técnica de cadencia";
      } else if (fk === "construccion") {
        main = s.q === 1 ? `Umbral: ${reps(12, 3, 5)} × 8' en ${z(4)}, 4' suave` : `VO2máx: ${reps(8, 4, 6)} × 4' en ${z(5)}, 4' suave`;
        out.titulo = s.q === 1 ? "Umbral" : "VO2máx";
      } else if (fk === "especifico") {
        main = s.q === 1 ? `Tempo largo: ${reps(25, 2, 3)} × 20' en ${z(3)} simulando la prueba` : `Fuerza en subida: ${reps(10, 3, 6)} × 6' en ${z(4)} a 60-70 rpm, 4' suave`;
        out.titulo = s.q === 1 ? "Tempo específico" : "Fuerza en subida";
      } else {
        main = `3 × 5' en ${z(4)}, 5' suave entre ellos`;
        out.titulo = "Toque de intensidad";
      }
      out.zona = main.includes("Z5") ? "Z4-Z5" : "Z3-Z4";
      out.pasos = [`Calentamiento ${wu}' progresivo Z1→Z2 + 3 × 1' cadencia alta`, main, `Vuelta a la calma ${cd}' en Z1`];
    } else if (tipo === "suave") {
      out.titulo = "Rodaje en bici"; out.zona = z(2);
      out.pasos = [`Rodar ${fmtMin(s.min)} en ${z(2)} con cadencia fluida (85-95 rpm)`];
    } else if (tipo === "recuperacion") {
      out.titulo = "Bici regenerativa"; out.zona = z(1);
      out.pasos = [`${fmtMin(s.min)} muy suave en ${z(1)}, piernas sueltas, desarrollos ligeros`];
    } else if (tipo === "transicion") {
      const r = clamp(Math.round(s.min * 0.25 / 5) * 5, 10, 25), b = s.min - r;
      out.titulo = "Transición (bici + carrera)"; out.zona = "Z2-Z3";
      out.pasos = [`Bici ${fmtMin(b)} en ${z(2)}, últimos 15' en ${z(3)}`, "Transición rápida: practica dejar la bici y cambiar zapatillas", `Carrera inmediata ${r}' a ritmo de competición (${zt(Z, "run", 3)})`];
    } else if (tipo === "competicion" || tipo === "activacion") {
      out.titulo = tipo === "competicion" ? "¡Marcha / competición!" : "Activación en bici";
      out.zona = tipo === "competicion" ? "Ritmo objetivo" : "Z2 + toques";
      out.pasos = tipo === "competicion"
        ? ["Desayuno 3 h antes rico en hidratos", "Primeros 30' muy controlados (Z2)", "Come y bebe desde el inicio: 60-90 g de hidratos/hora", "En subidas no pases de Z4 salvo el final"]
        : [`${fmtMin(Math.max(20, s.min - 5))} en Z2`, "3 × 1' a ritmo de prueba con 2' suaves"];
    }
  } else if (s.dep === "swim") {
    const p100 = ini ? 150 : a.nivel === "avanzado" ? 105 : 125; // incluye descansos
    const total = Math.round((s.min * 60 / p100) * 100 / 50) * 50;
    const prin = Math.max(200, total - 500);
    if (tipo === "tecnica") {
      out.titulo = `Técnica de natación · ~${total} m`; out.zona = "Z2-Z3";
      out.pasos = ["Calentamiento 300 m variado", "Técnica 8 × 25 m (crol a un brazo, cremallera, patada con tabla) desc. 15''", `Principal ${Math.max(2, Math.round(prin / 100))} × 100 m en Z2-Z3, desc. 20''`, "Vuelta a la calma 100 m espalda"];
    } else if (tipo === "calidad") {
      const r = Math.max(3, Math.round(prin / 200));
      out.titulo = `Series en piscina · ~${total} m`; out.zona = "Z3-Z4";
      out.pasos = ["Calentamiento 300 m + 4 × 50 m progresivos", fk === "base" ? `${r} × 200 m en Z3, desc. 30''` : `${r * 2} × 100 m en Z4, desc. 20''`, "Vuelta a la calma 100-200 m suave"];
    } else if (tipo === "competicion") {
      out.titulo = "¡Triatlón!"; out.zona = "Ritmo objetivo";
    } else {
      out.titulo = `Nado continuo · ~${total} m`; out.zona = tipo === "recuperacion" ? "Z1" : "Z2";
      out.pasos = [`${total} m continuos en ${tipo === "recuperacion" ? "Z1" : "Z2"}, respirando cada 3 brazadas`, "Cada 400 m, 25 m de técnica"];
    }
    out.zona = `${out.zona} (${RPE[tipo === "calidad" ? 3 : tipo === "recuperacion" ? 0 : 1]})`;
  } else if (s.dep === "carrera") {
    out.titulo = "¡Triatlón!"; out.zona = "Ritmo objetivo";
    out.pasos = ["Desayuno 3 h antes rico en hidratos", "Natación: salida tranquila, busca tu ritmo y pies", "Bici: primeros 10' controlados, come y bebe (60 g de hidratos/hora)", "Carrera: primeros 2 km algo por debajo de ritmo, luego progresa"];
  } else if (s.dep === "fuerza") {
    const f = fuerza(s.bloque, a, F);
    out.titulo = f.titulo; out.zona = f.esquema; out.ejercicios = f.ejercicios;
    out.pasos = ["Calentamiento 5-8': movilidad articular + puente de glúteo + plancha"];
    out.nota = f.nota;
  } else if (s.dep === "movilidad") {
    out.titulo = "Movilidad y core"; out.zona = "Suave";
    out.pasos = ["Movilidad de cadera, tobillo y columna torácica (10')", "Core: 3 × (plancha 30'' + dead bug 10 + plancha lateral 20''/lado)", "Estiramientos o yoga suave (10')"];
    out.nota = "Día opcional: si hay cansancio, mejor descanso total.";
  }
  if (s.doble) out.nota = (out.nota ? out.nota + " " : "") + "Segunda sesión del día: sepárala al menos 4-6 h de la primera si puedes.";
  return out;
}

/* =========================================================
   Fuerza
   ========================================================= */
const EJ = {
  A: [
    ["Sentadilla con peso corporal", "Sentadilla goblet con mancuerna", "Sentadilla trasera con barra"],
    ["Zancada estática", "Zancada búlgara con mancuernas", "Zancada búlgara con carga alta"],
    ["Puente de glúteo", "Hip thrust con peso", "Hip thrust con barra"],
    ["Remo con goma elástica", "Remo con mancuerna a una mano", "Remo con barra"],
    ["Plancha frontal 20-30''", "Plancha frontal 40''", "Plancha con toques de hombro 45''", "core"],
    ["Dead bug (8 por lado)", "Dead bug con peso (10 por lado)", "Dead bug con goma (12 por lado)", "core"]
  ],
  B: [
    ["Peso muerto rumano con mancuernas ligeras", "Peso muerto rumano con mancuernas", "Peso muerto rumano con barra"],
    ["Subida al banco (step-up)", "Step-up con mancuernas", "Step-up con barra o chaleco"],
    ["Flexiones con rodillas apoyadas", "Flexiones", "Flexiones con lastre o fondos"],
    ["Curl femoral con fitball", "Curl nórdico asistido con goma", "Curl nórdico"],
    ["Plancha lateral 20''/lado", "Plancha lateral 30''/lado con elevación", "Plancha lateral 40''/lado con remo", "core"],
    ["Bird dog (8 por lado)", "Pallof press con goma (10 por lado)", "Pallof press con polea (12 por lado)", "core"]
  ],
  C: [
    ["Sentadilla + press (thruster) ligero", "Thruster con mancuernas", "Thruster con barra"],
    ["Peso muerto con kettlebell", "Swing con kettlebell", "Swing pesado con kettlebell"],
    ["Zancadas caminando", "Zancadas caminando con mancuernas", "Zancadas con barra"],
    ["Remo invertido en mesa/TRX", "Remo en TRX", "Dominadas"],
    ["Mountain climbers 20''", "Mountain climbers 30''", "Burpees 30''", "core"]
  ]
};
const EXTRA_DEP = {
  run: [["Elevación de gemelos de pie", "Elevación de gemelos a una pierna", "Gemelos a una pierna con peso"]],
  bike: [["Sentadilla isométrica en pared 30''", "Sentadilla isométrica en pared 45''", "Sentadilla isométrica con peso 45''", "core"]],
  swim: [["Rotación externa de hombro con goma", "Rotación externa con goma (más tensión)", "Face pull con polea"], ["Jalón al pecho con goma", "Dominadas asistidas", "Dominadas lastradas"]]
};

function fuerza(n, a, F) {
  const nivel = { principiante: 0, intermedio: 1, avanzado: 2 }[a.nivel];
  const fk = F.descarga ? "descarga" : F.f;
  const general = GENERAL.includes(a.objetivo);
  const bloque = ["A", "B", "C"][n % 3];
  let esquema, nota = "";
  if (fk === "descarga") esquema = "2 × 10 con técnica perfecta · desc. 60''";
  else if (fk === "puesta" || fk === "carrera") esquema = "2 × 8 ligeras, sin llegar al fallo";
  else if (fk === "especifico" && !general) esquema = nivel ? "3 × 4-6 explosivas · desc. 2'" : "3 × 8-10 · desc. 90''";
  else if (fk === "construccion") esquema = ["3 × 10-12 · desc. 90''", "4 × 6-8 · desc. 2'", "4 × 5-6 pesadas · desc. 2-3'"][nivel];
  else esquema = nivel ? "3 × 12-15 · desc. 60''" : "2-3 × 12 · desc. 60''";
  if (general && a.objetivo === "perder_grasa" && fk !== "descarga") { esquema += " · formato circuito"; nota = "Hazlo en circuito (un ejercicio tras otro) para subir el gasto calórico."; }

  const deps = ["run", "bike", "swim"].filter(k => a.deportes[k]);
  let lista = EJ[bloque].slice();
  for (const d of deps) for (const e of (EXTRA_DEP[d] || [])) if (lista.length < 8) lista.splice(lista.length - 1, 0, e);
  const ejercicios = lista.map(e => ({ n: e[nivel], s: e[3] === "core" ? (nivel ? "3 series" : "2 series") : esquema.split(" · ")[0] }));
  if (fk === "especifico" && !general && nivel && deps.includes("run")) {
    ejercicios.splice(0, 0, { n: "Pliometría: saltos al cajón o multisaltos", s: "3 × 5" }, { n: "Comba", s: "3 × 30''" });
    nota = "Pliometría al principio, con las piernas frescas.";
  }
  if (!nota) nota = nivel === 0 ? "Prioriza la técnica. Termina cada serie con 2-3 repeticiones en reserva." : "Deja 1-2 repeticiones en reserva. Si sale muy fácil, sube el peso la próxima semana.";
  const titulo = { A: "Fuerza A · tren inferior y core", B: "Fuerza B · cadena posterior y tren superior", C: "Fuerza C · cuerpo completo" }[bloque];
  return { titulo, esquema, ejercicios, nota };
}

/* =========================================================
   Nutrición
   ========================================================= */
const MET = {
  run: { largo: 9.5, calidad: 11, suave: 9, recuperacion: 7, activacion: 8, competicion: 11.5 },
  bike: { largo: 7.5, calidad: 9.5, suave: 7, recuperacion: 5, transicion: 8.5, activacion: 6.5, competicion: 9 },
  swim: { tecnica: 7, calidad: 9, suave: 7.5, recuperacion: 6 },
  fuerza: { fuerza: 5 }, movilidad: { movilidad: 2.5 }, carrera: { competicion: 10 }
};
function cargaDia(dia) {
  if (!dia.length || dia.every(s => s.dep === "movilidad")) return "descanso";
  const tot = dia.reduce((t, s) => t + (s.dep === "movilidad" ? 0 : s.min), 0);
  if (dia.some(s => s.tipo === "competicion") || dia.some(s => s.tipo === "largo" && s.min >= 90) || tot >= 150) return "alta";
  if (dia.some(s => s.tipo === "calidad" || s.tipo === "transicion" || s.tipo === "largo") || tot >= 75) return "media";
  return "baja";
}
const CARGA_TXT = { descanso: "Descanso", baja: "Carga baja", media: "Carga media", alta: "Carga alta" };

// Proteínas según dieta: [nombre, g proteína/100 g, etiqueta corta]
const PROT = {
  carne: { omni: ["Pechuga de pollo o pavo", 23, "pollo"], veg: ["Tofu firme", 13, "tofu"], vegan: ["Tofu firme", 13, "tofu"] },
  pescado: { omni: ["Pescado blanco o salmón", 21, "pescado"], veg: ["Huevos", 13, "huevo"], vegan: ["Tempeh", 19, "tempeh"] },
  picada: { omni: ["Carne picada magra", 20, "carne"], veg: ["Soja texturizada (en seco)", 50, "soja"], vegan: ["Soja texturizada (en seco)", 50, "soja"] },
  lacteo: { omni: ["Yogur griego natural o skyr", 10, "yogur", "L"], veg: ["Yogur griego natural o skyr", 10, "yogur", "L"], vegan: ["Yogur de soja natural", 4.5, "yogur de soja"] },
  huevo: { omni: ["Huevos", 13, "huevo"], veg: ["Huevos", 13, "huevo"], vegan: ["Tofu firme", 13, "tofu"] },
  fiambre: { omni: ["Pavo o jamón serrano", 22, "pavo"], veg: ["Queso fresco o de Burgos", 11, "queso fresco", "L"], vegan: ["Hummus", 7, "hummus"] },
  atun: { omni: ["Atún al natural", 25, "atún"], veg: ["Huevo cocido", 13, "huevo"], vegan: ["Garbanzos cocidos", 8, "garbanzos"] },
  legumbre: { omni: ["Garbanzos cocidos", 8, "garbanzos"], veg: ["Garbanzos cocidos", 8, "garbanzos"], vegan: ["Garbanzos cocidos", 8, "garbanzos"] }
};
const LECHE = { omni: "Leche", veg: "Leche", vegan: "Bebida de soja" };

// Plato: n (nombre con {p} = proteína), c = [alimento, g HC/100 g, sin gluten?], p = clave de PROT, f = extras fijos
const BANCO = {
  desayuno: [
    { n: "Porridge de avena con plátano y nueces", c: [["Copos de avena", 60, "G"]], p: "lacteo", f: ["{leche} 200 ml", "1 plátano", "Nueces 15 g", "Canela"] },
    { n: "Tostadas con tomate, aceite y {p}", c: [["Pan integral", 45, "G"]], p: "huevo", f: ["Tomate rallado", "Aceite de oliva 1 cucharada", "1 pieza de fruta"] },
    { n: "Bol de {p} con muesli y frutos rojos", c: [["Muesli sin azúcar", 62, "G"]], p: "lacteo", f: ["Frutos rojos 100 g", "Semillas de chía 1 cucharada"] },
    { n: "Tostada de aguacate con {p}", c: [["Pan de centeno o integral", 45, "G"]], p: "fiambre", f: ["½ aguacate", "Zumo de naranja natural"] },
    { n: "Tortitas de avena y plátano con {p}", c: [["Harina de avena", 60, "G"]], p: "lacteo", f: ["1 plátano", "Crema de cacahuete 1 cucharada"] },
    { n: "Café con leche, tostada y fruta con {p}", c: [["Pan integral", 45, "G"]], p: "fiambre", f: ["{leche} 200 ml", "Aceite de oliva", "1 kiwi o naranja"] },
    { n: "Batido de avena, plátano y cacao", c: [["Copos de avena", 60, "G"]], p: "lacteo", f: ["{leche} 250 ml", "1 plátano", "Cacao puro 1 cucharadita"] }
  ],
  almuerzo: [
    { n: "Fruta y frutos secos", c: [["Plátano o fruta de temporada", 20]], f: ["Almendras o nueces 20 g"] },
    { n: "Bocadillo pequeño de {p}", c: [["Pan integral", 45, "G"]], p: "fiambre", f: ["Tomate"] },
    { n: "{p} con fruta", c: [["Fruta troceada", 13]], p: "lacteo", f: ["Nueces 10 g"] },
    { n: "Tortitas de arroz con crema de cacahuete", c: [["Tortitas de arroz", 80]], f: ["Crema de cacahuete 15 g", "1 mandarina"] },
    { n: "Dátiles y {p}", c: [["Dátiles", 66]], p: "lacteo", f: [] }
  ],
  comida: [
    { n: "Arroz salteado con {p} y verduras", c: [["Arroz (peso en crudo)", 78]], p: "carne", f: ["Verduras salteadas (pimiento, calabacín, cebolla)", "Aceite de oliva 1 cucharada", "Fruta de postre"] },
    { n: "Pasta integral boloñesa ({p})", c: [["Pasta integral (en crudo)", 65, "G"]], p: "picada", f: ["Tomate triturado y cebolla", "Ensalada verde", "Aceite de oliva 1 cucharada"] },
    { n: "Lentejas estofadas con verduras y {p}", c: [["Lentejas (en crudo)", 50], ["Pan integral", 45, "G"]], p: "huevo", f: ["Zanahoria, pimiento y cebolla", "Fruta de postre"] },
    { n: "Patata asada con {p} y ensalada", c: [["Patata", 17]], p: "pescado", f: ["Ensalada de tomate y lechuga", "Aceite de oliva 1 cucharada", "Yogur o fruta"] },
    { n: "Quinoa con garbanzos y verduras asadas", c: [["Quinoa (en crudo)", 64]], p: "legumbre", f: ["Berenjena, calabacín y pimiento asados", "Aceite de oliva", "Fruta de postre"] },
    { n: "Paella de {p} y verduras", c: [["Arroz (peso en crudo)", 78]], p: "pescado", f: ["Judías verdes, pimiento, tomate", "Aceite de oliva 1 cucharada", "Ensalada"] },
    { n: "Cuscús con {p} y verduras", c: [["Cuscús (en crudo)", 72, "G"]], p: "carne", f: ["Calabacín, zanahoria y cebolla", "Pasas y especias", "Fruta de postre"] }
  ],
  merienda: [
    { n: "{p} con avena y miel", c: [["Copos de avena", 60, "G"]], p: "lacteo", f: ["Miel 1 cucharadita"] },
    { n: "Tostada con {p} y fruta", c: [["Pan integral", 45, "G"]], p: "fiambre", f: ["1 pieza de fruta"] },
    { n: "Batido recuperador de plátano", c: [["Plátano", 20]], p: "lacteo", f: ["{leche} 250 ml", "Cacao puro 1 cucharadita"] },
    { n: "Fruta y frutos secos", c: [["Fruta de temporada", 13]], f: ["Frutos secos 20 g"] },
    { n: "Tortitas de maíz con {p}", c: [["Tortitas de maíz", 80]], p: "fiambre", f: ["Tomate en rodajas"] }
  ],
  cena: [
    { n: "Revuelto de verduras con {p} y pan", c: [["Pan integral", 45, "G"]], p: "huevo", f: ["Espinacas, champiñones y cebolla", "Aceite de oliva 1 cucharada"] },
    { n: "{p} al horno con patata y verduras", c: [["Patata", 17]], p: "pescado", f: ["Brócoli o judías verdes", "Aceite de oliva 1 cucharada"] },
    { n: "Crema de verduras y {p} a la plancha", c: [["Pan integral", 45, "G"]], p: "carne", f: ["Crema de calabaza o calabacín", "Yogur o fruta"] },
    { n: "Ensalada completa con {p} y legumbre", c: [["Garbanzos o lentejas cocidos", 18]], p: "atun", f: ["Lechuga, tomate, pepino, maíz", "Aceite de oliva 1 cucharada", "Nueces 10 g"] },
    { n: "Wok de {p} con verduras y fideos de arroz", c: [["Fideos de arroz (en crudo)", 80]], p: "carne", f: ["Brócoli, zanahoria, pimiento", "Salsa de soja"] },
    { n: "Boniato asado con {p} y ensalada", c: [["Boniato", 20]], p: "pescado", f: ["Ensalada verde", "Aceite de oliva 1 cucharada"] },
    { n: "Tortilla de patata y verduras con ensalada", c: [["Patata", 17]], p: "huevo", f: ["Cebolla y calabacín", "Ensalada de tomate", "Aceite de oliva"] }
  ]
};
const SLOTS = {
  5: [["desayuno", "Desayuno", 0.25], ["almuerzo", "Media mañana", 0.10], ["comida", "Comida", 0.30], ["merienda", "Merienda", 0.15], ["cena", "Cena", 0.20]],
  4: [["desayuno", "Desayuno", 0.25], ["comida", "Comida", 0.35], ["merienda", "Merienda", 0.15], ["cena", "Cena", 0.25]],
  3: [["desayuno", "Desayuno", 0.30], ["comida", "Comida", 0.40], ["cena", "Cena", 0.30]]
};

function bmr(a) { return 10 * a.peso + 6.25 * a.altura - 5 * a.edad + (a.sexo === "m" ? -161 : 5); }

function nutricionDia(a, dia, carga, idx, rand, cargaSig) {
  const kg = a.peso;
  const fg = a.objetivo === "perder_grasa";
  const ejercicio = dia.reduce((t, s) => t + (MET[s.dep]?.[s.tipo] ?? 6) * kg * s.min / 60, 0);
  let kcal = bmr(a) * 1.35 + ejercicio * 0.9;
  if (fg) kcal *= carga === "alta" ? 0.92 : 0.82;
  let chKg = { descanso: 3, baja: 4, media: 5.5, alta: 7 }[carga];
  if (cargaSig === "alta" && carga !== "alta") chKg += 1; // carga de hidratos antes de día duro
  if (fg) chKg = Math.max(2.5, chKg - 1.2);
  const P = Math.round(kg * (fg ? 2.0 : 1.7));
  let C = Math.round(kg * chKg);
  let G = Math.round((kcal - 4 * P - 4 * C) / 9);
  const gMin = Math.round(kg * 0.8);
  const gMax = Math.round(kg * 1.3);
  if (G < gMin) G = gMin;
  if (G > gMax) { G = gMax; C = Math.round(clamp((kcal - 4 * P - 9 * G) / 4, C, kg * 10)); }
  kcal = 4 * P + 4 * C + 9 * G;

  const slots = SLOTS[a.comidas] || SLOTS[5];
  const comidas = slots.map(([k, nombre, share], j) => {
    const banco = BANCO[k];
    const off = Math.floor(rand() * banco.length);
    const plato = banco[(idx + off + j) % banco.length];
    return { k, nombre, kcal: Math.round(kcal * share), ...platoTxt(plato, a, C * share, P * share) };
  });

  const tips = [];
  const ses = dia.filter(s => !["movilidad"].includes(s.dep));
  if (ses.some(s => s.min >= 75 && s.dep !== "fuerza")) tips.push("Durante el entreno largo: 30-60 g de hidratos/hora (90 g si pasa de 2,5 h) y bebida con sales.");
  if (ses.some(s => DURO.includes(s.tipo))) tips.push("Antes de la sesión clave: comida rica en hidratos 2-3 h antes, baja en grasa y fibra.");
  if (ses.length) tips.push("Después de entrenar: 20-30 g de proteína + hidratos en la siguiente comida (≤ 2 h).");
  if (carga === "descanso") tips.push("Día de descanso: prioriza verdura, proteína y dormir 8 h.");
  if (cargaSig === "alta" && carga !== "alta") tips.push("Mañana toca día duro: cena con buena ración de hidratos.");
  const agua = Math.round((kg * 0.035 + ses.reduce((t, s) => t + s.min, 0) / 60 * 0.6) * 10) / 10;
  tips.push(`Agua: unos ${agua.toLocaleString("es-ES")} litros a lo largo del día.`);

  return { kcal: Math.round(kcal), P, C, G, comidas, tips };
}

function platoTxt(plato, a, chMeta, protMeta) {
  const dieta = a.dieta;
  const items = [];
  let nombreP = "";
  // Proteína
  if (plato.p) {
    const pr = PROT[plato.p][dieta];
    nombreP = pr[2];
    let g = clamp(Math.round(protMeta * 0.75 / (pr[1] / 100) / 5) * 5, 30, plato.p === "lacteo" ? 350 : 250);
    let nom = pr[0];
    if (pr[3] === "L" && a.sinLactosa) nom += " sin lactosa";
    if (nom.startsWith("Huevo")) { const u = clamp(Math.round(g / 60), 1, 3); items.push(`${nom}: ${u} ud.`); }
    else items.push(`${nom}: ${g} g`);
  }
  // Hidratos
  const nC = plato.c.length;
  for (const [nom0, ch, glu] of plato.c) {
    let nom = nom0;
    if (glu === "G" && a.sinGluten) nom = nom.replace(/^(Copos de avena|Harina de avena)/, "$1 certificada sin gluten").replace(/^Pan( integral| de centeno o integral)?/, "Pan sin gluten").replace(/^Pasta integral/, "Pasta sin gluten").replace(/^Cuscús/, "Quinoa").replace(/^Muesli sin azúcar/, "Muesli sin gluten");
    const max = ch < 15 ? 300 : ch < 25 ? 450 : 180;
    const g = clamp(Math.round(chMeta * 0.8 / nC / (ch / 100) / 5) * 5, 15, max);
    items.push(`${nom}: ${g} g`);
  }
  for (const f of plato.f) {
    let t = f.replace("{leche}", LECHE[dieta] + (a.sinLactosa && dieta !== "vegan" ? " sin lactosa" : ""));
    if (dieta === "vegan") t = t.replace(/^Yogur o fruta$/, "Fruta").replace(/^Miel/, "Sirope de agave");
    items.push(t);
  }
  let n = plato.n.replace("{p}", nombreP);
  n = n.charAt(0).toUpperCase() + n.slice(1);
  if (a.sinGluten) n = n.replace("Cuscús", "Quinoa").replace("Pasta integral", "Pasta sin gluten");
  return { plato: n, items };
}

/* =========================================================
   Generar plan completo
   ========================================================= */
function generar(a) {
  const F = calcFase(a);
  const Z = calcZonas(a);
  const T = plantilla(a, F);
  const semana = colocar(a, T, F);
  duraciones(a, semana, F);
  semana.forEach(dia => dia.forEach(s => { s.det = describir(s, a, F, Z); }));
  const cargas = semana.map(cargaDia);
  const rand = rng(a.seed || 1);
  const menu = semana.map((dia, i) => nutricionDia(a, dia, cargas[i], i, rand, cargas[(i + 1) % 7]));
  const porDep = {};
  for (const s of semana.flat()) porDep[s.dep] = (porDep[s.dep] || 0) + s.min;
  const total = Object.values(porDep).reduce((t, x) => t + x, 0);
  return { F, Z, semana, cargas, menu, porDep, total };
}

/* =========================================================
   Pintado
   ========================================================= */
function pintar(a, plan) {
  const { F, Z, semana, cargas, menu, porDep, total } = plan;
  const fase = FASES[F.clave];
  const nSes = semana.flat().filter(s => s.dep !== "movilidad").length;
  const nDesc = semana.filter((d, i) => cargas[i] === "descanso").length;
  const kcalMedia = Math.round(menu.reduce((t, m) => t + m.kcal, 0) / 7);
  const orden = ["run", "bike", "swim", "carrera", "fuerza", "movilidad"];

  const tira = semana.map((dia, i) => {
    const ic = dia.length ? dia.map(s => DEP[s.dep].i).join("") : "😴";
    const m = dia.reduce((t, s) => t + s.min, 0);
    return `<a href="#dia-${i}" class="${cargas[i] === "descanso" ? "rest" : ""}"><div class="d">${DIAS_C[i]}</div><div class="ic">${ic}</div><div class="m">${m ? fmtMin(m) : "—"}</div></a>`;
  }).join("");

  const barra = orden.filter(k => porDep[k]).map(k => `<i style="width:${porDep[k] / total * 100}%;background:var(--${k})"></i>`).join("");
  const leyenda = orden.filter(k => porDep[k]).map(k => `<span style="--c:var(--${k})">${DEP[k].n} ${fmtMin(porDep[k])}</span>`).join("");

  const cab = `
  <section class="cab">
    <div class="cab-top">
      <div>
        <h2>${esc(a.nombre)} · semana ${a.semanaNum}</h2>
        <div class="sub">${esc(OBJ[a.objetivo])}${TAPER[a.objetivo] && a.semanas > 0 ? ` · faltan ${a.semanas} semana${a.semanas > 1 ? "s" : ""}` : ""} · nivel ${a.nivel}</div>
      </div>
      <div><span class="badge ${F.descarga ? "desc" : "fase"}">${fase.n}</span></div>
    </div>
    <p class="fase-txt">${fase.d}</p>
    <div class="kpis">
      <div class="kpi"><b>${fmtMin(total)}</b><span>Tiempo total</span></div>
      <div class="kpi"><b>${nSes}</b><span>Sesiones</span></div>
      <div class="kpi"><b>${nDesc}</b><span>Días de descanso</span></div>
      <div class="kpi"><b>${kcalMedia.toLocaleString("es-ES")}</b><span>kcal/día (media)</span></div>
    </div>
    <div class="barra" role="img" aria-label="Reparto del tiempo por deporte">${barra}</div>
    <div class="leyenda">${leyenda}</div>
    <div class="tira">${tira}</div>
    <div class="botonera">
      <button class="btn sec mini" data-acc="imprimir">🖨️ Imprimir / PDF</button>
      <button class="btn sec mini" data-acc="copiar">📋 Copiar (WhatsApp)</button>
      <button class="btn sec mini" data-acc="siguiente">⏭️ Semana siguiente</button>
      <button class="btn sec mini" data-acc="variar">🎲 Otro menú</button>
    </div>
  </section>`;

  const dias = semana.map((dia, i) => {
    const ses = dia.length ? dia.map(s => sesionHTML(s)).join("") :
      `<div class="ses descanso"><div class="ses-cab"><h4>😴 Descanso total</h4></div><div class="nota">Recuperar también es entrenar: dormir bien, hidratarse y, si apetece, un paseo suave.</div></div>`;
    return `<article class="dia" id="dia-${i}">
      <div class="dia-cab"><h3>${DIAS[i]}</h3><span class="carga ${cargas[i]}">${CARGA_TXT[cargas[i]]}</span></div>
      ${ses}
    </article>`;
  }).join("");

  const menus = menu.map((m, i) => `
    <article class="dia menu-dia">
      <div class="dia-cab"><h3>${DIAS[i]}</h3><span class="carga ${cargas[i]}">${CARGA_TXT[cargas[i]]}</span></div>
      <div class="macros">
        <span><b>${m.kcal.toLocaleString("es-ES")}</b> kcal</span>
        <span>Hidratos <b>${m.C} g</b></span>
        <span>Proteína <b>${m.P} g</b></span>
        <span>Grasa <b>${m.G} g</b></span>
      </div>
      ${m.comidas.map(c => `<div class="comida">
        <div class="comida-cab"><span class="t">${c.nombre}</span><span class="k">~${c.kcal} kcal</span></div>
        <div class="n">${esc(c.plato)}</div>
        <ul>${c.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      </div>`).join("")}
      <div class="tip">${m.tips.map(esc).join("<br>")}</div>
    </article>`).join("");

  const fcFila = (i) => `<tr><td>${ZNOM[i]}</td><td>${Z.fc[i][0]}-${Z.fc[i][1]}</td>${Z.ritmos ? `<td>${fmtRitmo(Z.ritmos[i][0])}-${fmtRitmo(Z.ritmos[i][1])}</td>` : ""}${Z.potencia ? `<td>${i === 0 ? "<" + Z.potencia[0][1] : Z.potencia[i][0] + "-" + Z.potencia[i][1]}</td>` : ""}<td>${RPE[i]}</td></tr>`;
  const carreraT = Z.carrera ? `<h3>Ritmos y tiempos estimados</h3><div class="wrap"><table><tr><th>Prueba</th><th>Ritmo</th><th>Tiempo</th></tr>
    ${[["5k", "5 km"], ["10k", "10 km"], ["media", "Media maratón"], ["maraton", "Maratón"]].map(([k, n]) => `<tr><td>${n}</td><td>${fmtRitmo(Z.carrera[k].p)} /km</td><td>${fmtHoras(Z.carrera[k].t)}</td></tr>`).join("")}
    </table></div>` : "";
  const zonasH = `<article class="dia zonas">
    <h3>Zonas de entrenamiento</h3>
    <div class="wrap"><table><tr><th>Zona</th><th>Pulso (ppm)</th>${Z.ritmos ? "<th>Ritmo /km</th>" : ""}${Z.potencia ? "<th>Vatios</th>" : ""}<th>Sensación</th></tr>
    ${[0, 1, 2, 3, 4].map(fcFila).join("")}</table></div>
    <small>FC máx ${Z.fcmax} ppm${Z.fcmaxEst ? " (estimada por edad: mejor medirla en una prueba)" : ""}${Z.fcrep ? ` · FC reposo ${Z.fcrep} ppm (método Karvonen)` : ""}.
    ${Z.ritmos ? "" : " Añade una marca de 5 o 10 km para obtener ritmos."}${Z.potencia || !a.deportes.bike ? "" : " Añade el FTP para obtener vatios."}</small>
    ${carreraT}
    <h3>Reglas de la semana</h3>
    <ul>
      <li>~80 % del tiempo en Z1-Z2 (suave de verdad) y ~20 % en Z3-Z5.</li>
      <li>Si un día hay dolor (no solo cansancio), cambia la sesión por descanso o movilidad.</li>
      <li>Las sesiones de calidad y la tirada larga son las prioritarias: si se pierde una sesión, recupera esas y no las suaves.</li>
      <li>Dormir 7-9 h es parte del plan.</li>
    </ul>
    ${a.notas ? `<h3>Notas del entrenador</h3><p>${esc(a.notas).replace(/\n/g, "<br>")}</p>` : ""}
    <p class="aviso">Plan orientativo generado automáticamente. No sustituye la valoración de un médico deportivo ni de un dietista-nutricionista; ajústalo según las sensaciones y la evolución del deportista.</p>
  </article>`;

  $("#salida").innerHTML = `${cab}
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="true" data-tab="t-entrenos">Entrenos</button>
      <button role="tab" aria-selected="false" data-tab="t-menu">Menú</button>
      <button role="tab" aria-selected="false" data-tab="t-zonas">Zonas</button>
    </div>
    <div class="tab-panel" id="t-entrenos">${dias}</div>
    <div class="tab-panel print-break" id="t-menu" hidden>${menus}</div>
    <div class="tab-panel print-break" id="t-zonas" hidden>${zonasH}</div>`;
  $("#vacio").hidden = true;
  $("#salida").hidden = false;
}

function sesionHTML(s) {
  const d = s.det;
  const ej = d.ejercicios ? `<table class="ej">${d.ejercicios.map(e => `<tr><td>${esc(e.n)}</td><td>${esc(e.s)}</td></tr>`).join("")}</table>` : "";
  return `<div class="ses ${s.dep}">
    <div class="ses-cab"><h4>${DEP[s.dep].i} ${esc(d.titulo)}</h4><span class="dur">${fmtMin(s.min)}</span></div>
    <div class="zona">${esc(DEP[s.dep].n)} · ${esc(d.zona)}</div>
    ${d.pasos.length ? `<ol>${d.pasos.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${ej}
    ${d.nota ? `<div class="nota">${esc(d.nota)}</div>` : ""}
  </div>`;
}

function textoPlano(a, plan) {
  const { F, semana, menu } = plan;
  const L = [`*Plan semanal · ${a.nombre}* (semana ${a.semanaNum})`, `${OBJ[a.objetivo]} · ${FASES[F.clave].n}`, ""];
  semana.forEach((dia, i) => {
    L.push(`*${DIAS[i].toUpperCase()}*`);
    if (!dia.length) L.push("😴 Descanso");
    for (const s of dia) {
      L.push(`${DEP[s.dep].i} ${s.det.titulo} · ${fmtMin(s.min)}`);
      for (const p of s.det.pasos) L.push(`  - ${p}`);
      if (s.det.ejercicios) for (const e of s.det.ejercicios) L.push(`  • ${e.n}: ${e.s}`);
    }
    const m = menu[i];
    L.push(`🍽️ ${m.kcal} kcal · HC ${m.C} g · P ${m.P} g · G ${m.G} g`);
    for (const c of m.comidas) L.push(`  ${c.nombre}: ${c.plato}`);
    L.push("");
  });
  return L.join("\n");
}

/* =========================================================
   Formulario y almacenamiento
   ========================================================= */
const KEY = "entrenador.atletas.v1";
let atletas = [];
let actual = null;
let planActual = null;

function cargar() {
  try { atletas = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { atletas = []; }
}
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(atletas)); } catch (e) { toast("No se ha podido guardar en este navegador"); }
}
function toast(t) {
  const el = $("#toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function leerForm() {
  const f = $("#form");
  const v = n => f.elements[n].value;
  const num = n => { const x = parseFloat(v(n)); return isNaN(x) ? 0 : x; };
  const chk = n => f.elements[n].checked;
  return {
    id: actual?.id || Date.now().toString(36),
    seed: actual?.seed || Math.floor(Math.random() * 1e9),
    nombre: v("nombre").trim() || "Deportista",
    sexo: v("sexo"), edad: num("edad"), nivel: v("nivel"), peso: num("peso"), altura: num("altura"),
    objetivo: v("objetivo"), semanas: Math.round(num("semanas")), semanaNum: Math.max(1, Math.round(num("semanaNum"))),
    deportes: { run: chk("run"), bike: chk("bike"), swim: chk("swim"), fuerza: chk("fuerza") },
    dias: $$("#dias input:checked").map(x => +x.value),
    horas: num("horas"), descanso: +v("descanso"),
    fcmax: num("fcmax"), fcrep: num("fcrep"), marca5k: v("marca5k"), marca10k: v("marca10k"), ftp: num("ftp"),
    dieta: v("dieta"), comidas: +v("comidas"), sinGluten: chk("sinGluten"), sinLactosa: chk("sinLactosa"),
    notas: v("notas")
  };
}
function escribirForm(a) {
  const f = $("#form");
  const set = (n, x) => { f.elements[n].value = x ?? ""; };
  ["nombre", "sexo", "edad", "nivel", "peso", "altura", "objetivo", "semanas", "semanaNum", "horas", "descanso", "marca5k", "marca10k", "dieta", "comidas", "notas"].forEach(n => set(n, a[n]));
  ["fcmax", "fcrep", "ftp"].forEach(n => set(n, a[n] || ""));
  ["run", "bike", "swim", "fuerza"].forEach(n => { f.elements[n].checked = !!a.deportes[n]; });
  f.elements.sinGluten.checked = !!a.sinGluten; f.elements.sinLactosa.checked = !!a.sinLactosa;
  $$("#dias input").forEach(x => { x.checked = a.dias.includes(+x.value); });
}
const POR_DEFECTO = {
  nombre: "", sexo: "h", edad: 35, nivel: "intermedio", peso: 70, altura: 172, objetivo: "10k", semanas: 12, semanaNum: 1,
  deportes: { run: true, bike: false, swim: false, fuerza: true }, dias: [1, 2, 3, 5, 6], horas: 6, descanso: 0,
  fcmax: "", fcrep: "", marca5k: "", marca10k: "", ftp: "", dieta: "omni", comidas: 5, sinGluten: false, sinLactosa: false, notas: ""
};

function pintarSelector() {
  const sel = $("#sel-atleta");
  sel.innerHTML = `<option value="">— Nuevo deportista —</option>` +
    atletas.map(a => `<option value="${a.id}">${esc(a.nombre)} · ${esc(OBJ[a.objetivo])}</option>`).join("");
  sel.value = actual?.id || "";
}

function validar(a) {
  if (!a.dias.length) return "Marca al menos un día disponible.";
  if (a.objetivo === "triatlon" && !(a.deportes.run && a.deportes.bike && a.deportes.swim)) {
    a.deportes.run = a.deportes.bike = a.deportes.swim = true;
    $("#form").elements.run.checked = $("#form").elements.bike.checked = $("#form").elements.swim.checked = true;
    toast("Triatlón: activados carrera, bici y natación");
  }
  if (a.objetivo === "ciclismo" && !a.deportes.bike) { a.deportes.bike = true; $("#form").elements.bike.checked = true; }
  if (RUN_GOALS.includes(a.objetivo) && !a.deportes.run) { a.deportes.run = true; $("#form").elements.run.checked = true; }
  if (!a.horas || a.horas < 1.5) return "Indica al menos 1,5 horas por semana.";
  if ((a.marca5k && !parseTiempo(a.marca5k)) || (a.marca10k && !parseTiempo(a.marca10k))) return "Las marcas deben ir como mm:ss (por ejemplo 24:30).";
  return "";
}

function generarYGuardar() {
  const a = leerForm();
  const err = validar(a);
  if (err) { toast(err); return; }
  actual = a;
  const i = atletas.findIndex(x => x.id === a.id);
  if (i >= 0) atletas[i] = a; else atletas.push(a);
  guardar();
  pintarSelector();
  planActual = generar(a);
  pintar(a, planActual);
  if (window.innerWidth < 980) $("#plan").scrollIntoView({ behavior: "smooth" });
}

function init() {
  // Días
  const cont = $("#dias");
  DIAS.forEach((d, i) => {
    cont.insertAdjacentHTML("beforeend", `<label class="chip" title="${d}"><input type="checkbox" value="${i}">${DIAS_C[i]}</label>`);
  });
  $("#sel-descanso").innerHTML = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");

  cargar();
  pintarSelector();
  if (atletas.length) { actual = atletas[atletas.length - 1]; escribirForm(actual); pintarSelector(); planActual = generar(actual); pintar(actual, planActual); }
  else escribirForm(POR_DEFECTO);

  $("#form").addEventListener("submit", e => { e.preventDefault(); generarYGuardar(); });
  $("#sel-atleta").addEventListener("change", e => {
    const a = atletas.find(x => x.id === e.target.value);
    if (a) { actual = a; escribirForm(a); planActual = generar(a); pintar(a, planActual); }
    else { actual = null; escribirForm(POR_DEFECTO); $("#salida").hidden = true; $("#vacio").hidden = false; }
  });
  $("#btn-nuevo").addEventListener("click", () => {
    actual = null; escribirForm(POR_DEFECTO); pintarSelector(); $("#salida").hidden = true; $("#vacio").hidden = false;
    $("#form").elements.nombre.focus();
  });
  $("#btn-borrar").addEventListener("click", () => {
    if (!actual) return;
    if (!confirm(`¿Borrar a ${actual.nombre}?`)) return;
    atletas = atletas.filter(x => x.id !== actual.id); guardar();
    actual = null; escribirForm(POR_DEFECTO); pintarSelector(); $("#salida").hidden = true; $("#vacio").hidden = false;
  });

  $("#salida").addEventListener("click", async e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", b === tab));
      $$(".tab-panel").forEach(p => { p.hidden = p.id !== tab.dataset.tab; });
      return;
    }
    const b = e.target.closest("[data-acc]");
    if (!b || !actual) return;
    const acc = b.dataset.acc;
    if (acc === "imprimir") window.print();
    else if (acc === "copiar") {
      const txt = textoPlano(actual, planActual);
      try { await navigator.clipboard.writeText(txt); toast("Plan copiado: pégalo en WhatsApp o en un correo"); }
      catch (err) { const w = window.open("", "_blank"); if (w) { w.document.body.innerText = txt; } }
    } else if (acc === "siguiente") {
      actual.semanaNum += 1;
      if (actual.semanas > 0) actual.semanas -= 1;
      actual.seed = Math.floor(Math.random() * 1e9);
      escribirForm(actual); generarYGuardar(); toast(`Semana ${actual.semanaNum} generada`);
    } else if (acc === "variar") {
      actual.seed = Math.floor(Math.random() * 1e9);
      generarYGuardar(); $$("[data-tab]")[1].click();
    }
  });
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
if (typeof module !== "undefined") module.exports = { generar, calcZonas, calcFase };
