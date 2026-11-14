/* Motor del plan: decide las sesiones de la semana, su contenido y el menú.
   Trabaja con semanas reales (lunes AAAA-MM-DD) y con las carreras del deportista. */
import { clamp, r5, fmtMin, fmtRitmo, fmtHoras, parseTiempo, rng, sumaDias, diaSemana, diasEntre, uid, lunesDe } from "./util.js?v=202611142037";

/* =========================================================
   Catálogos
   ========================================================= */
export const DEP = {
  run: { n: "Carrera", i: "🏃" }, bike: { n: "Bici", i: "🚴" }, swim: { n: "Natación", i: "🏊" },
  fuerza: { n: "Fuerza", i: "🏋️" }, movilidad: { n: "Movilidad", i: "🧘" }, carrera: { n: "Competición", i: "🏁" }, descanso: { n: "Descanso", i: "😴" }
};
export const OBJ = {
  salud: "Forma física y salud", bajar_peso: "Bajar peso", musculo: "Ganar músculo", lesion: "Vuelta tras lesión",
  "5k": "Carrera 5 km", "10k": "Carrera 10 km", media: "Media maratón", maraton: "Maratón",
  ciclismo: "Marcha cicloturista / gran fondo", triatlon: "Triatlón"
};
export const PRUEBAS = {
  "5k": "5 km", "10k": "10 km", "15k": "15 km", media: "Media maratón", maraton: "Maratón",
  ciclismo: "Marcha de bici", triatlon: "Triatlón", otra: "Otra carrera a pie"
};
export const PRIORIDAD = { A: "Principal", B: "Importante", C: "Preparación" };
const RUN_GOALS = ["5k", "10k", "media", "maraton"];
const GENERAL = ["salud", "bajar_peso"];
const TAPER = { "5k": 1, "10k": 1, media: 2, maraton: 3, ciclismo: 2, triatlon: 2, otra: 1 };
export const FASES = {
  base: { n: "Base aeróbica", vol: 0.9, d: "Construir el motor aeróbico: mucho volumen suave (Z2), técnica y fuerza general." },
  construccion: { n: "Construcción", vol: 1, d: "Se mantiene el volumen y entra trabajo de umbral y VO2máx. La fuerza pasa a cargas más altas." },
  especifico: { n: "Específico", vol: 1, d: "Entrenos a ritmo de competición y tiradas largas específicas. La fuerza se orienta a potencia." },
  puesta: { n: "Puesta a punto", vol: 0.65, d: "Baja el volumen para llegar fresco, con toques cortos a ritmo de carrera." },
  carrera: { n: "Semana de competición", vol: 0.45, d: "Semana muy ligera: activación, descanso y llegar con las piernas frescas." },
  descarga: { n: "Semana de descarga", vol: 0.65, d: "Cada cuarta semana baja la carga (~35 %) para asimilar el trabajo y evitar sobrecargas." },
  acumulacion: { n: "Hipertrofia · acumulación", vol: 1, d: "Volumen alto de series (8-12 repeticiones) cerca del fallo para construir músculo." },
  intensificacion: { n: "Hipertrofia · intensificación", vol: 1, d: "Menos repeticiones y más carga (6-8) para ganar fuerza y seguir creciendo." },
  iniciacion: { n: "Iniciación: correr y andar", vol: 0.8, d: "Empezar a correr sin lesionarse: tramos cortos de trote muy suave alternados con caminata, que crecen cada semana hasta correr 30 minutos seguidos." },
  readaptacion: { n: "Readaptación", vol: 0.7, d: "Volver a correr poco a poco alternando carrera y caminata, con fuerza preventiva. Manda el dolor." },
  progresion: { n: "Vuelta progresiva", vol: 0.85, d: "Bloques de carrera cada vez más largos. Si no hay molestias, se avanza; si las hay, se repite la semana." },
  consolidacion: { n: "Consolidación", vol: 1, d: "Carrera continua suave y fuerza. Preparado para volver a un plan normal." }
};

/* =========================================================
   Contexto de la semana: carreras, fase, número de semana
   ========================================================= */
export function contexto(a, lunes) {
  const fin = sumaDias(lunes, 6);
  const carreras = (a.carreras || []).filter(c => c.fecha);
  const enSemana = carreras.filter(c => c.fecha >= lunes && c.fecha <= fin).sort((x, y) => x.fecha.localeCompare(y.fecha));
  const A = carreras.filter(c => c.prioridad === "A" && c.fecha >= lunes).sort((x, y) => x.fecha.localeCompare(y.fecha))[0] || null;
  const semanas = A ? Math.floor(diasEntre(lunes, A.fecha) / 7) + 1 : 0;
  let obj = a.objetivo;
  if (A && semanas <= 40) obj = A.prueba === "otra" ? (RUN_GOALS.includes(a.objetivo) ? a.objetivo : "10k") : A.prueba === "15k" ? "10k" : A.prueba; // un 15K se prepara como un 10K largo
  const semanaNum = Math.max(1, Math.floor(diasEntre(a.inicio || lunes, lunes) / 7) + 1);
  return { lunes, fin, A, semanas, obj, semanaNum, enSemana };
}

function calcFase(a, ctx) {
  const t = TAPER[ctx.obj];
  let f;
  if (a.cero && ctx.semanaNum <= INICIACION.length && !(ctx.A && ctx.semanas === 1)) return { f: "iniciacion", descarga: false, clave: "iniciacion" };
  if (a.objetivo === "lesion" && !ctx.A) {
    f = ctx.semanaNum <= 2 ? "readaptacion" : ctx.semanaNum <= 6 ? "progresion" : "consolidacion";
    return { f, descarga: false, clave: f };
  }
  if (a.objetivo === "musculo" && !ctx.A) {
    f = (Math.floor((ctx.semanaNum - 1) / 4) % 2 === 0) ? "acumulacion" : "intensificacion";
  } else if (t && ctx.semanas > 0) {
    const s = ctx.semanas, tt = ctx.A?.prueba === "otra" ? 1 : t;
    f = s === 1 ? "carrera" : s <= tt ? "puesta" : s <= tt + 6 ? "especifico" : s <= tt + 14 ? "construccion" : "base";
  } else if (t) {
    f = a.nivel === "principiante" ? "base" : "construccion";
  } else {
    f = (Math.floor((ctx.semanaNum - 1) / 4) % 2 === 0) ? "base" : "construccion";
  }
  const descarga = ["base", "construccion", "especifico", "acumulacion", "intensificacion"].includes(f) && ctx.semanaNum % 4 === 0;
  return { f, descarga, clave: descarga ? "descarga" : f };
}

/* =========================================================
   Datos efectivos: lo que pone la ficha y, si falta, lo que dicen sus actividades
   ========================================================= */
export function efectivo(a) {
  if (a._ef) return a;
  const cero = a.nivel === "cero";
  const h = a.hist || {};
  const fc = { ...(a.fc || {}) }, marcas = { ...(a.marcas || {}) }, de = {};
  if (!+fc.max && h.fcMaxObs) { fc.max = h.fcMaxObs; de.fcmax = true; }
  if (!+fc.umbral && h.lthr && !Array.isArray(fc.zonas)) { fc.umbral = h.lthr; de.umbral = true; }
  for (const k of ["5k", "10k", "media", "maraton"]) if (!marcas[k] && h.mejores?.[k]) { marcas[k] = fmtHoras(h.mejores[k].s); de["m" + k] = true; }
  let ftp = a.ftp;
  if (!+ftp && h.ftpEst) { ftp = h.ftpEst; de.ftp = true; }
  if (!+fc.rep && h.fcRep) { fc.rep = h.fcRep; de.fcrep = true; }
  return { ...a, nivel: cero ? "principiante" : a.nivel, cero, fc, marcas, ftp, _ef: true, _de: de };
}
/** Minutos de entreno de resistencia que tocan esta semana según su historial (progresión prudente). */
function volumenHistorial(a, lunes) {
  const h = a.hist;
  if (!h || !h.horasMedia || +a.horas > 0) return null;
  const w = clamp(Math.floor(diasEntre(lunesDe(h.fecha), lunes) / 7), 0, 12);
  return h.horasMedia * 60 * 1.1 * (1 + 0.03 * Math.min(w, 5)); // +10 % y luego +3 %/semana, máximo ≈ +25 %
}

/* =========================================================
   VDOT de Jack Daniels: de una marca a todos los ritmos de entreno
   ========================================================= */
const vo2De = v => -4.60 + 0.182258 * v + 0.000104 * v * v;                       // v en m/min
const fraccion = t => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t en min
export const vdotDe = (metros, seg) => { const t = seg / 60; return vo2De(metros / t) / fraccion(t); };
const velDeVo2 = x => { const a = 0.000104, b = 0.182258, c = -4.60 - x; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); };
/** Ritmo (s/km) al porcentaje dado del VDOT. */
export const ritmoVdot = (vdot, pct) => 60000 / velDeVo2(vdot * pct);
/** Tiempo (s) previsto para una distancia con ese VDOT. */
export function tiempoVdot(vdot, metros) {
  let lo = metros / 400 * 60, hi = metros / 50 * 60; // entre 24 km/h y 3 km/h
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (vdotDe(metros, mid) > vdot) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/**
 * Tiempo previsto para una distancia a partir de TODAS sus marcas: cada marca predice el tiempo (VDOT)
 * y se hace la media dando más peso a la marca de distancia más parecida (la propia distancia manda).
 */
export function tiempoMarcas(marcasV, metros) {
  let st = 0, sw = 0;
  for (const x of marcasV) {
    const igual = Math.abs(x.metros - metros) < 1;
    const w = igual ? 3 : 1 / (1 + 2.5 * Math.abs(Math.log(metros / x.metros)));
    let t = igual ? x.t : tiempoVdot(x.v, metros);
    if (metros > 30000 && x.metros < 30000) t *= 1.03; // un maratón sale algo más lento de lo que dicen las distancias cortas
    st += t * w; sw += w;
  }
  return st / sw;
}
export const NOMBRE_RITMO = { recuperacion: "Recuperación", rodaje: "Rodaje", tirada: "Tirada larga", maraton: "Ritmo maratón", media: "Ritmo media", umbral: "Umbral", "10k": "Ritmo 10K", "5k": "Ritmo 5K", series: "Series (VO2máx)" };
export const ZONA_RITMO = { recuperacion: 1, rodaje: 2, tirada: 2, maraton: 3, media: 3, umbral: 4, "10k": 4, "5k": 5, series: 5 };

/* =========================================================
   Zonas
   ========================================================= */
export function calcZonas(a) {
  a = efectivo(a);
  const fc = a.fc || {};
  const fcmaxEst = !fc.max;
  const fcmax = +fc.max || Math.round(208 - 0.7 * (a.edad || 35));
  const fcrepEst = !(+fc.rep);
  const fcrep = +fc.rep || (a.nivel === "avanzado" ? 52 : a.nivel === "intermedio" ? 58 : 64);
  const umbral = +fc.umbral || 0;
  let zonasFC, metodo;
  const propias = Array.isArray(fc.zonas) && fc.zonas.length === 5 && fc.zonas.every(z => z && +z[0] > 0 && +z[1] > 0);
  if (propias) { zonasFC = fc.zonas.map(z => [+z[0], +z[1]]); metodo = "Zonas propias del deportista"; }
  else if (umbral) {
    zonasFC = [[0.65, 0.84], [0.85, 0.89], [0.90, 0.94], [0.95, 0.99], [1.0, 1.06]].map(([lo, hi]) => [Math.round(umbral * lo), Math.min(Math.round(umbral * hi), fc.max ? fcmax : 999)]);
    metodo = `FC de umbral ${umbral} ppm${a._de?.umbral ? " (estimada con sus actividades)" : ""} (método Friel)`;
  } else if (fcrep) {
    zonasFC = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1]].map(([lo, hi]) => [Math.round(fcrep + (fcmax - fcrep) * lo), Math.round(fcrep + (fcmax - fcrep) * hi)]);
    metodo = `FC máx ${fcmax}${fcmaxEst ? " (estimada por edad)" : a._de?.fcmax ? " (de sus actividades)" : ""} y reposo ${fcrep}${fcrepEst ? " (estimado)" : a._de?.fcrep ? " (de sus datos)" : ""} (método Karvonen).${fcmaxEst || fcrepEst ? " Mejor medirlas o importar sus actividades." : ""}`;
  } else {
    zonasFC = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1]].map(([lo, hi]) => [Math.round(fcmax * lo), Math.round(fcmax * hi)]);
    metodo = `% de la FC máx ${fcmax}${fcmaxEst ? " (estimada por edad: mejor medirla o importarla)" : a._de?.fcmax ? " (de sus actividades)" : ""}`;
  }

  const m = a.marcas || {};
  let t10 = parseTiempo(m["10k"]);
  const t5 = parseTiempo(m["5k"]), t21 = parseTiempo(m.media), t42 = parseTiempo(m.maraton), t1 = parseTiempo(m["1k"]), t15 = parseTiempo(m["15k"]);
  if (!t10 && t15) t10 = t15 / Math.pow(1.5, 1.06);
  if (!t10 && t1) t10 = t1 * Math.pow(10, 1.08);
  if (!t10 && t5) t10 = t5 * Math.pow(2, 1.06);
  if (!t10 && t21) t10 = t21 / Math.pow(2.10975, 1.06);
  if (!t10 && t42) t10 = t42 / Math.pow(4.2195, 1.08);
  let ritmos = null, carrera = null, ritmoEstimado = false;
  if (!t10 && !t5) {
    // sin marcas: un 5 km prudente según nivel, sexo y edad (se avisa de que es estimado)
    const base = { cero: [2280, 2520], principiante: [1860, 2100], intermedio: [1500, 1710], avanzado: [1260, 1410] }[a.cero ? "cero" : a.nivel] || [1860, 2100];
    const e5 = base[a.sexo === "m" ? 1 : 0] * (1 + 0.006 * Math.max(0, (+a.edad || 35) - 35));
    t10 = e5 * Math.pow(2, 1.06); ritmoEstimado = true;
  }
  let tipos = null, vdot = null, marcasV = null;
  if (t10) {
    // Todas sus marcas reales cuentan (5K, 10K, media, maratón). Sin marcas: el 5 km estimado.
    marcasV = [["1k", 1000, t1], ["5k", 5000, t5], ["10k", 10000, parseTiempo(m["10k"])], ["15k", 15000, t15], ["media", 21097.5, t21], ["maraton", 42195, t42]]
      .filter(x => x[2] && x[2] / (x[1] / 1000) > 150).map(([k, metros, t]) => ({ k, metros, t, v: vdotDe(metros, t) }));
    if (!marcasV.length) marcasV = [{ k: "10k", metros: 10000, t: t10, v: vdotDe(10000, t10) }];
    // VDOT para los ritmos de entreno: media de sus marcas (el maratón pesa la mitad: depende mucho del fondo)
    const pw = x => x.k === "maraton" || x.k === "1k" ? 0.5 : 1; // el 1 km depende mucho de la velocidad y el maratón del fondo
    vdot = marcasV.reduce((s, x) => s + x.v * pw(x), 0) / marcasV.reduce((s, x) => s + pw(x), 0);
    const r = pct => ritmoVdot(vdot, pct);
    const e5 = tiempoMarcas(marcasV, 5000), e10 = tiempoMarcas(marcasV, 10000), e21 = tiempoMarcas(marcasV, 21097.5), e42 = tiempoMarcas(marcasV, 42195);
    const e1 = tiempoMarcas(marcasV, 1000), e15 = tiempoMarcas(marcasV, 15000);
    carrera = { "1k": { p: e1, t: e1 }, "15k": { p: e15 / 15, t: e15 }, "5k": { p: e5 / 5, t: e5 }, "10k": { p: e10 / 10, t: e10 }, media: { p: e21 / 21.0975, t: e21 }, maraton: { p: e42 / 42.195, t: e42 } };
    // ritmos con nombre (s/km, [rápido, lento])
    const rango = (p, a, b) => [Math.round(p - a), Math.round(p + b)];
    tipos = {
      recuperacion: [Math.round(r(0.62)), Math.round(r(0.57))],
      rodaje: [Math.round(r(0.68)), Math.round(r(0.63))],
      tirada: [Math.round(r(0.66)), Math.round(r(0.62))],
      maraton: rango(carrera.maraton.p, 4, 4),
      media: rango(carrera.media.p, 4, 4),
      umbral: rango(r(0.88), 4, 4),
      "10k": rango(carrera["10k"].p, 3, 3),
      "5k": rango(carrera["5k"].p, 3, 3),
      series: rango(r(0.975), 4, 4)
    };
    // zonas de ritmo coherentes con los ritmos con nombre
    ritmos = [tipos.recuperacion, tipos.rodaje, tipos.maraton, tipos.umbral, tipos.series];
  }
  let potencia = null;
  if (+a.ftp) potencia = [[0, 0.55], [0.56, 0.75], [0.76, 0.90], [0.91, 1.05], [1.06, 1.20]].map(([lo, hi]) => [Math.round(a.ftp * lo), Math.round(a.ftp * hi)]);
  let nado = null;
  const css = parseTiempo(a.css);
  if (css) nado = [[css + 20, css + 30], [css + 10, css + 18], [css + 4, css + 9], [css - 2, css + 3], [css - 8, css - 3]];
  // ritmos por zona escritos por el entrenador (mandan sobre todo lo demás)
  const rz = a.ritmosZona;
  let ritmosPropios = false;
  if (Array.isArray(rz) && rz.length === 5 && rz.every(z => z && parseTiempo(z[0]) && parseTiempo(z[1]))) {
    ritmos = rz.map(z => { const x = parseTiempo(z[0]), y = parseTiempo(z[1]); return [Math.min(x, y), Math.max(x, y)]; });
    ritmosPropios = true; ritmoEstimado = false;
    const R = ritmos;
    tipos = { recuperacion: R[0], rodaje: R[1], tirada: R[1], maraton: R[2], media: R[2], umbral: R[3], "10k": R[3], "5k": R[4], series: R[4] };
  }
  return { fcmax, fcmaxEst, fcrep, umbral, fc: zonasFC, metodo, ritmos, carrera: ritmoEstimado ? null : carrera, potencia, nado, ritmoEstimado, ritmosPropios, tipos, vdot: vdot ? Math.round(vdot * 10) / 10 : null, marcasV: ritmoEstimado ? null : marcasV };
}

export const ZNOM = ["Z1 · Recuperación", "Z2 · Aeróbico suave", "Z3 · Tempo", "Z4 · Umbral", "Z5 · VO2máx"];
export const RPE = ["RPE 2-3 · conversación fácil", "RPE 4-5 · puedes hablar en frases", "RPE 6 · frases cortas", "RPE 7-8 · solo palabras sueltas", "RPE 9 · muy duro"];

function zt(Z, dep, z) {
  const i = z - 1, partes = [];
  if (dep === "run" && Z.ritmos) return `Z${z} a ${fmtRitmo(Z.ritmos[i][0])}-${fmtRitmo(Z.ritmos[i][1])} /km (${Z.fc[i][0]}-${Z.fc[i][1]} ppm)`;
  if (dep !== "swim") partes.push(`${Z.fc[i][0]}-${Z.fc[i][1]} ppm`);
  if (dep === "bike" && Z.potencia) partes.push(i === 0 ? `<${Z.potencia[0][1]} W` : `${Z.potencia[i][0]}-${Z.potencia[i][1]} W`);
  if (dep === "swim") partes.push(Z.nado ? `${fmtRitmo(Z.nado[i][0])}-${fmtRitmo(Z.nado[i][1])} /100 m` : RPE[i]);
  return `Z${z} (${partes.join(" · ")})`;
}
const ritmoCarrera = (Z, obj) => Z.carrera && Z.carrera[obj] ? ` (${fmtRitmo(Z.carrera[obj].p)} /km)` : "";

/* =========================================================
   Plantilla de sesiones
   ========================================================= */
const S = (dep, tipo, extra = {}) => ({ dep, tipo, ...extra });
const depDePrueba = p => p === "ciclismo" ? "bike" : p === "triatlon" ? "carrera" : "run";

function plantilla(a, F, ctx) {
  const d = a.deportes || {}, ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const obj = ctx.obj;
  const general = GENERAL.includes(obj);
  let P = [], prim = "run", k = 0, fuerzaTipo = "general";
  const cardioSel = ["run", "bike", "swim"].filter(x => d[x]);
  if (F.f === "iniciacion") {
    // desde cero: 3 sesiones de correr y andar, algo de bici o natación si las hace y fuerza básica
    P = [S("run", "iniciacion"), S("run", "iniciacion"), S("run", "iniciacion")];
    for (const x of ["bike", "swim"]) if (d[x]) P.push(S(x, "suave", { tope: 40 }));
    const dias = [0, 1, 2, 3, 4, 5, 6].filter(x => dispDia(a, x).on).length;
    return { P, k: d.fuerza ? (dias >= 5 ? 2 : 1) : 0, dobles: 0, prim: "run", general: true, fuerzaTipo: "general" };
  }

  if (obj === "musculo") {
    fuerzaTipo = "musculo";
    k = ini ? 3 : adv ? 5 : 4;
    const cardio = cardioSel.length ? cardioSel : ["bike"];
    prim = "fuerza";
    P = [S(cardio[0], "suave", { tope: 40 }), S(cardio[1 % cardio.length], "suave", { tope: 35 })];
    if (adv) P.push(S(cardio[0], "calidad", { q: 1, hiit: true }));
  } else if (obj === "lesion") {
    fuerzaTipo = "preventiva";
    k = ini ? 2 : 3;
    P = [S("run", "readapt"), S("run", "readapt")];
    if (F.f !== "readaptacion") P.push(S("run", "readapt"));
    for (const x of ["bike", "swim"]) if (d[x]) P.push(S(x, "suave", { tope: 50 }));
    if (!d.bike && !d.swim) P.push(S("movilidad", "movilidad"));
  } else if (RUN_GOALS.includes(obj)) {
    P = [S("run", "largo"), S("run", "calidad", { q: 1 }), S("run", "suave")];
    P.push(ini ? S("run", "suave", { rectas: true }) : S("run", "calidad", { q: 2 }));
    P.push(d.bike ? S("bike", "suave") : d.swim ? S("swim", "suave") : S("run", "suave", { rectas: true }));
    P.push(S("run", "recuperacion"));
    if (adv) P.push(S("run", "suave", { rectas: true }), S(d.bike ? "bike" : "run", "recuperacion"));
  } else if (obj === "ciclismo") {
    prim = "bike";
    P = [S("bike", "largo"), S("bike", "calidad", { q: 1 }), S("bike", "suave")];
    P.push(ini ? S("bike", "suave") : S("bike", "calidad", { q: 2 }));
    P.push(d.run ? S("run", "suave") : S("bike", "recuperacion"));
    P.push(S("bike", "suave"));
    if (adv) P.push(S("bike", "recuperacion"), S("bike", "suave"));
  } else if (obj === "triatlon") {
    prim = "tri";
    P = [S("bike", "largo"), S("run", "largo"), S("swim", "tecnica"), S("run", "calidad", { q: 1 }),
      S("bike", "calidad", { q: 1 }), S("swim", "calidad", { q: 1 }), S("bike", "transicion"),
      S("run", "suave"), S("swim", "suave"), S("bike", "suave"), S("run", "recuperacion")];
  } else {
    const cardio = cardioSel.length ? cardioSel : ["run"];
    prim = cardio[0];
    const c = i => cardio[i % cardio.length];
    P = [S(c(0), "largo"), S(c(1), "calidad", { q: 1 }), S(c(2), "suave"), S(c(1), "suave"),
      S(c(0), "calidad", { q: 2 }), S(c(2), "recuperacion"), S(c(0), "suave")];
  }

  if (F.f === "carrera") {
    const act = prim === "tri" ? "run" : prim === "fuerza" ? "run" : prim;
    P = [S(act, "activacion"), S(act, "suave", { tope: 45 })];
    if (!ini) P.push(S(prim === "tri" ? "swim" : act, "recuperacion"));
    if (prim === "tri") P.push(S("bike", "suave"));
  } else if (F.f === "puesta") {
    P = P.filter(s => !(s.tipo === "calidad" && s.q === 2));
  }
  // Test de recalibración (cada 8 semanas, en la 6.ª del bloque): un 5 km a tope que actualiza sus ritmos
  if (esSemanaTest(a, F, ctx) && P.some(s => s.dep === "run" && s.tipo === "calidad")) {
    const i = P.findIndex(s => s.dep === "run" && s.tipo === "calidad");
    P[i] = S("run", "test");
  }
  if (F.descarga) P = P.map(s => s.tipo === "calidad" ? S(s.dep, "suave", { rectas: true }) : s.tipo === "transicion" ? S(s.dep, "suave") : s);

  // Carreras B y C de la semana restan sesiones de calidad
  for (const c of ctx.enSemana) {
    if (ctx.A && c.id === ctx.A.id) continue;
    const i = P.findIndex(s => s.tipo === "calidad" && s.q === 2);
    const j = i >= 0 ? i : P.findIndex(s => s.tipo === "calidad");
    if (j >= 0) P.splice(j, 1);
    // con una B, o una C en fin de semana, la carrera ocupa el sitio de la tirada larga
    if (c.prioridad === "B" || diaSemana(c.fecha) >= 5) { const l = P.findIndex(s => s.tipo === "largo"); if (l >= 0) P[l] = S(P[l].dep, "suave"); }
  }

  if (obj !== "musculo" && obj !== "lesion" && d.fuerza) {
    k = general ? (ini ? 2 : 3) : 2;
    if (F.f === "especifico" && obj === "triatlon") k = 1;
    if (F.f === "puesta") k = 1;
  }
  if (!d.fuerza && obj !== "musculo" && obj !== "lesion") k = 0;
  if (F.f === "carrera") k = 0;
  if (F.descarga) k = Math.min(k, obj === "musculo" ? 3 : 1);

  let dobles = ini ? 0 : adv ? 3 : 1;
  if (obj === "triatlon") dobles += ini ? 1 : 2;
  if (obj === "musculo") dobles = 2;
  if (F.f === "carrera" || F.f === "puesta") dobles = Math.min(dobles, prim === "tri" ? 1 : 0);

  return { P, k, dobles, prim, general, fuerzaTipo };
}

export const esSemanaTest = (a, F, ctx) => !a.cero && ["base", "construccion", "especifico"].includes(F.f) && !F.descarga && ctx.semanaNum % 8 === 6 && !ctx.enSemana.length;

/* =========================================================
   Colocación en la semana
   ========================================================= */
const DURO = ["largo", "calidad", "competicion", "transicion", "test"];
const esDura = s => DURO.includes(s.tipo);
const distD = (x, y) => { const d = Math.abs(x - y); return Math.min(d, 7 - d); };
export const dispDia = (a, d) => (a.disp && a.disp[d]) || { on: false, max: 0 };
const maxDia = (a, d) => { const x = dispDia(a, d); return x.on ? (+x.max || 600) : 0; };

function diasEntreno(a, fijos) {
  let dias = [0, 1, 2, 3, 4, 5, 6].filter(d => dispDia(a, d).on && !fijos.includes(d));
  const minDesc = a.nivel === "principiante" ? 2 : 1;
  const orden = [a.descanso, 0, 4, 2, 3, 1, 5, 6];
  for (const d of orden) {
    if (7 - dias.length - fijos.length >= minDesc) break;
    dias = dias.filter(x => x !== d);
  }
  return dias;
}

function colocar(a, T, F, ctx) {
  const semana = Array.from({ length: 7 }, () => []);
  const ini = a.nivel === "principiante";
  // Carreras de la semana en su día exacto
  const fijos = [];
  for (const c of ctx.enSemana) {
    const d = diaSemana(c.fecha);
    semana[d] = [S(depDePrueba(c.prueba), "competicion", { carrera: { id: c.id, nombre: c.nombre, prueba: c.prueba, prioridad: c.prioridad, objetivo: c.objetivo || "" } })];
    fijos.push(d);
  }
  const train = diasEntreno(a, fijos);
  const libres = new Set(train);
  const N = train.length;

  let reservaF = 0;
  if (T.k && (ini || T.general)) reservaF = Math.min(T.k, Math.max(0, N - 3));
  if (T.fuerzaTipo === "musculo") reservaF = Math.min(T.k, N);
  if (T.fuerzaTipo === "preventiva") reservaF = Math.min(T.k, Math.max(0, N - T.P.filter(s => s.tipo === "readapt").length));
  const nPropias = Math.min(T.P.length, Math.max(0, N - reservaF));
  const propias = T.P.slice(0, nPropias);
  const extra = T.P.slice(nPropias, nPropias + T.dobles);

  const rango = s => ({ largo: 1, transicion: 2, calidad: 2, test: 2, readapt: 2, iniciacion: 2, activacion: 3, tecnica: 4, recuperacion: 5, suave: 6 }[s.tipo] ?? 7);
  const duros = [...fijos];
  const orden = propias.map((s, i) => ({ s, i })).sort((x, y) => rango(x.s) - rango(y.s) || x.i - y.i);
  const carreraDia = semana.findIndex(x => x.some(y => y.tipo === "competicion" && y.carrera?.prioridad !== "C"));
  const cualquierCarrera = d => fijos.some(f => distD(f, d) <= 1);

  for (const { s } of orden) {
    let best = -1, bs = -Infinity;
    for (const d of libres) {
      let sc = 0;
      const mx = maxDia(a, d);
      const minDist = duros.length ? Math.min(...duros.map(h => distD(h, d))) : 4;
      if (s.tipo === "largo") sc = (d === 6 ? 50 : d === 5 ? 46 : d * 3) + Math.min(mx, 300) / 4 - (minDist === 0 ? 20 : 0) - (cualquierCarrera(d) ? 60 : 0);
      else if (s.tipo === "calidad" || s.tipo === "transicion" || s.tipo === "test") sc = minDist * 10 + (d === 1 || d === 3 ? 3 : 0) - (mx < 45 ? 30 : 0) - (carreraDia >= 0 && (carreraDia - d === 1 || carreraDia - d === 2) ? 25 : 0);
      else if (s.tipo === "readapt" || s.tipo === "iniciacion") sc = minDist * 10 + (semana[(d + 6) % 7].some(x => x.tipo === s.tipo) ? -15 : 0);
      else if (s.tipo === "activacion") sc = carreraDia >= 0 ? (carreraDia - d === 2 ? 30 : carreraDia - d === 1 ? 25 : -distD(carreraDia, d)) : 0;
      else if (s.tipo === "recuperacion") sc = (semana[(d + 6) % 7].some(esDura) ? 20 : 0) + minDist;
      else sc = minDist * 2 - d * 0.1 + mx / 100;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best < 0) break;
    semana[best].push({ ...s });
    libres.delete(best);
    if (esDura(s) || s.tipo === "readapt" || s.tipo === "iniciacion") duros.push(best);
  }

  const ponerExtras = () => { for (const s of extra) {
    let best = -1, bs = -Infinity;
    for (const d of train) {
      const dia = semana[d];
      if (dia.length !== 1) continue;
      const otro = dia[0];
      if (esDura(s) && esDura(otro)) continue;
      let sc = maxDia(a, d) / 20;
      if (otro.dep !== s.dep) sc += 10;
      if (!esDura(otro)) sc += 4;
      if (esDura(s) && semana[(d + 1) % 7].some(esDura)) sc -= 8;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best >= 0) semana[best].push({ ...s, doble: true });
  } };
  if (T.fuerzaTipo !== "musculo") ponerExtras();

  // Fuerza
  const diasF = [];
  for (let n = 0; n < T.k; n++) {
    let best = -1, bs = -Infinity;
    const cands = libres.size ? [...libres] : train;
    for (const d of cands) {
      const dia = semana[d];
      if (dia.some(x => x.dep === "fuerza") || dia.length >= 2 || dia.some(x => x.tipo === "competicion")) continue;
      let sc = 0;
      if (dia.some(x => x.tipo === "largo")) sc -= 70;
      const sig = semana[(d + 1) % 7];
      if (sig.some(x => x.tipo === "largo" || x.tipo === "competicion")) sc -= 25;
      if (!ini && dia.some(x => x.tipo === "calidad")) sc += 6;
      if (dia.some(x => x.tipo === "suave" || x.tipo === "recuperacion" || x.tipo === "readapt")) sc += 3;
      if (!dia.length) sc += 12;
      sc += diasF.length ? Math.min(...diasF.map(f => distD(f, d))) * 5 : 0;
      if (T.fuerzaTipo === "musculo" && diasF.length && Math.min(...diasF.map(f => distD(f, d))) === 1) sc += 2;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best < 0 || bs < -40) break;
    semana[best].push(S("fuerza", "fuerza", { bloque: n, ftipo: T.fuerzaTipo }));
    libres.delete(best);
    diasF.push(best);
  }
  if (T.fuerzaTipo === "musculo") ponerExtras();
  for (const d of libres) if (!semana[d].length && !["carrera", "puesta"].includes(F.f)) semana[d].push(S("movilidad", "movilidad"));

  // Alrededor de las carreras A/B: el día anterior suave y el siguiente regenerativo
  for (const d of fijos) {
    const c = semana[d][0].carrera;
    if (c.prioridad === "C") continue;
    const ant = (d + 6) % 7, sig = (d + 1) % 7;
    if (!fijos.includes(ant)) semana[ant] = semana[ant].filter(x => x.dep !== "fuerza").map(x => esDura(x) ? S(x.dep === "carrera" ? "run" : x.dep, "activacion") : x);
    if (!fijos.includes(sig) && d !== 6) semana[sig] = semana[sig].filter(x => x.dep !== "fuerza").map(x => esDura(x) ? S(x.dep, "recuperacion") : x);
  }
  maxSeguidos(a, semana, train, fijos);
  semana.forEach(dia => dia.sort((x, y) => (x.dep === "fuerza") - (y.dep === "fuerza")));
  return semana;
}

/** Como mucho 3 días seguidos corriendo (4 para avanzados): mueve o cambia un rodaje suave. */
function maxSeguidos(a, semana, train, fijos) {
  const lim = a.nivel === "avanzado" ? 4 : 3;
  const corre = d => semana[d].some(x => x.dep === "run");
  const racha = () => { let n = 0, ini = 0; for (let d = 0; d < 7; d++) { if (corre(d)) { n++; if (n > lim) return [ini, d]; } else { n = 0; ini = d + 1; } } return null; };
  const facil = x => x.dep === "run" && ["suave", "recuperacion"].includes(x.tipo);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const r = racha(); if (!r) return;
    const [i0, i1] = r;
    // candidato: día de la racha con un rodaje suave, mejor en el medio
    const cand = [];
    for (let d = i0; d <= i1; d++) if (!fijos.includes(d) && semana[d].some(facil)) cand.push(d);
    if (!cand.length) return;
    cand.sort((x, y) => Math.abs(x - (i0 + i1) / 2) - Math.abs(y - (i0 + i1) / 2));
    const d = cand[0], ses = semana[d].find(facil);
    semana[d] = semana[d].filter(x => x !== ses);
    // ¿hay un día disponible sin carrera donde no se forme otra racha?
    const hueco = train.find(h => h !== d && !fijos.includes(h) && !corre(h) && !semana[h].some(x => x.dep === "fuerza" && semana[h].length > 1) && (() => {
      semana[h].push(ses); const ok = !racha(); semana[h].pop(); return ok;
    })());
    if (hueco !== undefined) { semana[hueco] = semana[hueco].filter(x => x.dep !== "movilidad"); semana[hueco].push(ses); }
    else if (a.deportes?.bike) semana[d].push({ ...ses, dep: "bike" });
    if (!semana[d].length) semana[d].push(S("movilidad", "movilidad"));
  }
}

/* =========================================================
   Duraciones (respetando el máximo de cada día)
   ========================================================= */
const PESO = { largo: 2.2, calidad: 1.3, suave: 1, recuperacion: 0.65, tecnica: 0.9, transicion: 1.4, activacion: 0.45 };
const MULT = { run: 1, bike: 1.6, swim: 1 };
const MIN_D = { run: 20, bike: 30, swim: 30 };
function topes(a, s, obj, lunes) {
  const ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const f = ini ? 0.75 : 1;
  if (s.tope && s.tipo !== "largo") return s.tope;
  if (s.dep === "run") {
    let largo = { "5k": 80, "10k": 95, media: 130, maraton: 180, triatlon: 100, ciclismo: 70 }[obj] || 90;
    if (a.hist?.largoRun && lunes) { const w = clamp(Math.floor(diasEntre(lunesDe(a.hist.fecha), lunes) / 7), 0, 12); largo = Math.min(largo / f, Math.max(40, a.hist.largoRun * 1.1 + 5 * w)); }
    return { largo: largo * f, calidad: ini ? 45 : 75, suave: ini ? 40 : adv ? 80 : 65, recuperacion: ini ? 30 : 45, activacion: 30 }[s.tipo] ?? 60;
  }
  if (s.dep === "bike") return { largo: (obj === "ciclismo" ? 330 : 240) * f, calidad: 120, suave: 120, recuperacion: 60, transicion: 120, activacion: 45 }[s.tipo] ?? 90;
  return { tecnica: 70, calidad: 75, suave: 75, recuperacion: 45, activacion: 30 }[s.tipo] ?? 60;
}
/* Plan de iniciación (desde cero): [segundos de trote, segundos andando, repeticiones] por semana */
export const INICIACION = [[60, 120, 8], [90, 120, 7], [120, 180, 6], [120, 120, 6], [180, 120, 5], [240, 90, 5], [300, 90, 4], [480, 90, 3], [600, 60, 3], [900, 60, 2], [1200, 0, 1], [1500, 0, 1], [1800, 0, 1]];
const minSeg = x => x % 60 ? `${Math.floor(x / 60) ? Math.floor(x / 60) + "'" : ""}${x % 60}''` : `${x / 60}'`;
const PASOS_LESION = [[1, 2, 6], [2, 2, 6], [3, 1, 5], [5, 1, 4], [8, 1, 3], [12, 1, 2]];

function duraciones(a, semana, F, ctx, Z) {
  const ini = a.nivel === "principiante", adv = a.nivel === "avanzado";
  const vol = FASES[F.clave].vol;
  const todas = semana.flat();
  const ligera = ["puesta", "carrera"].includes(F.f) || F.descarga;
  const minFuerza = s => s.ftipo === "musculo" ? (ligera ? 40 : ini ? 45 : adv ? 70 : 60) : a.cero ? 25 : ligera ? 30 : ini ? 35 : adv ? 50 : 45;
  for (const s of todas) {
    if (s.dep === "fuerza") s.min = minFuerza(s);
    else if (s.tipo === "movilidad") s.min = 25;
    else if (s.tipo === "test") s.min = ini ? 45 : 50;
    else if (s.tipo === "iniciacion") {
      const [tr, an, rp] = INICIACION[Math.min(ctx.semanaNum, INICIACION.length) - 1];
      s.min = r5(10 + rp * (tr + an) / 60);
    } else if (s.tipo === "readapt") {
      const w = Math.min(ctx.semanaNum, 8);
      s.min = w <= 6 ? 10 + PASOS_LESION[w - 1][2] * (PASOS_LESION[w - 1][0] + PASOS_LESION[w - 1][1]) : w === 7 ? 35 : 45;
    } else if (s.tipo === "competicion") {
      const p = s.carrera.prueba;
      const est = Z.carrera && Z.carrera[p] ? Z.carrera[p].t / 60 : { "5k": 30, "10k": 60, media: 125, maraton: 250, ciclismo: 330, triatlon: 160, otra: 60 }[p] || 60;
      s.min = r5(est);
    }
  }
  const resis = todas.filter(s => s.min == null);
  const fijos = todas.filter(s => s.min != null && s.tipo !== "competicion").reduce((t, s) => t + s.min, 0);
  const disponible = [0, 1, 2, 3, 4, 5, 6].reduce((t, d) => t + (dispDia(a, d).on ? Math.min(maxDia(a, d), 240) : 0), 0);
  const hist = volumenHistorial(a, ctx.lunes);
  const aj = +(a.ajustes?.[ctx.lunes]) || 1; // ajuste decidido por el entrenador tras la valoración del deportista
  const porNivel = { principiante: 3.5, intermedio: 5, avanzado: 7 }[a.nivel] || 4;
  const porObj = { maraton: 1.25, media: 1.1, triatlon: 1.4, ciclismo: 1.3, "5k": 0.9, musculo: 1, lesion: 0.8 }[ctx.obj] || 1;
  const horas = +a.horas > 0 ? a.horas * 60 : Math.min(disponible * 0.8, porNivel * porObj * 60);
  // la fuerza nueva cuenta a medias dentro de la progresión (+10 %) sobre lo que ya hacía
  const E = hist != null ? Math.max(Math.min(hist - fijos * 0.5, disponible * 0.85) * vol, resis.length * 20) : Math.max(horas * vol - fijos, resis.length * 25);
  const asignar = (lista, total) => {
    let libres = lista.slice();
    for (let it = 0; it < 4 && libres.length; it++) {
      const W = libres.reduce((t, s) => t + PESO[s.tipo] * (MULT[s.dep] || 1), 0);
      const resto = total - lista.filter(s => !libres.includes(s)).reduce((t, s) => t + s.min, 0);
      const sig = [];
      for (const s of libres) {
        const m = resto * PESO[s.tipo] * (MULT[s.dep] || 1) / W, tope = topes(a, s, ctx.obj, ctx.lunes);
        if (m > tope) s.min = tope; else { s.min = m; sig.push(s); }
      }
      if (sig.length === libres.length) break;
      libres = sig;
    }
  };
  asignar(resis, E * aj);
  // con historial, la tirada larga no baja de lo que ya hace (y crece poco a poco)
  if (a.hist?.largoRun && !F.descarga && !["puesta", "carrera"].includes(F.f)) {
    const w = clamp(Math.floor(diasEntre(lunesDe(a.hist.fecha), ctx.lunes) / 7), 0, 12);
    for (const s of resis) if (s.dep === "run" && s.tipo === "largo") s.min = Math.max(s.min, Math.min(topes(a, s, ctx.obj, ctx.lunes), a.hist.largoRun + 5 * w));
  }

  // Límite por día
  let perdido = 0;
  semana.forEach((dia, d) => {
    const disp = dispDia(a, d);
    if (!disp.on || !(+disp.max) || dia.some(s => s.tipo === "competicion")) return;
    const max = +disp.max;
    const total = () => dia.reduce((t, s) => t + s.min, 0);
    if (total() <= max) return;
    const antes = total();
    const fu = dia.find(s => s.dep === "fuerza");
    const resD = dia.filter(s => resis.includes(s));
    const necesita = resD.reduce((t, x) => t + ({ calidad: 45, largo: 60, transicion: 50 }[x.tipo] || 25), 0);
    if (fu && resD.length && max - fu.min < necesita) fu.min = Math.max(25, Math.min(fu.min, max - necesita));
    // si no cabe, quita la segunda sesión del día
    while (dia.length > 1 && dia.reduce((t, s) => t + (resis.includes(s) ? 20 : s.min), 0) > max) {
      const i = dia.findIndex(s => s.doble) >= 0 ? dia.findIndex(s => s.doble) : dia.findIndex(s => s.dep === "movilidad");
      if (i < 0) break;
      dia.splice(i, 1);
    }
    const r = dia.filter(s => resis.includes(s));
    const tr = r.reduce((t, s) => t + s.min, 0);
    if (fu) {
      const otros = dia.filter(s => s !== fu).reduce((t, s) => t + (resis.includes(s) ? 20 : s.min), 0);
      if (max - otros < 20) dia.splice(dia.indexOf(fu), 1); else fu.min = Math.min(fu.min, max - otros);
    }
    const hueco = Math.max(r.length * 15, max - dia.filter(s => !resis.includes(s)).reduce((t, s) => t + s.min, 0));
    if (tr > hueco) for (const s of r) s.min = s.min * hueco / tr;
    perdido += Math.max(0, antes - total());
    s5(dia, max);
  });
  // Lo que no cupo, a los días con hueco (sin pasar topes)
  if (perdido > 10) {
    const orden = resis.slice().sort((x, y) => PESO[y.tipo] - PESO[x.tipo]);
    for (const s of orden) {
      if (perdido <= 5) break;
      const d = semana.findIndex(x => x.includes(s));
      if (d < 0) continue;
      const max = +dispDia(a, d).max || 9999;
      const usado = semana[d].reduce((t, x) => t + x.min, 0);
      const extra = Math.min(perdido, topes(a, s, ctx.obj, ctx.lunes) - s.min, max - usado);
      if (extra > 0) { s.min += extra; perdido -= extra; }
    }
  }
  for (const s of resis) s.min = Math.max(MIN_D[s.dep] && !semana.some((dia, d) => dia.includes(s) && +dispDia(a, d).max && +dispDia(a, d).max < MIN_D[s.dep]) ? MIN_D[s.dep] : 15, s.min);
  semana.forEach((dia, d) => s5(dia, +dispDia(a, d).max || 0));
}
function s5(dia, max) {
  for (const s of dia) s.min = Math.max(5, Math.round(s.min / 5) * 5);
  if (!max) return;
  let t = dia.reduce((x, s) => x + s.min, 0);
  for (const s of dia) { if (t <= max) break; if (["competicion", "iniciacion", "readapt"].includes(s.tipo)) continue; const q = Math.min(t - max, s.min - 10); if (q > 0) { s.min -= Math.ceil(q / 5) * 5; t = dia.reduce((x, y) => x + y.min, 0); } }
}

/* =========================================================
   Estructura numérica de las sesiones de carrera
   Cada tramo: { min, k } continuo · { n, min|m, k, rec } repeticiones · k = "andar" o "trote"
   Devuelve el texto corto en versión calle (min/km) y cinta (km/h) y las barras [min, nivel 0-5]
   ========================================================= */
const kmhTxt = r => (3600 / ((r[0] + r[1]) / 2)).toFixed(1).replace(".", ",").replace(",0", "");
function ritmoTxt(Z, k, modo) {
  if (k === "andar") return "andando";
  if (k === "trote") return "trote muy suave";
  if (k === "cuesta") return "subiendo fuerte";
  const r = Z.tipos?.[k];
  if (!r) return ZONA_RITMO[k] ? `Z${ZONA_RITMO[k]}` : "";
  return modo === "cinta" ? `${kmhTxt(r)} km/h` : `${fmtRitmo(r[0])}-${fmtRitmo(r[1])}`;
}
const durTxt = m => m < 1 ? `${Math.round(m * 60)}''` : Number.isInteger(m) ? `${m}'` : minSeg(Math.round(m * 60));
function minTramo(Z, t) {
  if (t.min) return t.min;
  const r = Z.tipos?.[t.k] || [360, 360];
  return t.m / 1000 * (r[0] + r[1]) / 2 / 60;
}
const NIVEL = k => k === "andar" ? 0 : k === "trote" ? 1 : k === "cuesta" ? 5 : ZONA_RITMO[k] || 2;
function textoTramos(tr, Z, modo) {
  return tr.map(t => {
    const r = ritmoTxt(Z, t.k, modo);
    const a = r === "andando" || r === "subiendo fuerte" || r === "trote muy suave" ? ` ${r}` : r ? ` a ${r}` : "";
    const una = t.m ? `${t.m >= 1000 && t.m % 1000 === 0 ? t.m / 1000 + " km" : t.m + " m"}${a}` : `${durTxt(t.min)}${a}`;
    if (!t.n) return una;
    const rec = t.rec ? ` (rec. ${durTxt(t.rec)}${t.recA ? " andando" : ""})` : "";
    return `${t.n} × ${t.par ? `(${una} + ${durTxt(t.par.min)} ${ritmoTxt(Z, t.par.k, modo)})` : una}${rec}`;
  }).join(" + ");
}
function barras(tr, Z) {
  const out = [];
  for (const t of tr) {
    const m = minTramo(Z, t), nv = NIVEL(t.k);
    if (!t.n) { out.push([+m.toFixed(2), nv]); continue; }
    for (let i = 0; i < t.n; i++) {
      out.push([+m.toFixed(2), nv]);
      if (t.par) out.push([t.par.min, NIVEL(t.par.k)]);
      if (t.rec && i < t.n - 1) out.push([t.rec, t.recA ? 0 : 1]);
    }
  }
  return out;
}

/* =========================================================
   Contenido de las sesiones
   ========================================================= */
function describir(s, a, F, Z, ctx) {
  const ini = a.nivel === "principiante";
  const fk = F.descarga ? "descarga" : F.f;
  const obj = ctx.obj, general = GENERAL.includes(obj) || obj === "musculo" || obj === "lesion";
  const z = (n, dep = s.dep) => zt(Z, dep, n);
  const out = { t: "", z: "", p: [], n: "" };
  const wu = ini ? 10 : 15, cd = 10;
  const M = Math.max(10, s.min - wu - cd);
  const tipo = s.tipo;
  const reps = (w, lo, hi) => clamp(Math.floor(M / w), lo, hi);
  let tr = null; // tramos numéricos (solo carrera a pie)
  const kObj = k => Z.tipos?.[k] ? k : "umbral";

  if (tipo === "competicion") {
    const c = s.carrera, p = c.prueba;
    out.t = `🏁 ${c.nombre || PRUEBAS[p]}`;
    out.z = `${PRUEBAS[p]} · prioridad ${c.prioridad} (${PRIORIDAD[c.prioridad]})`;
    const est = Z.carrera && Z.carrera[p] ? `Tiempo estimado por sus marcas: ${fmtHoras(Z.carrera[p].t)}${ritmoCarrera(Z, p)}.` : "";
    out.p = c.prioridad === "C"
      ? ["Se usa como entreno de calidad: ritmo fuerte pero controlado, sin vaciarse", "Calentamiento 15' + 3 progresivos", est].filter(Boolean)
      : ["Desayuno 3 h antes, rico en hidratos, conocido y bajo en fibra", "Calentamiento 10-15' suave + 3 progresivos",
        p === "ciclismo" ? "Primeros 30' controlados en Z2. Come y bebe desde el inicio (60-90 g de hidratos/hora)"
          : p === "triatlon" ? "Natación tranquila al inicio; en bici come y bebe; los primeros 2 km de carrera algo por debajo de ritmo"
            : "Salida controlada: primeros km algo por debajo del ritmo objetivo",
        c.objetivo ? `Objetivo marcado: ${c.objetivo}` : est].filter(Boolean);
    out.n = c.prioridad === "C" ? "Carrera de preparación: no hace falta descansar antes." : "Disfruta: el trabajo ya está hecho.";
    return out;
  }

  if (s.dep === "run") {
    if (tipo === "test") {
      out.t = "🎯 Test de 5 km";
      out.z = "A tope, pero con ritmo constante";
      out.p = [`Calentamiento ${wu}' suave + movilidad + 3 progresivos de 20''`, "5 km a tope, lo más constante posible (sal un poco por debajo de tu ritmo y acelera al final)", "Vuelta a la calma 10' muy suave"];
      out.n = "Registra el tiempo exacto (o sube el archivo del reloj): con él se recalculan todos tus ritmos de entreno.";
      tr = [{ min: wu, k: "rodaje" }, { m: 5000, k: "5k" }, { min: 10, k: "recuperacion" }];
    } else if (tipo === "iniciacion") {
      const w = Math.min(ctx.semanaNum, INICIACION.length), [tro, an, rp] = INICIACION[w - 1];
      const ritmo = Z.ritmos ? `${fmtRitmo(Z.ritmos[1][0])}-${fmtRitmo(Z.ritmos[0][1])} /km` : "";
      out.t = rp > 1 ? `Correr y andar · ${rp} × (${minSeg(tro)} + ${minSeg(an)})` : `Correr ${minSeg(tro)} seguidos`;
      out.z = `Trote muy suave${ritmo ? " a " + ritmo : ""} (${Z.fc[0][0]}-${Z.fc[1][1]} ppm)`;
      out.p = ["5' andando a buen paso para calentar",
        rp > 1 ? `${rp} × (${minSeg(tro)} trotando muy suave + ${minSeg(an)} andando)` : `${minSeg(tro)} trotando muy suave, sin parar`,
        "5' andando para terminar + estiramientos suaves de gemelo y cuádriceps"];
      tr = [{ min: 5, k: "andar" }, rp > 1 ? { n: rp, min: tro / 60, k: "trote", par: an ? { min: an / 60, k: "andar" } : null } : { min: tro / 60, k: "trote" }, { min: 5, k: "andar" }];
      out.n = `Semana ${w} de ${INICIACION.length} de la iniciación. Trota tan suave que puedas hablar sin ahogarte. Si una semana se te hace dura, repítela antes de pasar a la siguiente.`;
    } else if (tipo === "readapt") {
      const w = Math.min(ctx.semanaNum, 8);
      out.t = "Vuelta a correr"; out.z = z(2);
      const blq = w <= 6 ? `${PASOS_LESION[w - 1][2]} × (${PASOS_LESION[w - 1][0]}' corriendo en Z2 + ${PASOS_LESION[w - 1][1]}' andando)` : w === 7 ? "25' de carrera continua en Z2" : "35' de carrera continua en Z2";
      out.p = ["5' andando rápido + movilidad de tobillo y cadera", blq, "5' andando + estiramientos suaves"];
      tr = [{ min: 5, k: "andar" }, w <= 6 ? { n: PASOS_LESION[w - 1][2], min: PASOS_LESION[w - 1][0], k: "rodaje", par: { min: PASOS_LESION[w - 1][1], k: "andar" } } : { min: w === 7 ? 25 : 35, k: "rodaje" }, { min: 5, k: "andar" }];
      out.n = "Regla del dolor: hasta 3/10 durante, vale. Si al día siguiente duele más que antes, repite la semana anterior.";
      if (a.lesionZona) out.n += ` Zona a vigilar: ${a.lesionZona}.`;
    } else if (tipo === "largo") {
      out.t = "Tirada larga"; out.z = z(2);
      let main = `Carrera continua ${fmtMin(s.min)} en ${z(2)}`;
      tr = [{ min: s.min, k: "tirada" }];
      if (fk === "construccion") { main = `${fmtMin(s.min - 15)} en Z2 y los últimos 15' en ${z(3)}`; tr = [{ min: s.min - 15, k: "tirada" }, { min: 15, k: obj === "media" || obj === "10k" || obj === "5k" ? "media" : "maraton" }]; }
      if (fk === "especifico") {
        if (obj === "maraton") { main = `${fmtMin(s.min - 50)} en Z2 + 2 × 20' a ritmo maratón${ritmoCarrera(Z, "maraton")} con 5' suaves entre bloques`; tr = [{ min: s.min - 45, k: "tirada" }, { n: 2, min: 20, k: "maraton", rec: 5 }]; }
        else if (obj === "media") { main = `${fmtMin(s.min - 25)} en Z2 y los últimos 25' a ritmo de media maratón${ritmoCarrera(Z, "media")}`; tr = [{ min: s.min - 25, k: "tirada" }, { min: 25, k: "media" }]; }
        else if (RUN_GOALS.includes(obj)) { main = `${fmtMin(s.min - 5)} en Z2 + 6 × 20'' rectas rápidas al final`; tr = [{ min: s.min - 5, k: "tirada" }, { n: 6, min: 1 / 3, k: "5k", rec: 0.5 }]; }
      }
      out.p = [main, "5-10' de estiramientos suaves al terminar"];
      if (s.min >= 75) out.n = "Lleva agua. A partir de 75' toma 30-60 g de hidratos por hora (gel, dátiles, bebida isotónica).";
    } else if (tipo === "calidad") {
      out.t = "Series";
      let main;
      let q; // bloque principal en tramos
      if (s.hiit) { const n = reps(2, 6, 10); main = `HIIT: ${n} × (30'' fuerte en ${z(5)} / 90'' suave)`; out.t = "HIIT corto"; q = { n, min: 0.5, k: "series", rec: 1.5 }; }
      else if (general || fk === "base") {
        if (s.q === 1 && ini) { const n = reps(3, 4, 8); main = `Fartlek suave: ${n} × (1' alegre en ${z(3)} / 2' trote suave)`; out.t = "Fartlek suave"; q = { n, min: 1, k: "maraton", rec: 2 }; }
        else if (s.q === 1) { const n = reps(2, 5, 12); main = `Fartlek: ${n} × (1' en ${z(4)} / 1' trote en Z1)`; out.t = "Fartlek"; q = { n, min: 1, k: "10k", rec: 1 }; }
        else { const n = reps(2.5, 5, 10); main = `Cuestas: ${n} × 30-45'' subiendo fuerte (${z(5)}), bajada trotando`; out.t = "Cuestas"; q = { n, min: 0.67, k: "cuesta", rec: 1.5 }; }
      } else if (fk === "construccion") {
        if (s.q === 1) { const b = M >= 35 ? 10 : 8, n = reps(b + 2, 2, a.nivel === "avanzado" ? 4 : 3); main = `Umbral: ${n} × ${b}' en ${z(4)}, recuperando 2' al trote`; out.t = "Umbral"; q = { n, min: b, k: "umbral", rec: 2 }; }
        else { const n = reps(5, 4, 7); main = `VO2máx: ${n} × 3' en ${z(5)}, recuperando 2' al trote`; out.t = "Series VO2máx"; q = { n, min: 3, k: "series", rec: 2 }; }
      } else if (fk === "especifico") {
        if (s.q === 1) {
          out.t = "Ritmo de competición";
          const E = {
            maraton: [reps(18, 2, 3), n => `${n} × 15' a ritmo maratón${ritmoCarrera(Z, "maraton")}, 3' suaves entre bloques`, { min: 15, k: "maraton", rec: 3 }],
            media: [reps(14, 2, 4), n => `${n} × 12' a ritmo media maratón${ritmoCarrera(Z, "media")}, 2' trote`, { min: 12, k: "media", rec: 2 }],
            "10k": [reps(6.5, 4, 7), n => `${n} × 1000 m a ritmo 10 km${ritmoCarrera(Z, "10k")}, 90'' trote`, { m: 1000, k: "10k", rec: 1.5 }],
            "5k": [reps(5.5, 4, 8), n => `${n} × 800 m a ritmo 5 km${ritmoCarrera(Z, "5k")}, 2' trote`, { m: 800, k: "5k", rec: 2 }],
            triatlon: [reps(8, 3, 6), n => `${n} × 5' a ritmo de carrera de triatlón (${z(4)}), 2' trote`, { min: 5, k: "umbral", rec: 2 }]
          }[obj] || [reps(12, 2, 4), n => `${n} × 10' en ${z(4)}, 2' trote`, { min: 10, k: "umbral", rec: 2 }];
          main = E[1](E[0]); q = { n: E[0], ...E[2] };
        } else { const n = reps(12, 2, 4); main = `Umbral: ${n} × 10' en ${z(4)}, 2' trote`; out.t = "Umbral"; q = { n, min: 10, k: "umbral", rec: 2 }; }
      } else { main = `2 × 8' a ritmo de carrera${ritmoCarrera(Z, obj)}, 3' trote + 4 × 20'' progresivos`; out.t = "Toque de ritmo"; q = { n: 2, min: 8, k: kObj(obj), rec: 3 }; }
      tr = [{ min: wu, k: "rodaje" }, q, { min: cd, k: "recuperacion" }];
      out.z = main.includes("Z5") ? "Z4-Z5" : "Z3-Z4";
      out.p = [`Calentamiento ${wu}' en Z1-Z2 + movilidad dinámica + 3 progresivos`, main, `Vuelta a la calma ${cd}' en Z1`];
    } else if (tipo === "suave") {
      out.t = "Rodaje suave"; out.z = z(2);
      out.p = [`Rodaje continuo ${fmtMin(s.min)} en ${z(2)}`];
      tr = [{ min: s.min, k: "rodaje" }];
      if (s.rectas) out.p.push("Al final: 4-6 rectas de 20'' rápidas y relajadas (técnica)");
      if (ini) out.n = "Ritmo de conversación: si te cuesta hablar, ve más despacio o camina 1' y sigue.";
    } else if (tipo === "recuperacion") {
      out.t = "Rodaje regenerativo"; out.z = z(1);
      out.p = [`Trote muy suave ${fmtMin(s.min)} en ${z(1)}`, "10' de movilidad de cadera y tobillo"];
      tr = [{ min: s.min, k: "recuperacion" }];
    } else if (tipo === "activacion") {
      out.t = "Activación precompetición"; out.z = "Z2 + toques";
      out.p = [`${fmtMin(Math.max(15, s.min - 5))} suave en Z2`, `4 × 20'' a ritmo de carrera${ritmoCarrera(Z, obj)}, 1' suave entre ellos`];
      out.n = "Revisa material y dorsal. Cena rica en hidratos.";
      tr = [{ min: Math.max(15, s.min - 5), k: "rodaje" }, { n: 4, min: 1 / 3, k: kObj(obj), rec: 1 }];
    }
  } else if (s.dep === "bike") {
    if (tipo === "largo") {
      out.t = "Salida larga"; out.z = z(2);
      let main = `Rodar ${fmtMin(s.min)} en ${z(2)}, cadencia 85-95 rpm`;
      if (fk === "construccion") main += `, con 3 subidas de 8-10' en ${z(3)}`;
      if (fk === "especifico") main += obj === "ciclismo" ? ". Simula el perfil de la marcha: subidas en Z3 y bajadas recuperando" : `, con 2 × 20' en ${z(3)}`;
      out.p = [main];
      out.n = s.min >= 120 ? "Practica la nutrición de carrera: 60-90 g de hidratos/hora y 500-750 ml de bebida/hora." : "Bebe cada 15-20' y lleva algo de comer.";
    } else if (tipo === "calidad") {
      let main;
      if (s.hiit || general) {
        main = s.q === 1 ? `HIIT: ${reps(3, 6, 12)} × (1' fuerte en ${z(5)} / 2' suave)` : `Tempo: 2 × ${clamp(Math.floor((M - 5) / 2), 8, 25)}' en ${z(3)}, 5' suave entre bloques`;
        out.t = s.q === 1 ? "HIIT en bici" : "Tempo";
      } else if (fk === "base") {
        main = s.q === 1 ? `Sweet spot: ${reps(15, 2, 4)} × 10' al 88-93 % FTP (Z3-Z4), 5' suave` : `Cadencia: ${reps(8, 3, 6)} × 5' a 100-110 rpm en ${z(3)}, 3' suave`;
        out.t = s.q === 1 ? "Sweet spot" : "Técnica de cadencia";
      } else if (fk === "construccion") {
        main = s.q === 1 ? `Umbral: ${reps(12, 3, 5)} × 8' en ${z(4)}, 4' suave` : `VO2máx: ${reps(8, 4, 6)} × 4' en ${z(5)}, 4' suave`;
        out.t = s.q === 1 ? "Umbral" : "VO2máx";
      } else if (fk === "especifico") {
        main = s.q === 1 ? `Tempo largo: ${reps(25, 2, 3)} × 20' en ${z(3)} simulando la prueba` : `Fuerza en subida: ${reps(10, 3, 6)} × 6' en ${z(4)} a 60-70 rpm, 4' suave`;
        out.t = s.q === 1 ? "Tempo específico" : "Fuerza en subida";
      } else { main = `3 × 5' en ${z(4)}, 5' suave entre ellos`; out.t = "Toque de intensidad"; }
      out.z = main.includes("Z5") ? "Z4-Z5" : "Z3-Z4";
      out.p = [`Calentamiento ${wu}' progresivo Z1→Z2 + 3 × 1' cadencia alta`, main, `Vuelta a la calma ${cd}' en Z1`];
    } else if (tipo === "suave") {
      out.t = "Rodaje en bici"; out.z = z(2);
      out.p = [`Rodar ${fmtMin(s.min)} en ${z(2)} con cadencia fluida (85-95 rpm)`];
      if (obj === "lesion") out.n = "Buen sustituto de la carrera mientras vuelves: sin impacto.";
    } else if (tipo === "recuperacion") {
      out.t = "Bici regenerativa"; out.z = z(1);
      out.p = [`${fmtMin(s.min)} muy suave en ${z(1)}, piernas sueltas, desarrollos ligeros`];
    } else if (tipo === "transicion") {
      const r = clamp(Math.round(s.min * 0.25 / 5) * 5, 10, 25), b = s.min - r;
      out.t = "Transición (bici + carrera)"; out.z = "Z2-Z3";
      out.p = [`Bici ${fmtMin(b)} en ${z(2)}, últimos 15' en ${z(3)}`, "Transición rápida: practica dejar la bici y cambiar zapatillas", `Carrera inmediata ${r}' a ritmo de competición (${zt(Z, "run", 3)})`];
    } else if (tipo === "activacion") {
      out.t = "Activación en bici"; out.z = "Z2 + toques";
      out.p = [`${fmtMin(Math.max(20, s.min - 5))} en Z2`, "3 × 1' a ritmo de prueba con 2' suaves"];
    }
  } else if (s.dep === "swim") {
    const p100 = Z.nado ? (parseTiempo(a.css) + 25) : ini ? 150 : a.nivel === "avanzado" ? 105 : 125;
    const total = Math.round((s.min * 60 / p100) * 100 / 50) * 50;
    const prin = Math.max(200, total - 500);
    if (tipo === "tecnica") {
      out.t = `Técnica de natación · ~${total} m`; out.z = "Z2-Z3";
      out.p = ["Calentamiento 300 m variado", "Técnica 8 × 25 m (crol a un brazo, cremallera, patada con tabla) desc. 15''", `Principal ${Math.max(2, Math.round(prin / 100))} × 100 m en ${z(2)}-Z3, desc. 20''`, "Vuelta a la calma 100 m espalda"];
    } else if (tipo === "calidad") {
      const r = Math.max(3, Math.round(prin / 200));
      out.t = `Series en piscina · ~${total} m`; out.z = "Z3-Z4";
      out.p = ["Calentamiento 300 m + 4 × 50 m progresivos", fk === "base" ? `${r} × 200 m en ${z(3)}, desc. 30''` : `${r * 2} × 100 m en ${z(4)}, desc. 20''`, "Vuelta a la calma 100-200 m suave"];
    } else {
      out.t = `Nado continuo · ~${total} m`; out.z = tipo === "recuperacion" ? z(1) : z(2);
      out.p = [`${total} m continuos en ${out.z}, respirando cada 3 brazadas`, "Cada 400 m, 25 m de técnica"];
    }
  } else if (s.dep === "fuerza") {
    const f = fuerza(s, a, F, ctx);
    out.t = f.titulo; out.z = f.esquema; out.ej = f.ejercicios; out.n = f.nota;
    out.p = ["Calentamiento 5-8': movilidad articular + activación (puente de glúteo, plancha, 1 serie ligera del primer ejercicio)"];
  } else if (s.dep === "movilidad") {
    out.t = "Movilidad y core"; out.z = "Suave";
    out.p = ["Movilidad de cadera, tobillo y columna torácica (10')", "Core: 3 × (plancha 30'' + dead bug 10 + plancha lateral 20''/lado)", "Estiramientos o yoga suave (10')"];
    out.n = "Día opcional: si hay cansancio, mejor descanso total.";
  }
  if (tr && s.dep === "run") {
    tr = tr.filter(t => t && (t.n || t.min > 0 || t.m));
    out.c = Z.tipos ? { calle: textoTramos(tr, Z, "calle"), cinta: textoTramos(tr, Z, "cinta") } : null;
    out.est = barras(tr, Z);
    // tramos con su ritmo y pulso ya resueltos, para el «paso a paso» del deportista
    const res = t => t && ({ ...t, r: Z.tipos?.[t.k] || null, f: ZONA_RITMO[t.k] ? Z.fc[ZONA_RITMO[t.k] - 1] : t.k === "cuesta" ? Z.fc[4] : t.k === "trote" ? Z.fc[0] : null });
    out.tr = tr.map(t => ({ ...res(t), par: t.par ? res(t.par) : undefined, rr: t.rec ? (Z.tipos?.recuperacion || null) : undefined }));
  }
  if (s.doble) out.n = (out.n ? out.n + " " : "") + "Segunda sesión del día: sepárala 4-6 h de la primera si puedes.";
  if (s.dep === "run" && Z.ritmoEstimado && tipo !== "competicion") out.n = (out.n ? out.n + " " : "") + "Ritmos estimados: guíate sobre todo por las sensaciones y el pulso.";
  return out;
}

/* =========================================================
   Fuerza
   ========================================================= */
const EJ = {
  A: [["Sentadilla con peso corporal", "Sentadilla goblet con mancuerna", "Sentadilla trasera con barra"], ["Zancada estática", "Zancada búlgara con mancuernas", "Zancada búlgara con carga alta"], ["Puente de glúteo", "Hip thrust con peso", "Hip thrust con barra"], ["Remo con goma elástica", "Remo con mancuerna a una mano", "Remo con barra"], ["Plancha frontal 20-30''", "Plancha frontal 40''", "Plancha con toques de hombro 45''", "core"], ["Dead bug (8 por lado)", "Dead bug con peso (10 por lado)", "Dead bug con goma (12 por lado)", "core"]],
  B: [["Peso muerto rumano con mancuernas ligeras", "Peso muerto rumano con mancuernas", "Peso muerto rumano con barra"], ["Subida al banco (step-up)", "Step-up con mancuernas", "Step-up con barra o chaleco"], ["Flexiones con rodillas apoyadas", "Flexiones", "Flexiones con lastre o fondos"], ["Curl femoral con fitball", "Curl nórdico asistido con goma", "Curl nórdico"], ["Plancha lateral 20''/lado", "Plancha lateral 30''/lado con elevación", "Plancha lateral 40''/lado con remo", "core"], ["Bird dog (8 por lado)", "Pallof press con goma (10 por lado)", "Pallof press con polea (12 por lado)", "core"]],
  C: [["Sentadilla + press (thruster) ligero", "Thruster con mancuernas", "Thruster con barra"], ["Peso muerto con kettlebell", "Swing con kettlebell", "Swing pesado con kettlebell"], ["Zancadas caminando", "Zancadas caminando con mancuernas", "Zancadas con barra"], ["Remo invertido en mesa/TRX", "Remo en TRX", "Dominadas"], ["Mountain climbers 20''", "Mountain climbers 30''", "Burpees 30''", "core"]],
  TORSO_A: [["Press de banca con mancuernas", "Press de banca con barra", "Press de banca con barra"], ["Remo con mancuerna a una mano", "Remo con barra", "Remo con barra pesado"], ["Press militar con mancuernas sentado", "Press militar con mancuernas", "Press militar con barra de pie"], ["Jalón al pecho", "Dominadas asistidas o jalón", "Dominadas lastradas"], ["Elevaciones laterales", "Elevaciones laterales", "Elevaciones laterales en polea"], ["Curl de bíceps con mancuernas", "Curl de bíceps con barra", "Curl inclinado con mancuernas"], ["Extensión de tríceps en polea", "Fondos en banco", "Fondos en paralelas lastrados"]],
  PIERNA_A: [["Sentadilla goblet", "Sentadilla trasera con barra", "Sentadilla trasera con barra"], ["Peso muerto rumano con mancuernas", "Peso muerto rumano con barra", "Peso muerto rumano con barra"], ["Prensa de piernas", "Prensa de piernas", "Prensa de piernas a una pierna"], ["Curl femoral en máquina", "Curl femoral en máquina", "Curl nórdico"], ["Elevación de gemelos de pie", "Gemelos en máquina", "Gemelos con pausa en máquina"], ["Plancha frontal 30''", "Rueda abdominal", "Rueda abdominal de pie", "core"]],
  TORSO_B: [["Press inclinado con mancuernas", "Press inclinado con mancuernas", "Press inclinado con barra"], ["Remo en polea baja", "Remo en polea baja", "Remo Pendlay"], ["Flexiones", "Fondos en paralelas", "Fondos lastrados"], ["Face pull con goma o polea", "Face pull en polea", "Face pull en polea"], ["Pájaros con mancuernas", "Pájaros en máquina", "Pájaros en polea"], ["Curl martillo", "Curl martillo", "Curl en banco Scott"], ["Press francés con mancuernas", "Press francés con barra Z", "Press francés con barra Z"]],
  PIERNA_B: [["Zancada búlgara con mancuernas", "Zancada búlgara con mancuernas", "Zancada búlgara con barra"], ["Hip thrust con peso", "Hip thrust con barra", "Hip thrust con barra pesado"], ["Extensión de cuádriceps en máquina", "Extensión de cuádriceps", "Extensión de cuádriceps con pausa"], ["Peso muerto con kettlebell", "Peso muerto convencional", "Peso muerto convencional"], ["Abducción de cadera en máquina", "Abducción de cadera", "Abducción con goma y pausa"], ["Pallof press (10 por lado)", "Pallof press (12 por lado)", "Elevaciones de piernas colgado", "core"]],
  PREV: [["Isometría de cuádriceps: sentadilla en pared 30''", "Sentadilla en pared 45''", "Sentadilla en pared con peso 45''", "core"], ["Gemelos excéntricos en escalón (bajar en 3'')", "Gemelos excéntricos a una pierna", "Gemelos excéntricos con peso"], ["Puente de glúteo a una pierna", "Hip thrust a una pierna", "Hip thrust a una pierna con peso"], ["Equilibrio a una pierna 30''", "Equilibrio a una pierna ojos cerrados 30''", "Equilibrio en superficie inestable 30''", "core"], ["Abducción de cadera tumbado de lado", "Paseo lateral con goma (monster walk)", "Paseo lateral con goma fuerte"], ["Peso muerto rumano a una pierna sin peso", "Peso muerto rumano a una pierna con mancuerna", "Peso muerto a una pierna con kettlebell"], ["Plancha lateral 20''/lado", "Plancha lateral 30''/lado", "Copenhagen plank 20''/lado", "core"]]
};
const EXTRA_DEP = {
  run: [["Elevación de gemelos de pie", "Elevación de gemelos a una pierna", "Gemelos a una pierna con peso"]],
  bike: [["Sentadilla isométrica en pared 30''", "Sentadilla isométrica en pared 45''", "Sentadilla isométrica con peso 45''", "core"]],
  swim: [["Rotación externa de hombro con goma", "Rotación externa con goma (más tensión)", "Face pull con polea"], ["Jalón al pecho con goma", "Dominadas asistidas", "Dominadas lastradas"]]
};

function fuerza(s, a, F, ctx) {
  const n = s.bloque || 0;
  const nivel = { principiante: 0, intermedio: 1, avanzado: 2 }[a.nivel] ?? 1;
  const fk = F.descarga ? "descarga" : F.f;
  const obj = ctx.obj;
  const general = GENERAL.includes(obj);
  let bloque, esquema, nota = "", titulo;

  if (s.ftipo === "musculo") {
    const seq = nivel === 0 ? ["A", "B", "C"] : ["TORSO_A", "PIERNA_A", "TORSO_B", "PIERNA_B", "C"];
    bloque = seq[n % seq.length];
    esquema = fk === "descarga" ? "2-3 × 10, dejando 3 repeticiones en reserva"
      : fk === "intensificacion" ? (nivel ? "4 × 6-8 · desc. 2-3'" : "3 × 8-10 · desc. 2'")
        : (nivel ? "4 × 8-12 · desc. 90''" : "3 × 10-12 · desc. 90''");
    nota = fk === "descarga" ? "Semana de descarga: menos series, misma técnica." : "Cerca del fallo (1-2 repeticiones en reserva). Cuando completes todas las series con el máximo de repeticiones, sube el peso.";
    titulo = { A: "Cuerpo completo A", B: "Cuerpo completo B", C: "Cuerpo completo C", TORSO_A: "Torso A · empuje y tirón", PIERNA_A: "Pierna A · cuádriceps y femoral", TORSO_B: "Torso B · hombro y brazos", PIERNA_B: "Pierna B · glúteo y unilateral" }[bloque];
  } else if (s.ftipo === "preventiva") {
    bloque = "PREV";
    esquema = nivel ? "3 × 12 lentas · desc. 60''" : "2-3 × 10-12 lentas · desc. 60''";
    nota = "Movimientos lentos y controlados. Sin dolor: si molesta, reduce rango o carga.";
    titulo = "Fuerza preventiva · tendones y estabilidad";
  } else {
    bloque = ["A", "B", "C"][n % 3];
    if (fk === "descarga") esquema = "2 × 10 con técnica perfecta · desc. 60''";
    else if (fk === "puesta" || fk === "carrera") esquema = "2 × 8 ligeras, sin llegar al fallo";
    else if (fk === "especifico" && !general) esquema = nivel ? "3 × 4-6 explosivas · desc. 2'" : "3 × 8-10 · desc. 90''";
    else if (fk === "construccion") esquema = ["3 × 10-12 · desc. 90''", "4 × 6-8 · desc. 2'", "4 × 5-6 pesadas · desc. 2-3'"][nivel];
    else esquema = nivel ? "3 × 12-15 · desc. 60''" : "2-3 × 12 · desc. 60''";
    if (obj === "bajar_peso" && fk !== "descarga") { esquema += " · en circuito"; nota = "Hazlo en circuito (un ejercicio tras otro) para subir el gasto calórico."; }
    titulo = { A: "Fuerza A · tren inferior y core", B: "Fuerza B · cadena posterior y tren superior", C: "Fuerza C · cuerpo completo" }[bloque];
  }

  let lista = EJ[bloque].slice();
  if (!s.ftipo || s.ftipo === "general") {
    const deps = ["run", "bike", "swim"].filter(k => a.deportes?.[k]);
    for (const d of deps) for (const e of (EXTRA_DEP[d] || [])) if (lista.length < 8) lista.splice(lista.length - 1, 0, e);
  }
  const series = esquema.split(" · ")[0];
  const ejercicios = lista.map(e => ({ n: e[nivel], s: e[3] === "core" ? (nivel ? "3 series" : "2 series") : series }));
  if ((!s.ftipo || s.ftipo === "general") && fk === "especifico" && !general && nivel && a.deportes?.run) {
    ejercicios.splice(0, 0, { n: "Pliometría: saltos al cajón o multisaltos", s: "3 × 5" }, { n: "Comba", s: "3 × 30''" });
    nota = "Pliometría al principio, con las piernas frescas.";
  }
  if (!nota) nota = nivel === 0 ? "Prioriza la técnica. Termina cada serie con 2-3 repeticiones en reserva." : "Deja 1-2 repeticiones en reserva. Si sale muy fácil, sube el peso la próxima semana.";
  return { titulo, esquema, ejercicios, nota };
}

/* =========================================================
   Nutrición
   ========================================================= */
const MET = {
  run: { largo: 9.5, calidad: 11, suave: 9, recuperacion: 7, activacion: 8, competicion: 11.5, readapt: 6, iniciacion: 5.5, test: 11.5 },
  bike: { largo: 7.5, calidad: 9.5, suave: 7, recuperacion: 5, transicion: 8.5, activacion: 6.5, competicion: 9 },
  swim: { tecnica: 7, calidad: 9, suave: 7.5, recuperacion: 6, activacion: 6, competicion: 9 },
  fuerza: { fuerza: 5 }, movilidad: { movilidad: 2.5 }, carrera: { competicion: 10 }
};
export function cargaDia(ses, objetivo) {
  const reales = ses.filter(s => s.dep !== "movilidad");
  if (!reales.length) return "descanso";
  const tot = reales.reduce((t, s) => t + (+s.min || 0), 0);
  if (reales.some(s => s.tipo === "competicion" && s.carrera?.prioridad !== "C") || reales.some(s => s.tipo === "largo" && s.min >= 90) || tot >= 150) return "alta";
  if (reales.some(s => ["calidad", "transicion", "largo", "competicion", "test"].includes(s.tipo)) || tot >= 75) return "media";
  if (objetivo === "musculo" && reales.some(s => s.dep === "fuerza" && s.min >= 50)) return "media";
  return "baja";
}
export const CARGA_TXT = { descanso: "Descanso", baja: "Carga baja", media: "Carga media", alta: "Carga alta" };

/* ---------- Menú orientativo: primero y segundo, sin gramos ---------- */
// d: dietas en que vale (o = omnívora, v = vegetariana, x = vegana); h: rico en hidratos
const PRIMEROS = [
  { n: "Ensalada mixta", d: "ovx" }, { n: "Verduras salteadas", d: "ovx" }, { n: "Crema de calabaza", d: "ovx" },
  { n: "Judías verdes con patata", d: "ovx", h: 1 }, { n: "Menestra de verduras", d: "ovx" }, { n: "Gazpacho o salmorejo", d: "ovx" },
  { n: "Lentejas estofadas con verduras", d: "ovx", h: 1 }, { n: "Garbanzos con espinacas", d: "ovx", h: 1 }, { n: "Alubias con verduras", d: "ovx", h: 1 },
  { n: "Pasta con tomate y verduras", d: "ovx", h: 1, g: 1 }, { n: "Arroz con verduras", d: "ovx", h: 1 }, { n: "Paella de verduras", d: "ovx", h: 1 },
  { n: "Sopa de fideos", d: "ovx", h: 1, g: 1 }, { n: "Ensalada de pasta", d: "ovx", h: 1, g: 1 }, { n: "Crema de verduras", d: "ovx" },
  { n: "Pisto con huevo", d: "ov" }, { n: "Ensalada de quinoa", d: "ovx", h: 1 }, { n: "Brócoli con patata", d: "ovx", h: 1 }
];
const SEGUNDOS = [
  { o: "Pescado blanco a la plancha", v: "Tortilla francesa", x: "Tofu a la plancha" },
  { o: "Salmón al horno", v: "Huevos revueltos con champiñones", x: "Tempeh a la plancha" },
  { o: "Pechuga de pollo a la plancha", v: "Hamburguesa de legumbres", x: "Hamburguesa de legumbres" },
  { o: "Merluza en salsa verde", v: "Revuelto de verduras", x: "Revuelto de tofu y verduras" },
  { o: "Pavo al horno", v: "Queso fresco a la plancha", x: "Seitán a la plancha" },
  { o: "Ternera a la plancha", v: "Tortilla de patata", x: "Albóndigas de soja" },
  { o: "Atún o caballa a la plancha", v: "Huevos al plato", x: "Garbanzos especiados" },
  { o: "Calamares o sepia a la plancha", v: "Tofu salteado", x: "Tofu salteado" },
  { o: "Pollo al curry suave", v: "Curry de garbanzos", x: "Curry de garbanzos" },
  { o: "Lomo a la plancha", v: "Berenjena rellena de queso", x: "Berenjena rellena de soja" }
];
const DESAYUNOS = {
  o: ["Tostadas con tomate, aceite y jamón + fruta", "Yogur con avena, fruta y frutos secos", "Café con leche, tostada con aguacate y huevo", "Porridge de avena con plátano"],
  v: ["Tostadas con tomate, aceite y queso fresco + fruta", "Yogur con avena, fruta y frutos secos", "Café con leche, tostada con aguacate y huevo", "Porridge de avena con plátano"],
  x: ["Tostadas con tomate, aceite y hummus + fruta", "Yogur de soja con avena, fruta y frutos secos", "Bebida de soja, tostada con aguacate", "Porridge de avena con bebida vegetal y plátano"]
};
const PICOTEO = {
  o: ["Fruta y un puñado de frutos secos", "Yogur con fruta", "Bocadillo pequeño de pavo", "Tostada con queso fresco"],
  v: ["Fruta y un puñado de frutos secos", "Yogur con fruta", "Bocadillo pequeño de queso", "Tostada con hummus"],
  x: ["Fruta y un puñado de frutos secos", "Yogur de soja con fruta", "Bocadillo pequeño de hummus", "Tortitas de arroz con crema de cacahuete"]
};
const SLOTS = { 5: ["Desayuno", "Media mañana", "Comida", "Merienda", "Cena"], 4: ["Desayuno", "Comida", "Merienda", "Cena"], 3: ["Desayuno", "Comida", "Cena"] };
const bmr_ = a => 10 * a.peso + 6.25 * a.altura - 5 * a.edad + (a.sexo === "m" ? -161 : 5);
export const bmr = bmr_;
const hashTxt = t => [...String(t)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const barajar = (arr, rand) => { const b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function menuDia(a, ses, carga, cargaSig, semilla) {
  const rand = rng(semilla);
  const kg = +a.peso || 70;
  const dieta = { omni: "o", veg: "v", vegan: "x" }[a.dieta] || "o";
  const bajar = a.objetivo === "bajar_peso" && carga !== "alta" && !ses.some(s => s.tipo === "competicion");
  const musc = a.objetivo === "musculo";
  const ejercicio = ses.reduce((t, s) => t + (MET[s.dep]?.[s.tipo] ?? 6) * kg * (+s.min || 0) / 60, 0);
  let kcal = bmr_(a) * 1.35 + ejercicio * 0.9;
  if (bajar) kcal *= 0.82;
  if (musc) kcal *= 1.1;
  const sg = t => a.sinGluten ? t.replace(/^Pasta/, "Pasta sin gluten").replace(/^Sopa de fideos/, "Sopa de fideos de arroz").replace(/Tostadas?/, m => m + " de pan sin gluten").replace(/Bocadillo pequeño/, "Bocadillo pequeño (pan sin gluten)") : t;
  const sl = t => a.sinLactosa && dieta !== "x" ? t.replace(/Yogur/, "Yogur sin lactosa").replace(/Café con leche/, "Café con leche sin lactosa").replace(/queso fresco/i, "queso fresco sin lactosa") : t;
  const fix = t => sl(sg(t));
  // ración de hidratos según el día
  const racion = carga === "alta" || cargaSig === "alta" ? "grande" : carga === "media" ? "normal" : bajar ? "pequeña o ninguna" : "pequeña";
  const guarnicion = carga === "alta" ? "con buena ración de arroz o patatas" : carga === "media" ? "con una ración de patatas, arroz o pan" : "con ensalada o verduras";
  const cenaGuar = cargaSig === "alta" ? "con arroz, patata o pan (mañana toca día duro)" : carga === "descanso" || bajar ? "con verduras" : "con verduras y un poco de pan";
  const prim = barajar(PRIMEROS.filter(p => p.d.includes(dieta)), rand);
  const hc = prim.filter(p => p.h), ligeros = prim.filter(p => !p.h);
  const seg = barajar(SEGUNDOS, rand);
  const comidas = (SLOTS[a.comidas] || SLOTS[5]).map(nombre => {
    if (nombre === "Desayuno") return { nombre, lineas: [fix(DESAYUNOS[dieta][Math.floor(rand() * DESAYUNOS[dieta].length)])] };
    if (nombre === "Comida") {
      const p = (carga === "alta" || carga === "media" ? hc : ligeros.concat(hc.filter(x => x.n.includes("Lentejas") || x.n.includes("Garbanzos"))))[0] || prim[0];
      return { nombre, lineas: [`Primero: ${fix(p.n)}`, `Segundo: ${seg[0][dieta]} ${guarnicion}`, "Postre: fruta o yogur"] };
    }
    if (nombre === "Cena") return { nombre, lineas: [`Primero: ${fix(ligeros[1]?.n || prim[1].n)}`, `Segundo: ${seg[1][dieta]} ${cenaGuar}`] };
    return { nombre, lineas: [fix(PICOTEO[dieta][Math.floor(rand() * PICOTEO[dieta].length)])] };
  });
  const tips = [];
  const reales = ses.filter(s => s.dep !== "movilidad");
  tips.push(`Hidratos hoy: ración ${racion}.`);
  if (reales.some(s => s.min >= 75 && s.dep !== "fuerza")) tips.push("En el entreno largo: 30-60 g de hidratos por hora (gel, plátano, dátiles) y bebida con sales.");
  if (reales.some(s => DURO.includes(s.tipo))) tips.push("Antes de la sesión clave: comida con hidratos 2-3 h antes, ligera y baja en grasa.");
  if (reales.length) tips.push("Después de entrenar: algo de proteína (yogur, huevo, leche, batido) y fruta.");
  if (carga === "descanso") tips.push("Día de descanso: verdura, proteína y dormir bien.");
  const agua = Math.round((kg * 0.035 + reales.reduce((t, s) => t + (+s.min || 0), 0) / 60 * 0.6) * 10) / 10;
  tips.push(`Agua: unos ${agua.toLocaleString("es-ES")} litros a lo largo del día.`);
  return { kcal: Math.round(kcal / 50) * 50, comidas, tips, racion };
}

/* =========================================================
   Semana completa (instantánea que se guarda y se publica)
   ========================================================= */
/** Versión del generador: si cambia, las semanas futuras sin cambios a mano se rehacen solas. */
export const MOTOR_V = 7;
export function generarSemana(a, lunes) {
  a = efectivo(a);
  const ctx = contexto(a, lunes);
  const F = calcFase(a, ctx);
  const Z = calcZonas(a);
  const T = plantilla(a, F, ctx);
  const semana = colocar(a, T, F, ctx);
  duraciones(a, semana, F, ctx, Z);
  const dias = semana.map(dia => ({
    ses: dia.map(s => {
      const d = describir(s, a, F, Z, ctx);
      const zo = s.dep === "run" ? { suave: 2, largo: 2, recuperacion: 1 }[s.tipo] : null;
      const rk = { suave: "rodaje", largo: "tirada", recuperacion: "recuperacion" }[s.tipo];
      const obj = zo ? { zona: zo, ritmo: Z.tipos?.[rk] ? Z.tipos[rk].slice() : Z.ritmos ? Z.ritmos[zo - 1].map(Math.round) : null, fc: Z.fc[zo - 1] } : null;
      return { id: uid(8), dep: s.dep, tipo: s.tipo, min: s.min, t: d.t, z: d.z, p: d.p, n: d.n || "", ej: d.ej || null, carrera: s.carrera || null, obj, c: d.c || null, est: d.est || null, tr: d.tr || null };
    })
  }));
  const fase = FASES[F.clave];
  const snap = {
    lunes, generado: new Date().toISOString(), motor: MOTOR_V, semilla: (a.seed || 1) + hashTxt(lunes),
    fase: { clave: F.clave, n: a.objetivo === "musculo" && fase.n.startsWith("Semana de descarga") ? "Descarga" : fase.n, d: fase.d },
    obj: ctx.obj, semanas: ctx.semanas, semanaNum: ctx.semanaNum,
    A: ctx.A ? { nombre: ctx.A.nombre, fecha: ctx.A.fecha, prueba: ctx.A.prueba } : null,
    dias
  };
  recalcular(a, snap);
  return snap;
}

/**
 * Pone al día los ritmos de una semana que no se puede rehacer (tiene registros del deportista):
 * copia de una semana recién generada los textos con ritmos de las sesiones iguales (mismo día, deporte, tipo y duración).
 */
export function refrescarRitmos(a, snap) {
  const nueva = generarSemana(a, snap.lunes);
  let n = 0;
  snap.dias.forEach((d, i) => d.ses.forEach(s => {
    if (s.editada || s.tipo === "manual") return;
    const x = nueva.dias[i]?.ses.find(y => y.dep === s.dep && y.tipo === s.tipo && y.min === s.min);
    if (!x) return;
    Object.assign(s, { z: x.z, p: x.p, n: x.n, c: x.c, est: x.est, tr: x.tr, obj: x.obj }); n++;
  }));
  snap.ritmosV = MOTOR_V;
  return n;
}

/** Recalcula carga, menú y totales (tras generar o tras editar a mano). */
export function recalcular(a, snap, soloDia = null) {
  const cargas = snap.dias.map(d => cargaDia(d.ses, a.objetivo));
  snap.dias.forEach((d, i) => {
    d.carga = cargas[i];
    if (soloDia === null || soloDia === i || soloDia === i + 1) d.menu = menuDia(a, d.ses, cargas[i], cargas[(i + 1) % 7], snap.semilla + i * 101 + (d.menuVar || 0));
  });
  const porDep = {};
  for (const s of snap.dias.flatMap(d => d.ses)) porDep[s.dep] = (porDep[s.dep] || 0) + (+s.min || 0);
  snap.porDep = porDep;
  snap.total = Object.values(porDep).reduce((t, x) => t + x, 0);
  return snap;
}

/** Texto de una sesión nueva vacía para añadir a mano. */
export function sesionVacia(dep = "run") {
  return { id: uid(8), dep, tipo: "manual", min: 45, t: dep === "fuerza" ? "Fuerza" : "Entreno", z: "", p: [], n: "", ej: null, carrera: null, editada: true };
}
