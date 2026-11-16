/* App del entrenador */
import { $, $$, esc, fmtMin, fmtRitmo, fmtHoras, toast, uid, comprimirImagen, DIAS, DIAS_C, hoy, lunesDe, sumaDias, rangoSemana, fechaCorta, diasEntre, parseTiempo } from "./util.js?v=202611161051";
import { generarSemana, refrescarRitmos, MOTOR_V, recalcular, calcZonas, sesionVacia, efectivo, bmr, OBJ, PRUEBAS, PRIORIDAD, DEP } from "./motor.js?v=202611161051";
import { claseTipo, htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha, htmlPrevision, htmlProgreso, SENS_TXT, mostrarEjercicio, htmlActividades, mostrarActividad, actPorClave } from "./vista.js?v=202611161051";
import { BIBLIO } from "./biblioteca.js?v=202611161051";
import { leerTrack, prevision, normalizarTrack } from "./carrera.js?v=202611161051";
import { analizar, claveClaude, guardarClave, probarClave } from "./claude.js?v=202611161051";
import { contexto as ctxAsistente, preguntar, htmlPropuesta, lunesDeSemana } from "./asistente.js?v=202611161051";
import { avisar, nuevoCanal, htmlSuscribir } from "./avisos.js?v=202611161051";
import { predecir, htmlPrediccion } from "./prediccion.js?v=202611161051";
import { htmlHilo, htmlCaja, mensajes, sinLeerEnt, idMensaje } from "./chat.js?v=202611161051";
import { htmlInforme, ultimosMeses, nombreMes } from "./informe.js?v=202611161051";
import { calcCarga, htmlCarga, puntuarBien, nivelBien, BIEN_PREG } from "./carga.js?v=202611161051";
import { calcProgreso } from "./progreso.js?v=202611161051";
import * as A from "./almacen.js?v=202611161051";
import { leerArchivo, resumen, fusionar } from "./importar.js?v=202611161051";

let atletas = [];
let actual = null;          // deportista abierto (con .semanas cargadas)
let editando = null;        // deportista en el formulario (null = nuevo)
let sub = "semana";
let lunesVista = lunesDe(hoy());
let archivos = [];
let ajustes = {};           // plantillas, vídeos propios y presentación del entrenador
let subH = "presentacion";

/* =========================================================
   Arranque
   ========================================================= */
async function init() {
  // Filas de disponibilidad y zonas propias
  $("#disp").innerHTML = DIAS.map((d, i) => `<div class="disp-f">
    <label class="chip dia-chip"><input type="checkbox" data-dia="${i}"> ${d}</label>
    <input type="text" class="max" data-max="${i}" placeholder="sin límite" inputmode="numeric" aria-label="Máximo el ${d.toLowerCase()}">
  </div>`).join("");
  $("#sel-descanso").innerHTML = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");
  $("#rp").innerHTML = [1, 2, 3, 4, 5].map(z => `<div class="zp-f"><span>Z${z}</span><input data-rlo="${z - 1}" placeholder="rápido 5:10"><input data-rhi="${z - 1}" placeholder="lento 5:40"></div>`).join("");
  $("#ritmos-propios").addEventListener("change", e => { $("#rp").hidden = !e.target.checked; });
  $("#zp").innerHTML = [1, 2, 3, 4, 5].map(z => `<div class="zp-f"><span>Z${z}</span><input type="number" data-zlo="${z - 1}" placeholder="desde"><input type="number" data-zhi="${z - 1}" placeholder="hasta"></div>`).join("");
  $("#f-car").elements.prueba.innerHTML = Object.entries(PRUEBAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("#f-ses").elements.dia.innerHTML = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");

  enlazar();
  try {
    const r = await A.iniciar();
    pintarCuenta();
    if (r.modo === "nube" && !r.usuario) return pantallaEntrar();
    await cargarLista();
  } catch (e) {
    console.error(e);
    $("#lista").innerHTML = `<div class="panel vacio"><h2>No se ha podido conectar</h2><p>${esc(e.message)}</p><button class="btn pri" onclick="location.reload()">Reintentar</button></div>`;
  }
}

function pintarCuenta() {
  const c = $("#cuenta");
  if (!A.nube) { c.innerHTML = `<span class="estado-nube local" title="Los datos solo están en este navegador">● Solo en este navegador</span>`; return; }
  c.innerHTML = A.usuario
    ? `<span class="estado-nube ok">● ${esc(A.usuario.displayName || A.usuario.email)}</span> <button class="btn sec mini" id="btn-salir">Salir</button>`
    : "";
  $("#btn-salir")?.addEventListener("click", async () => { await A.salir(); location.reload(); });
}
function pantallaEntrar() {
  vista("lista");
  $("#pestanas").hidden = true;
  $("#lista").innerHTML = `<div class="panel vacio"><div class="big">🔐</div><h2>Entra con tu cuenta de Google</h2>
    <p>Tus deportistas se guardan en tu cuenta y así puedes abrirlos desde el móvil o el ordenador.</p>
    <button class="btn pri" id="btn-entrar">Entrar con Google</button></div>`;
  $("#btn-entrar").onclick = async () => {
    try { await A.entrar(); $("#pestanas").hidden = false; pintarCuenta(); await cargarLista(); }
    catch (e) { toast("No se ha podido entrar: " + (e.code || e.message)); }
  };
}

async function cargarLista() {
  try { ajustes = await A.leerAjustes() || {}; } catch (e) { ajustes = {}; }
  atletas = await A.listar();
  if (!A.nube && !atletas.length) await migrarV1();
  if (A.nube && !atletas.length) await subirLocales();
  atletas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  await Promise.all(atletas.map(async a => {
    if (A.nube) { try { a._aportes = await A.listarAportes(a.token); } catch (e) { a._aportes = []; } }
    try { a.semanas = await A.cargarSemanas(a); } catch (e) { } // para el cumplimiento y las alertas de la lista
  }));
  $("#aviso-nube").hidden = A.nube;
  $("#aviso-nube").innerHTML = `⚠️ Todavía no está conectada a internet (Firebase): los deportistas se guardan solo en este navegador y <b>sus enlaces no funcionarán</b> hasta conectarla.`;
  pintarLista();
  // si ha cambiado la forma de calcular (ritmos, previsiones…), sus enlaces se ponen al día solos
  if (A.nube) for (const x of atletas.filter(x => x.token && x.pubV !== PUB_V)) {
    x.pubV = PUB_V;
    (async () => {
      for (const l of Object.keys(x.semanas || {}).filter(l => l >= lunesDe(hoy()))) {
        const sn = x.semanas[l];
        if (!sn.editada && !conRegistros(x, l) && sn.motor !== MOTOR_V) { x.semanas[l] = generarSemana(x, l); await A.guardarSemana(x, x.semanas[l]); }
        else if (sn.motor !== MOTOR_V && sn.ritmosV !== MOTOR_V) { refrescarRitmos(x, sn); await A.guardarSemana(x, sn); }
      }
      await publicar(x); await A.guardarFicha(x);
    })().catch(() => {});
  }
  const id = new URLSearchParams(location.search).get("a");
  if (id && atletas.some(x => x.id === id)) abrir(id);
}

/* Al conectar la nube: subir lo que se creó en este navegador */
async function subirLocales() {
  const loc = await A.datosLocales();
  if (!loc || !confirm(`En este navegador tienes ${loc.length} deportista${loc.length > 1 ? "s" : ""} creado${loc.length > 1 ? "s" : ""} antes de conectar la nube (${loc.map(x => x.ficha.nombre).join(", ")}). ¿Subirlos a tu cuenta?`)) return;
  for (const x of loc) {
    await A.guardarFicha(x.ficha);
    for (const s of Object.values(x.semanas)) await A.guardarSemana(x.ficha, s);
    for (const d of x.archivos) { try { await A.guardarArchivo(x.ficha, d); } catch (e) { toast(`${d.nombre}: ${e.message}`); } }
    atletas.push(x.ficha);
    try { x.ficha.semanas = x.semanas; await publicar(x.ficha); } catch (e) { }
  }
  A.olvidarLocales();
  toast("Deportistas subidos a tu cuenta");
}

/* Datos de la versión anterior (solo navegador) */
async function migrarV1() {
  let viejos = [];
  try { viejos = JSON.parse(localStorage.getItem("entrenador.atletas.v1")) || []; } catch (e) { }
  for (const v of viejos) {
    const a = nuevoAtleta({
      nombre: v.nombre, sexo: v.sexo, edad: v.edad, nivel: v.nivel, peso: v.peso, altura: v.altura,
      objetivo: v.objetivo === "perder_grasa" ? "bajar_peso" : v.objetivo, deportes: v.deportes,
      disp: DIAS.map((_, i) => ({ on: (v.dias || []).includes(i), max: 0 })), horas: v.horas, descanso: v.descanso,
      fc: { max: v.fcmax || "", rep: v.fcrep || "", umbral: "" }, marcas: { "5k": v.marca5k || "", "10k": v.marca10k || "" }, ftp: v.ftp || "",
      dieta: v.dieta, comidas: v.comidas, sinGluten: v.sinGluten, sinLactosa: v.sinLactosa, notas: v.notas || ""
    });
    await A.guardarFicha(a); atletas.push(a);
  }
}

/* =========================================================
   Navegación
   ========================================================= */
function vista(v) {
  $$(".vista").forEach(x => { x.hidden = x.id !== "v-" + v; });
  $$("#pestanas [data-vista]").forEach(b => b.setAttribute("aria-selected", b.dataset.vista === v));
  window.scrollTo({ top: 0 });
}

function pintarLista() {
  const el = $("#lista");
  if (!atletas.length) {
    el.innerHTML = `<div class="panel vacio"><div class="big">👋</div><h2>Todavía no tienes deportistas</h2><p>Crea el primero: sus datos, su disponibilidad y sus carreras. La app genera su semana de entrenos y su menú.</p><button class="btn pri" data-vista-ir="nuevo">＋ Nuevo deportista</button></div>`;
    return;
  }
  const h = hoy();
  el.innerHTML = htmlEquipo(atletas) + `<div class="tarjetas">${atletas.map(a => {
    const prox = (a.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
    return `<button class="tarjeta" data-abrir="${a.id}">
      <span class="ini">${esc(a.nombre.trim().slice(0, 1).toUpperCase())}</span>
      <span class="tx"><b>${esc(a.nombre)}</b><span>${esc(OBJ[a.objetivo] || "")} · ${esc(a.nivel)}</span>
      ${nuevos(a).length ? `<span class="nuevo">🔔 ${resumenNuevos(a)}</span>` : ""}
      ${chipSemana(a)}
      ${htmlAlertas(a)}
      ${A.nube ? (v => v ? `<span class="small">👁️ Entró ${hace(v.ultima)} · ${v.n} visitas</span>` : `<span class="small muted">👁️ Aún no ha abierto su enlace</span>`)(visitas(a)) : ""}
      ${prox ? `<span class="prox">🏁 ${esc(prox.nombre || PRUEBAS[prox.prueba])} · ${fechaCorta(prox.fecha)} (${diasEntre(h, prox.fecha)} días)</span>` : `<span class="prox muted">Sin carreras</span>`}</span>
      <span class="flecha">›</span>
    </button>`;
  }).join("")}</div>`;
}

function semanaDe(a) {
  const l = lunesDe(hoy()), snap = a.semanas?.[l];
  if (!snap) return null;
  const regs = (a._aportes || []).filter(x => x.tipo === "sesion" && x.lunes === l && x.hecho !== "no");
  const acts = (a.actividades || []).filter(x => x.fecha >= l && x.fecha <= hoy());
  let plan = 0, hechas = 0;
  snap.dias.forEach((d, i) => { const f = sumaDias(l, i); if (f > hoy()) return; d.ses.filter(s => s.dep !== "movilidad").forEach(s => { plan++; if (regs.some(r => r.sesId === s.id) || acts.some(x => x.fecha === f && x.dep === s.dep)) hechas++; }); });
  const total = snap.dias.flatMap(d => d.ses).filter(s => s.dep !== "movilidad").length;
  return { plan, hechas, total };
}
function chipSemana(a) {
  const w = semanaDe(a), b = bienestares(a)[0];
  const bh = b && b.fecha === hoy() ? (p => `<span class="chip-b ${nivelBien(p)}">☀️ ${p}</span>`)(puntuarBien(b)) : "";
  if (!w || !w.plan) return bh ? `<span class="chips">${bh}</span>` : "";
  const pct = w.hechas / w.plan;
  return `<span class="chips"><span class="chip-s ${pct >= 0.8 ? "ok" : pct >= 0.5 ? "ojo" : "mal"}">✅ ${w.hechas}/${w.plan} esta semana</span>${bh}</span>`;
}
function htmlEquipo(atletas) {
  if (atletas.length < 2) return "";
  let plan = 0, hechas = 0, graves = 0, bien = 0, nb = 0;
  for (const a of atletas) { const w = semanaDe(a); if (w) { plan += w.plan; hechas += w.hechas; } if (alertas(a).some(x => x.g)) graves++; const b = bienestares(a)[0]; if (b?.fecha === hoy()) { bien += puntuarBien(b); nb++; } }
  return `<div class="equipo">
    <div><b>${atletas.length}</b><span>deportistas</span></div>
    <div><b>${plan ? Math.round(hechas / plan * 100) + " %" : "—"}</b><span>cumplido esta semana</span></div>
    <div><b>${nb ? Math.round(bien / nb) : "—"}</b><span>bienestar hoy${nb ? ` (${nb})` : ""}</span></div>
    <div class="${graves ? "mal" : ""}"><b>${graves}</b><span>con avisos importantes</span></div>
  </div>`;
}
const nuevos = a => (a._aportes || []).filter(x => x.tipo !== "visita" && !(x.tipo === "mensaje" && x.de === "entrenador") && !x.visto && !(x.tipo === "carrera" && x.estado && x.estado !== "pendiente"));
const visitas = a => (a._aportes || []).find(x => x.tipo === "visita");
function hace(isoTxt) {
  const min = Math.round((Date.now() - Date.parse(isoTxt)) / 60000);
  return min < 2 ? "ahora mismo" : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} día${min >= 2880 ? "s" : ""}`;
}
function htmlVisitas(a) {
  const v = visitas(a);
  if (!v) return `<span class="vis nada">👁️ Aún no ha abierto su enlace</span>`;
  const l = lunesDe(hoy()), estaSemana = (v.dias || []).filter(d => d >= l).length;
  return `<span class="vis ${Date.now() - Date.parse(v.ultima) > 4 * 86400000 ? "frio" : "ok"}">👁️ ${v.n} visita${v.n === 1 ? "" : "s"} · última ${hace(v.ultima)} · ${estaSemana} día${estaSemana === 1 ? "" : "s"} esta semana</span>`;
}
/* Alertas de carga y de seguimiento */
const predDe = a => { const Z = calcZonas(a); return predecir({ actividades: a.actividades || [], aportes: a._aportes || [], semanas: a.semanas || {}, Z }); };
const cargaDe = a => { const Z = calcZonas(a); return calcCarga({ semanas: a.semanas || {}, aportes: a._aportes || [], actividades: a.actividades || [], Z: { fcmax: Z.fcmax, fcrep: Z.fcrep }, mujer: a.sexo === "m" }); };
const bienestares = a => (a._aportes || []).filter(x => x.tipo === "bienestar").sort((x, y) => y.fecha.localeCompare(x.fecha));
const zapatillas = a => (a._aportes || []).find(x => x.id === "material")?.zap || [];
function kmZapa(a, z) {
  const fin = z.hasta || "9999";
  const regs = (a._aportes || []).filter(r => r.tipo === "sesion" && r.hecho !== "no" && r.lunes);
  let km = (a.actividades || []).filter(x => x.dep === "run" && x.fecha >= z.desde && x.fecha < fin).reduce((t, x) => t + (+x.km || 0), 0);
  for (const r of regs) { const f = sumaDias(r.lunes, r.dia || 0); if (f < z.desde || f >= fin) continue; if (r.act && !(a.actividades || []).some(x => x.fecha === f && x.dep === r.act.dep)) km += +r.act.km || 0; else if (!r.act) km += parseFloat(String(r.km || 0).replace(",", ".")) || 0; }
  return Math.round((+z.previos || 0) + km);
}
function htmlBienTrainer(a) {
  const bs = bienestares(a).filter(b => b.fecha >= sumaDias(hoy(), -13));
  if (!bs.length) return "";
  const dias = Array.from({ length: 14 }, (_, i) => sumaDias(hoy(), i - 13));
  const media = Math.round(bs.reduce((t, b) => t + (puntuarBien(b) || 0), 0) / bs.length);
  return `<article class="dia bien-t"><div class="dia-cab"><h3>☀️ Cómo se levanta</h3><span class="small muted">media ${media}/100 · ${bs.length} de 14 días</span></div>
    <div class="bien-14">${dias.map(f => { const b = bs.find(x => x.fecha === f), p = puntuarBien(b); return `<div title="${fechaCorta(f)}${b ? ` · ${p}/100${b.dolor ? " · dolor " + (b.dolorTxt || "") : ""}` : " · sin dato"}"><i class="${b ? nivelBien(p) : "nada"}" style="height:${b ? 12 + p * 0.5 : 6}px"></i><small>${"LMXJVSD"[(new Date(f + "T12:00").getDay() + 6) % 7]}</small>${b?.dolor ? "<em>🤕</em>" : ""}</div>`; }).join("")}</div>
    ${bs[0] ? `<p class="small">Último (${fechaCorta(bs[0].fecha)}): ${BIEN_PREG.map(([k, n, ico]) => `${n} ${ico[(bs[0][k] || 3) - 1]}`).join(" · ")}${bs[0].dolor ? ` · 🤕 ${esc(bs[0].dolorTxt || "dolor")}` : ""}</p>` : ""}
  </article>`;
}
function htmlZapasTrainer(a) {
  const zs = zapatillas(a).filter(z => !z.hasta);
  if (!zs.length) return "";
  return `<article class="dia"><div class="dia-cab"><h3>👟 Sus zapatillas</h3></div>${zs.map(z => { const km = kmZapa(a, z); return `<p>${esc(z.nombre)}: <b>${km} km</b>${km >= 800 ? " · 🔴 toca cambiarlas" : km >= 600 ? " · 🟡 ve avisándole" : ""}</p>`; }).join("")}</article>`;
}

function alertas(a) {
  const out = [], h = hoy(), l0 = lunesDe(h), sem = a.semanas || {};
  const tot = l => sem[l]?.total || 0;
  const prev = [1, 2, 3].map(i => tot(sumaDias(l0, -7 * i))).filter(Boolean);
  if (tot(l0) && prev.length) { const media = prev.reduce((x, y) => x + y, 0) / prev.length; const sube = Math.round((tot(l0) / media - 1) * 100); if (sube > 15) out.push({ t: `📈 Sube un ${sube} % de carga esta semana`, g: sube > 30 }); }
  const sig = sumaDias(l0, 7);
  // si esta semana está recortada a propósito (días sueltos o volumen bajado), se compara con las anteriores
  const recortada = a.dispSemana?.[l0] || (a.ajustes?.[l0] || 1) < 1;
  const baseSig = recortada && prev.length ? prev.reduce((x, y) => x + y, 0) / prev.length : tot(l0);
  if (tot(sig) && baseSig) { const sube = Math.round((tot(sig) / baseSig - 1) * 100); if (sube > 20) out.push({ t: `📈 La semana que viene sube un ${sube} %`, g: false }); }
  const vals = (a._aportes || []).filter(x => x.tipo === "semana").sort((x, y) => y.lunes.localeCompare(x.lunes));
  if (vals.length >= 2 && vals.slice(0, 2).every(v => ["dura", "excesiva"].includes(v.sensacion))) out.push({ t: "🥵 Dos semanas seguidas duras", g: true });
  if (vals[0]?.molestias && vals[0].lunes >= sumaDias(l0, -7)) out.push({ t: `🤕 Molestias${vals[0].molestiasTxt ? ": " + vals[0].molestiasTxt.slice(0, 40) : ""}`, g: true });
  if (A.nube && Object.keys(sem).length) {
    const regs = (a._aportes || []).filter(x => x.tipo === "sesion").map(x => sumaDias(x.lunes, x.dia || 0)).sort();
    const ultimo = regs[regs.length - 1];
    const dias = ultimo ? diasEntre(ultimo, h) : null;
    if ((dias == null && diasEntre(a.inicio || l0, h) > 7) || dias > 7) out.push({ t: dias == null ? "📵 Aún no ha registrado ningún entreno" : `📵 ${dias} días sin registrar`, g: dias > 14 });
    const v = (a._aportes || []).find(x => x.tipo === "visita");
    if (v && Date.now() - Date.parse(v.ultima) > 5 * 86400000) out.push({ t: `👁️ No entra desde hace ${Math.round((Date.now() - Date.parse(v.ultima)) / 86400000)} días`, g: false });
  }
  const p = calcProgreso({ semanas: sem, aportes: a._aportes || [], actividades: a.actividades || [], n: 2 })[0];
  if (p && p.sesPlan >= 3 && p.sesHechas / p.sesPlan < 0.6) out.push({ t: `📉 La semana pasada cumplió ${p.sesHechas} de ${p.sesPlan}`, g: false });
  const C = cargaDe(a);
  if (C?.acwr > 1.5) out.push({ t: `⚠️ Carga sube muy rápido (ratio ${String(C.acwr).replace(".", ",")})`, g: true });
  else if (C && C.historial >= 21 && C.tsb < -30) out.push({ t: `🪫 Muy fatigado (frescura ${C.tsb})`, g: true });
  const b = bienestares(a)[0];
  if (b && b.fecha >= sumaDias(h, -1)) { const pb = puntuarBien(b); if (b.dolor) out.push({ t: `🤕 Hoy con dolor${b.dolorTxt ? ": " + b.dolorTxt.slice(0, 30) : ""}`, g: true }); else if (pb < 45) out.push({ t: `🔴 Se ha levantado mal (${pb}/100)`, g: true }); }
  const fcs = bienestares(a).filter(x => +x.fcRep && x.fecha >= sumaDias(h, -28));
  if (fcs.length >= 5 && fcs[0].fecha >= sumaDias(h, -1)) { const base = fcs.slice(1).map(x => +x.fcRep).sort((x, y) => x - y)[Math.floor((fcs.length - 1) / 2)]; if (+fcs[0].fcRep >= base + 7) out.push({ t: `❤️ Pulso en reposo alto: ${fcs[0].fcRep} (suele ${base}). Posible fatiga o algo de catarro`, g: true }); }
  const bajos = bienestares(a).filter(x => x.fecha >= sumaDias(h, -6) && puntuarBien(x) < 50).length;
  if (bajos >= 3) out.push({ t: `😴 ${bajos} días malos esta semana: revisa la carga`, g: true });
  for (const z of zapatillas(a).filter(z => !z.hasta)) { const km = kmZapa(a, z); if (km >= 750) out.push({ t: `👟 ${z.nombre}: ${km} km`, g: false }); }
  return out;
}
const htmlAlertas = a => { const al = alertas(a); return al.length ? `<div class="alertas">${al.map(x => `<span class="alerta-c${x.g ? " grave" : ""}">${esc(x.t)}</span>`).join("")}</div>` : ""; };
function resumenNuevos(a) {
  const n = nuevos(a), c = t => n.filter(x => x.tipo === t).length;
  return [c("resultado") && `🏅 ${c("resultado")} resultado${c("resultado") > 1 ? "s" : ""}`, c("mensaje") && `💬 ${c("mensaje")} mensaje${c("mensaje") > 1 ? "s" : ""}`, c("bienestar") && `${c("bienestar")} día${c("bienestar") > 1 ? "s" : ""} de bienestar`, c("sesion") && `${c("sesion")} entreno${c("sesion") > 1 ? "s" : ""} registrado${c("sesion") > 1 ? "s" : ""}`, c("semana") && "valoración de la semana", c("carrera") && `${c("carrera")} carrera${c("carrera") > 1 ? "s" : ""} propuesta${c("carrera") > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
}

/* =========================================================
   Formulario
   ========================================================= */
const DEF = () => ({
  nombre: "", sexo: "h", edad: 35, nivel: "intermedio", peso: 70, altura: 172, objetivo: "10k", lesionZona: "",
  deportes: { run: true, bike: false, swim: false, fuerza: true },
  disp: DIAS.map((_, i) => ({ on: i !== 2, max: i < 5 ? 75 : 150 })), horas: "", descanso: 2,
  fc: { max: "", rep: "", umbral: "", zonas: null }, marcas: { "1k": "", "5k": "", "10k": "", "15k": "", media: "", maraton: "" }, ftp: "", css: "",
  dieta: "omni", comidas: 5, sinGluten: false, sinLactosa: false, notas: "", mensaje: "", inicio: proximoLunes()
});
const proximoLunes = () => { const h = hoy(); return [5, 6].includes((new Date().getDay() + 6) % 7) ? sumaDias(lunesDe(h), 7) : lunesDe(h); };
const minTxt = m => !m ? "" : m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m / 60}:00`;
function leerMin(t) {
  t = String(t || "").trim().toLowerCase().replace(/\s/g, "");
  if (!t) return 0;
  let m = t.match(/^(\d+)[:h](\d{1,2})?'?$/); if (m) return +m[1] * 60 + (+m[2] || 0);
  m = t.match(/^(\d+)(min|'|m)?$/); if (m) return +m[1] <= 5 ? +m[1] * 60 : +m[1];
  return NaN;
}

function nuevoAtleta(datos) {
  return { ...DEF(), ...datos, id: uid(12), token: uid(24), seed: Math.floor(Math.random() * 1e9), creado: new Date().toISOString(), carreras: datos.carreras || [], actividades: [] };
}

function escribirForm(a) {
  const f = $("#form");
  const set = (n, v) => { f.elements[n].value = v ?? ""; };
  ["nombre", "telefono", "email", "sexo", "edad", "nivel", "peso", "altura", "objetivo", "lesionZona", "horas", "descanso", "ftp", "css", "dieta", "comidas", "notas", "mensaje", "inicio"].forEach(n => set(n, a[n]));
  set("fcmax", a.fc?.max); set("fcrep", a.fc?.rep); set("fcumbral", a.fc?.umbral);
  set("m1k", a.marcas?.["1k"]); set("m15k", a.marcas?.["15k"]); set("m5k", a.marcas?.["5k"]); set("m10k", a.marcas?.["10k"]); set("mmedia", a.marcas?.media); set("mmaraton", a.marcas?.maraton);
  ["run", "bike", "swim", "fuerza"].forEach(n => { f.elements[n].checked = !!a.deportes?.[n]; });
  f.elements.usaCinta.checked = a.usaCinta !== false; set("reloj", a.reloj); set("ajusteRitmos", a.ajusteRitmos || "");
  f.elements.sinGluten.checked = !!a.sinGluten; f.elements.sinLactosa.checked = !!a.sinLactosa;
  (a.disp || []).forEach((d, i) => { $(`[data-dia="${i}"]`).checked = !!d.on; $(`[data-max="${i}"]`).value = minTxt(+d.max); });
  const rp = Array.isArray(a.ritmosZona);
  $("#ritmos-propios").checked = rp; $("#rp").hidden = !rp;
  [0, 1, 2, 3, 4].forEach(i => { $(`[data-rlo="${i}"]`).value = rp ? a.ritmosZona[i][0] : ""; $(`[data-rhi="${i}"]`).value = rp ? a.ritmosZona[i][1] : ""; });
  const zp = Array.isArray(a.fc?.zonas);
  $("#zonas-propias").checked = zp; $("#zp").hidden = !zp;
  [0, 1, 2, 3, 4].forEach(i => { $(`[data-zlo="${i}"]`).value = zp ? a.fc.zonas[i][0] : ""; $(`[data-zhi="${i}"]`).value = zp ? a.fc.zonas[i][1] : ""; });
  mostrarSegunObjetivo();
}
function mostrarSegunObjetivo() { const o = $("#form").elements.objetivo.value; $$("[data-si]").forEach(x => { x.hidden = x.dataset.si !== o; }); }

function leerForm() {
  const f = $("#form"), v = n => f.elements[n].value.trim(), num = n => { const x = parseFloat(v(n).replace(",", ".")); return isNaN(x) ? "" : x; };
  const disp = DIAS.map((_, i) => ({ on: $(`[data-dia="${i}"]`).checked, max: leerMin($(`[data-max="${i}"]`).value) }));
  const ritmosZona = $("#ritmos-propios").checked ? [0, 1, 2, 3, 4].map(i => [$(`[data-rlo="${i}"]`).value.trim(), $(`[data-rhi="${i}"]`).value.trim()]) : null;
  const zonas = $("#zonas-propias").checked ? [0, 1, 2, 3, 4].map(i => [+$(`[data-zlo="${i}"]`).value, +$(`[data-zhi="${i}"]`).value]) : null;
  return {
    nombre: v("nombre"), telefono: v("telefono"), email: v("email"), sexo: v("sexo"), edad: num("edad"), nivel: v("nivel"), peso: num("peso"), altura: num("altura"),
    objetivo: v("objetivo"), lesionZona: v("lesionZona"),
    deportes: { run: f.elements.run.checked, bike: f.elements.bike.checked, swim: f.elements.swim.checked, fuerza: f.elements.fuerza.checked },
    inicio: v("inicio") ? lunesDe(v("inicio")) : proximoLunes(),
    disp, horas: num("horas"), descanso: +v("descanso"),
    fc: { max: num("fcmax"), rep: num("fcrep"), umbral: num("fcumbral"), zonas }, ritmosZona,
    marcas: { "1k": v("m1k"), "15k": v("m15k"), "5k": v("m5k"), "10k": v("m10k"), media: v("mmedia"), maraton: v("mmaraton") }, ftp: num("ftp"), css: v("css"),
    usaCinta: f.elements.usaCinta.checked, reloj: v("reloj"), ajusteRitmos: Math.max(-30, Math.min(30, parseInt(v("ajusteRitmos"), 10) || 0)),
    dieta: v("dieta"), comidas: +v("comidas"), sinGluten: f.elements.sinGluten.checked, sinLactosa: f.elements.sinLactosa.checked,
    notas: v("notas"), mensaje: v("mensaje")
  };
}

function previaRitmos() {
  const f = $("#form"), v = n => f.elements[n]?.value?.trim() || "";
  const marcas = { "1k": v("m1k"), "5k": v("m5k"), "10k": v("m10k"), "15k": v("m15k"), media: v("mmedia"), maraton: v("mmaraton") };
  const mal = Object.entries(marcas).filter(([, t]) => t && !parseTiempo(t)).map(([k]) => k);
  const Z = calcZonas({ edad: +v("edad") || 35, sexo: v("sexo") || "h", nivel: v("nivel") || "intermedio", marcas, fc: {}, ajusteRitmos: parseInt(v("ajusteRitmos"), 10) || 0 });
  const T = Z.tipos, r = k => T?.[k] ? `${fmtRitmo(T[k][0])}-${fmtRitmo(T[k][1])}` : "—";
  $("#prev-ritmos").innerHTML = mal.length ? `<p class="alerta">No entiendo la marca de ${mal.join(", ")}: escríbela como 22:28 o 1:45:00.</p>`
    : `<b>${Z.ritmoEstimado ? "Ritmos estimados (sin marcas)" : "Así le saldrán sus ritmos"}</b><div class="pr-grid"><span>Regenerativo <b>${r("recuperacion")}</b></span><span>Rodaje <b>${r("rodaje")}</b></span><span>Tirada <b>${r("tirada")}</b></span><span>Umbral <b>${r("umbral")}</b></span><span>Ritmo 10K <b>${r("10k")}</b></span><span>Series <b>${r("series")}</b></span></div>`;
}
function validar(d) {
  if (!d.nombre) return "Falta el nombre.";
  if (!d.edad || !d.peso || !d.altura) return "Faltan edad, peso o altura (se usan para el menú).";
  if (!d.disp.some(x => x.on)) return "Marca al menos un día disponible.";
  if (d.disp.some(x => x.on && isNaN(x.max))) return "Hay un tiempo máximo que no entiendo: escríbelo como 1:15 o 75.";
  if (d.disp.some(x => x.on && x.max && x.max < 20)) return "Un día con menos de 20 minutos no da para un entreno: súbelo o desmárcalo.";
  for (const k of Object.keys(d.marcas)) if (d.marcas[k] && !parseTiempo(d.marcas[k])) return "Las marcas van como mm:ss o h:mm:ss (por ejemplo 45:30).";
  if (d.ritmosZona && d.ritmosZona.some(z => !parseTiempo(z[0]) || !parseTiempo(z[1]))) return "Escribe los 5 ritmos por zona como m:ss (por ejemplo 5:10 y 5:40).";
  if (d.css && !parseTiempo(d.css)) return "El ritmo de natación va como m:ss (por ejemplo 1:45).";
  if (d.fc.zonas && d.fc.zonas.some(z => !(z[0] > 0 && z[1] > z[0]))) return "Revisa sus zonas propias: cada zona necesita un «desde» y un «hasta» mayor.";
  const RUN = ["5k", "10k", "media", "maraton", "lesion"];
  if (RUN.includes(d.objetivo)) d.deportes.run = true;
  if (d.objetivo === "ciclismo") d.deportes.bike = true;
  if (d.objetivo === "triatlon") d.deportes.run = d.deportes.bike = d.deportes.swim = true;
  if (d.objetivo === "musculo") d.deportes.fuerza = true;
  return "";
}

async function guardarForm(e) {
  e.preventDefault();
  const d = leerForm();
  const err = validar(d);
  if (err) return toast(err);
  const btn = $("#btn-guardar"); btn.disabled = true;
  try {
    if (!editando) {
      const a = nuevoAtleta(d);
      a.semanas = {};
      await A.guardarFicha(a);
      if (await guardarPendientes(a)) await A.guardarFicha(a);
      atletas.push(a);
      actual = a;
      await asegurarSemanas(a);
      toast(`${a.nombre} creado. Su plan ya está listo.`);
    } else {
      Object.assign(editando, d);
      await guardarPendientes(editando);
      await A.guardarFicha(editando);
      const r = await actualizarFuturas(editando);
      toast(r);
    }
    await publicar(actual);
    pintarLista();
    abrir(actual.id, true);
  } catch (err) { console.error(err); toast("No se ha podido guardar: " + err.message); }
  finally { btn.disabled = false; }
}

function formNuevo() {
  editando = null;
  escribirForm(DEF());
  $("#form-titulo").textContent = "Nuevo deportista";
  $("#btn-guardar").textContent = "Crear deportista y generar su plan";
  $("#btn-borrar").hidden = true;
  prepararSubidaForm();
  previaRitmos();
  vista("nuevo");
}
function formEditar() {
  editando = actual;
  escribirForm(actual);
  $("#form-titulo").textContent = `Ficha de ${actual.nombre}`;
  $("#btn-guardar").textContent = "Guardar cambios";
  $("#btn-borrar").hidden = false;
  prepararSubidaForm();
  previaRitmos();
  vista("nuevo");
  $$("#pestanas [data-vista]").forEach(b => b.setAttribute("aria-selected", b.dataset.vista === "atleta"));
}

/* =========================================================
   Semanas
   ========================================================= */
async function asegurarSemanas(a, desde = lunesDe(hoy()), n = 2) {
  for (let i = 0; i < n; i++) {
    const l = sumaDias(desde, 7 * i);
    if (!a.semanas[l]) { a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); }
  }
}
/** Una semana con entrenos ya registrados por el deportista no se rehace sola (se perderían sus registros). */
const conRegistros = (a, l) => (a._aportes || []).some(x => x.tipo === "sesion" && x.lunes === l);
/** Rehace las semanas desde la actual que no tengan cambios a mano ni registros del deportista. */
async function actualizarFuturas(a) {
  const desde = lunesDe(hoy());
  let hechas = 0, manuales = 0;
  for (const l of Object.keys(a.semanas).filter(l => l >= desde)) {
    if (a.semanas[l].editada || conRegistros(a, l)) {
      // no se rehace (tiene registros o cambios a mano), pero sus ritmos sí se ponen al día
      if (refrescarRitmos(a, a.semanas[l])) { recalcular(a, a.semanas[l]); await A.guardarSemana(a, a.semanas[l]); }
      manuales++; continue;
    }
    a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); hechas++;
  }
  await asegurarSemanas(a);
  return `Guardado. ${hechas ? `Plan actualizado (${hechas} semana${hechas > 1 ? "s" : ""}).` : ""}${manuales ? ` En ${manuales} semana${manuales > 1 ? "s" : ""} con cambios a mano o entrenos ya registrados solo se han puesto al día los ritmos.` : ""}`;
}

/* =========================================================
   Publicación (enlace del deportista)
   ========================================================= */
const enlace = a => new URL(`ver.html?d=${a.token}`, location.href).href;
/** Versión de lo publicado: súbela cuando cambien cálculos que ve el deportista. */
const PUB_V = 6;
const AV_DEF = { registros: true, bienestar: true, mensajes: true, resultados: true, valoraciones: true };
const prefAvisos = () => ({ ...AV_DEF, ...(ajustes.avisos || {}) });
async function canalEntrenador() {
  if (!ajustes.ntfy) { ajustes.ntfy = nuevoCanal("dnj-ent-"); try { await A.guardarAjustes(ajustes); } catch (e) { } }
  return ajustes.ntfy;
}
/** Aviso al móvil del deportista (si se ha suscrito a su canal en ntfy). */
async function avisarDeportista(a, titulo, texto) {
  if (!a.ntfy || !A.nube) return false;
  return avisar(a.ntfy, { titulo, texto, click: enlace(a), tags: ["runner"] });
}
async function publicar(a) {
  if (!a.ntfy) { a.ntfy = nuevoCanal("dnj-"); try { await A.guardarFicha(a); } catch (e) { } }
  if (!A.nube || !a) return;
  await asegurarSemanas(a, lunesDe(hoy()), semanasPlan(a)); // todo el plan (el deportista solo ve fases y volumen del futuro)
  const semanas = {}, l0 = lunesDe(hoy());
  for (const l of [l0, sumaDias(l0, 7)]) if (a.semanas[l]) semanas[l] = a.semanas[l]; // el deportista ve esta semana y la siguiente
  const Z = calcZonas(a);
  const progreso = calcProgreso({ semanas: a.semanas, aportes: a._aportes || [], actividades: a.actividades || [] });
  try {
    await A.publicar(a, {
      nombre: a.nombre, objetivo: OBJ[a.objetivo], mensaje: a.mensaje || "",
      carreras: (a.carreras || []).filter(c => c.fecha >= sumaDias(hoy(), -30)).map(c => ({ id: c.id, nombre: c.nombre, fecha: c.fecha, prueba: c.prueba, prioridad: c.prioridad, objetivo: c.objetivo || "", lugar: c.lugar || "", estrategia: c.estrategia || "", ritmoObjetivo: c.ritmoObjetivo || "",
        track: c.track ? { dist: c.track.dist, sube: c.track.sube, baja: c.track.baja, kms: c.track.kms, perfil: c.track.perfil } : null, prev: prevision(c, Z, predDe(a)) })),
      progreso,
      marcas: a.marcas || {},
      pred: predDe(a),
      entrenador: ajustes.presentacion?.nombre || "",
      ntfy: a.ntfy, ntfyEnt: ajustes.ntfy || "", avisosEnt: prefAvisos(), id: a.id,
      kmAno: Math.round((a.actividades || []).filter(x => x.dep === "run" && x.fecha >= hoy().slice(0, 4) + "-01-01").reduce((t, x) => t + (+x.km || 0), 0)),
      carrerasHechas: (a.carreras || []).filter(c => c.fecha < hoy()).length,
      videos: ajustes.videos || {},
      actividades: (a.actividades || []).filter(x => x.fecha >= sumaDias(hoy(), -84) && ["run", "bike", "swim", "fuerza"].includes(x.dep))
        .map(({ fecha, dep, km, dur, fcMed, fcMax, potMed, titulo, fuente, sube, kcal, cad, mov, mejores, det }) => ({ fecha, dep, km, dur, fcMed, fcMax, potMed, titulo, fuente, sube, kcal, cad, mov, mejores, det })),
      mujer: a.sexo === "m", usaCinta: a.usaCinta !== false, reloj: a.reloj || "",
      zonas: { fcmax: Z.fcmax, fcrep: Z.fcrep, fc: Z.fc, ritmos: Z.ritmos, potencia: Z.potencia, nado: Z.nado, carrera: Z.carrera, metodo: Z.metodo, tipos: Z.tipos, vdot: Z.vdot, ritmoEstimado: Z.ritmoEstimado, ritmosPropios: Z.ritmosPropios },
      semanas,
      // historial (semanas pasadas, en corto) y esquema del plan futuro (solo fases y volumen: nunca las sesiones)
      hist: Object.keys(a.semanas || {}).filter(l => l < l0).sort().slice(-52).map(l => { const sn = a.semanas[l]; return { lunes: l, fase: sn.fase?.n || "", fk: sn.fase?.clave || "", total: sn.total || 0,
        dias: sn.dias.map(d => d.ses.filter(x => x.dep !== "movilidad").map(x => ({ id: x.id, t: x.t, c: claseTipo(x), min: x.min, dep: x.dep }))) }; }),
      planF: Array.from({ length: semanasPlan(a) }, (_, i) => sumaDias(l0, 7 * i)).map(l => { const sn = a.semanas[l]; return sn ? { lunes: l, fase: sn.fase?.n || "", fk: sn.fase?.clave || "", total: sn.total || 0 } : { lunes: l }; }),
      inicio: a.inicio || ""
    });
    estadoEnlace(a, true);
  } catch (e) { console.error(e); estadoEnlace(a, false, e.code || e.message); toast("Guardado, pero no se ha podido actualizar su enlace: " + (e.code || e.message)); }
}

function estadoEnlace(a, ok, err = "") {
  a._pub = { ok, err };
  const el = document.getElementById("estado-enlace");
  if (el && actual?.id === a.id) el.innerHTML = ok ? "✅ Al día: ve lo último que has guardado" : `⚠️ No se ha podido actualizar (${esc(err)}). Vuelve a abrir la ficha para reintentar.`;
}

/* =========================================================
   Ficha del deportista
   ========================================================= */
async function abrir(id, mantener = false) {
  const a = atletas.find(x => x.id === id);
  if (!a) return;
  if (actual?.id !== id || !actual.semanas) { a.semanas = await A.cargarSemanas(a); archivos = []; }
  if (A.nube) { try { a._aportes = await A.listarAportes(a.token); } catch (e) { a._aportes = a._aportes || []; } }
  actual = a;
  (a.carreras || []).forEach(c => { if (c.track && c.track.v !== 2) c.track = normalizarTrack(c.track); }); // desnivel sin ruido del GPS
  if (!mantener) { sub = (a._aportes || []).some(x => x.tipo !== "visita") || (a.actividades || []).length ? "resumen" : "semana"; lunesVista = lunesDe(hoy()); } // recién creado: su semana
  await procesarResultados(a);
  // las actividades que el deportista sube al registrar entrenos pasan a su historial
  const suyas = (a._aportes || []).filter(x => x.tipo === "sesion" && x.act?.fecha).map(x => ({ ...x.act, id: "dep-" + x.id }));
  if (suyas.length) { const { lista, anadidas } = fusionar(a.actividades || [], suyas); if (anadidas) { a.actividades = lista.slice(0, 1500); await A.guardarFicha(a); } }
  await procesarTests(a);
  // datos recalculados con los filtros actuales y semanas futuras al día con el generador nuevo
  if (a.actividades?.length || a.medidas?.length) recalcHist(a);
  let rehechas = 0;
  for (const l of Object.keys(a.semanas || {}).filter(l => l >= lunesDe(hoy()))) {
    const s = a.semanas[l];
    if (!s.editada && !conRegistros(a, l) && s.motor !== MOTOR_V) { a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); rehechas++; }
    else if (s.motor !== MOTOR_V && s.ritmosV !== MOTOR_V) { refrescarRitmos(a, s); await A.guardarSemana(a, s); }
  }
  if (rehechas) { await A.guardarFicha(a); toast(`Plan actualizado con el generador nuevo (${rehechas} semana${rehechas > 1 ? "s" : ""})`); }
  await asegurarSemanas(a);
  const t = $("#tab-atleta"); t.hidden = false; t.textContent = "👤 " + a.nombre.split(" ")[0];
  history.replaceState(null, "", `?a=${a.id}`);
  vista("atleta");
  pintarAtleta();
  publicar(a); // mantiene su enlace al día (en segundo plano)
}

function pintarAtleta() {
  const a = actual, h = hoy();
  const prox = (a.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
  $("#atleta-cab").innerHTML = `
    <div class="ac-top">
      <div><h2>${esc(a.nombre)}</h2>
      <div class="sub">${esc(OBJ[a.objetivo])} · ${esc(a.nivel)} · ${a.edad} años · ${a.peso} kg</div>
      ${prox ? `<div class="sub">🏁 Próxima: <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b> · ${fechaCorta(prox.fecha)} · faltan ${diasEntre(h, prox.fecha)} días</div>` : ""}</div>
      <button class="btn sec mini" data-acc="ficha">✎ Ficha</button>
    </div>
    ${htmlAlertas(a)}
    ${htmlNovedades(a)}
    <div class="enlace">
      <span class="lbl">Su enlace</span>
      <code>${A.nube ? esc(enlace(a)) : "Disponible al conectar Firebase"}</code>
      ${A.nube ? `<div class="small">${htmlVisitas(a)}</div>` : ""}
      ${A.nube ? `<div class="small" id="estado-enlace">${a._pub ? (a._pub.ok ? "✅ Al día: ve lo último que has guardado" : `⚠️ No se ha podido actualizar (${esc(a._pub.err)})`) : "⏳ Actualizando…"}</div>` : ""}
      <div class="fila">
        <button class="btn pri mini" data-acc="copiar-enlace" ${A.nube ? "" : "disabled"}>🔗 Copiar enlace</button>
        <button class="btn sec mini" data-acc="compartir" ${A.nube ? "" : "disabled"}>${a.telefono ? "💬 Enviar por WhatsApp" : "📤 Enviar"}</button>
        <a class="btn sec mini" href="${A.nube ? esc(enlace(a)) + "&yo=1" : "#"}" target="_blank" rel="noopener" ${A.nube ? "" : 'aria-disabled="true"'}>👁️ Ver como él</a>
        ${a.telefono && A.nube ? `<button class="btn sec mini" data-acc="avisar">📣 Avisar por WhatsApp</button>` : ""}
        ${A.nube ? `<button class="btn sec mini" data-acc="aviso-movil">🔔 Avisar al móvil</button>` : ""}
      </div>
    </div>`;
  $$("#subtabs [data-sub]").forEach(b => b.setAttribute("aria-selected", b.dataset.sub === sub));
  { const n = sinLeerEnt(a._aportes).length, b = $('#subtabs [data-sub="chat"]'); if (b) b.innerHTML = `💬 Chat${n ? ` <span class="badge">${n}</span>` : ""}`; }
  const conSemana = sub === "semana" || sub === "menu";
  $("#weeknav").hidden = !conSemana;
  if (conSemana) {
    const snap = a.semanas[lunesVista];
    $("#weeknav").innerHTML = `
      <button class="icon-btn" data-acc="sem-ant" aria-label="Semana anterior">‹</button>
      <div class="c"><b>${rangoSemana(lunesVista)}</b><span>${lunesVista === lunesDe(h) ? "Esta semana" : lunesVista > lunesDe(h) ? `Dentro de ${diasEntre(lunesDe(h), lunesVista) / 7} sem.` : "Pasada"}${snap?.editada ? " · con cambios a mano" : ""}</span></div>
      <button class="icon-btn" data-acc="sem-sig" aria-label="Semana siguiente">›</button>
      <div class="wn-acc">
        <button class="btn sec mini" data-acc="hoy">Hoy</button>
        <button class="btn sec mini" data-acc="rehacer">↻ Rehacer semana</button>
        <button class="btn sec mini" data-acc="imprimir">🖨️ PDF</button>
        <button class="btn sec mini" data-acc="msg-semana">💬 Mensaje${claveClaude() ? " / 🤖 Análisis" : ""}</button>
        <button class="btn sec mini" data-acc="guardar-st">⭐ Guardar semana tipo</button>
        <button class="btn sec mini" data-acc="elegir-st">📋 Aplicar semana tipo</button>
      </div>`;
  }
  const el = $("#sub");
  if (sub === "semana" || sub === "menu") {
    const snap = a.semanas[lunesVista];
    if (!snap) { el.innerHTML = `<div class="panel vacio"><p>Esta semana no tiene plan.</p><button class="btn pri" data-acc="generar">Generar esta semana</button></div>`; return; }
    const regs = {};
    (a._aportes || []).filter(x => x.tipo === "sesion" && x.lunes === lunesVista).forEach(x => { regs[x.sesId] = x; });
    el.innerHTML = sub === "semana"
      ? htmlValoracion(a, lunesVista) + htmlCabSemana(snap) + snap.dias.map((_, i) => htmlDia(snap, i, true, { regs, acts: a.actividades || [] })).join("")
      : snap.dias.map((_, i) => htmlMenuDia(snap, i, true)).join("") + `<p class="aviso">Menú orientativo calculado según la carga de cada día. No sustituye a un dietista-nutricionista.</p>`;
  } else if (sub === "carreras") pintarCarreras();
  else if (sub === "plan") pintarPlan();
  else if (sub === "progreso") el.innerHTML = `<div class="fila inf-bot"><button class="btn pri mini" data-acc="informe">📄 Informe del mes (PDF)</button></div>` + htmlPrediccion(predDe(a), calcZonas(a), prox, true) + htmlCarga(cargaDe(a)) + htmlBienTrainer(a) + htmlZapasTrainer(a) + htmlProgreso(calcProgreso({ semanas: a.semanas, aportes: a._aportes || [], actividades: a.actividades || [] }))
    + (htmlActividades((a.actividades || []).filter(x => x.fecha >= sumaDias(hoy(), -84) && ["run", "bike", "swim", "fuerza"].includes(x.dep)), "Sus actividades (12 semanas)") || `<p class="muted small">Sin actividades: súbelas en «Datos» o pídele que suba el archivo de su reloj al registrar cada entreno.</p>`);
  else if (sub === "datos") pintarDatos();
  else if (sub === "chat") pintarChat();
  else if (sub === "asistente") pintarAsistente();
  else if (sub === "resumen") el.innerHTML = htmlResumen(a);
  else if (sub === "zonas") el.innerHTML = `<article class="dia zonas">${htmlZonas(calcZonas(a))}</article>${htmlFuentes(a)}`;
}

/* ---------------- Resultados de carrera: actualizan sus marcas ---------------- */
async function procesarResultados(a) {
  let cambia = false;
  for (const r of (a._aportes || []).filter(x => x.tipo === "resultado" && x.tiempo)) {
    const c = (a.carreras || []).find(x => x.id === r.carreraId);
    if (c && c.resultado !== r.tiempo) { c.resultado = r.tiempo; c.puesto = r.puesto || ""; cambia = true; }
    const k = r.prueba, seg = parseTiempo(r.tiempo);
    if (!["5k", "10k", "media", "maraton"].includes(k) || !seg) continue;
    const ant = parseTiempo(a.marcas?.[k]);
    if (!ant || seg < ant) {
      a.marcas = { ...(a.marcas || {}), [k]: r.tiempo };
      if (k !== "10k" && a.marcas["10k"] && parseTiempo(a.marcas["10k"]) > seg * Math.pow(10 / { "5k": 5, media: 21.0975, maraton: 42.195 }[k], 1.06) * 1.03) delete a.marcas["10k"]; // la marca nueva manda
      cambia = true; toast(`🏅 Nueva marca de ${PRUEBAS[k]}: ${r.tiempo}. Ritmos recalculados.`);
    }
  }
  if (cambia) { await A.guardarFicha(a); await actualizarFuturas(a); await publicar(a); }
}

/* ---------------- Resumen 360 del deportista ---------------- */
function lineaTendencia(vals, w = 260, h = 46) {
  if (vals.length < 2) return "";
  const ys = vals.map(v => v[1]), mn = Math.min(...ys), mx = Math.max(...ys), r = Math.max(1, mx - mn);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 4 - (v[1] - mn) / r * (h - 8)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" class="tend"><polyline points="${pts}"/></svg>`;
}
function htmlResumen(a) {
  const h = hoy(), Z = calcZonas(a), C = cargaDe(a), pr = predDe(a);
  const prog = calcProgreso({ semanas: a.semanas, aportes: a._aportes || [], actividades: a.actividades || [], n: 5 }).slice(0, 4);
  const plan = prog.reduce((t, x) => t + x.sesPlan, 0), hechas = prog.reduce((t, x) => t + x.sesHechas, 0);
  const km4 = prog.reduce((t, x) => t + x.km, 0) / 4, h4 = prog.reduce((t, x) => t + x.hechoMin, 0) / 4 / 60;
  const bs = bienestares(a), b7 = bs.filter(x => x.fecha >= sumaDias(h, -6));
  const bMed = b7.length ? Math.round(b7.reduce((t, x) => t + (puntuarBien(x) || 0), 0) / b7.length) : null;
  const fcs = bs.filter(x => +x.fcRep).slice(0, 28).reverse(), pesos = bs.filter(x => +x.peso).slice(0, 60).reverse();
  const regs = (a._aportes || []).filter(x => x.tipo === "sesion" && x.lunes).sort((x, y) => (y.cuando || "").localeCompare(x.cuando || ""));
  const rpes = regs.slice(0, 8).map(x => +x.rpe).filter(Boolean);
  const ult = regs[0] ? sumaDias(regs[0].lunes, regs[0].dia || 0) : null;
  const v = visitas(a);
  const prox = (a.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
  const pv = prox ? prevision(prox, Z, pr) : null;
  const zs = zapatillas(a).filter(z => !z.hasta);
  const k = (val, txt, cls = "") => `<div class="r-kpi ${cls}"><b>${val}</b><span>${txt}</span></div>`;
  const sinLeer = sinLeerEnt(a._aportes).length;
  return `${htmlAlertas(a) ? `<article class="dia"><div class="dia-cab"><h3>⚠️ Avisos</h3></div>${htmlAlertas(a)}</article>` : ""}
    <article class="dia resumen360"><div class="dia-cab"><h3>📊 ${esc(a.nombre.split(" ")[0])} de un vistazo</h3>${claveClaude() ? `<button class="btn sec mini" data-acc="ia-todo">🤖 Análisis completo</button>` : ""}</div>
    <div id="ia-todo-res"></div>
    <h4 class="r-sec">Entrenamiento (últimas 4 semanas)</h4>
    <div class="r-kpis">
      ${k(plan ? Math.round(hechas / plan * 100) + " %" : "—", `cumplimiento (${hechas}/${plan})`, plan ? (hechas / plan >= 0.8 ? "ok" : hechas / plan >= 0.6 ? "ojo" : "mal") : "")}
      ${k(Math.round(km4) + " km", "por semana corriendo")}
      ${k(String(Math.round(h4 * 10) / 10).replace(".", ",") + " h", "por semana")}
      ${k(rpes.length ? String(Math.round(rpes.reduce((t, x) => t + x, 0) / rpes.length * 10) / 10).replace(".", ",") : "—", "esfuerzo medio (RPE) últimos entrenos")}
      ${k(ult ? (diasEntre(ult, h) === 0 ? "hoy" : `hace ${diasEntre(ult, h)} d`) : "—", "último entreno registrado", ult && diasEntre(ult, h) > 5 ? "ojo" : "")}
      ${k(v ? hace(v.ultima) : "nunca", `última visita${v ? ` · ${v.n} en total` : ""}`)}
    </div>
    ${C ? `<h4 class="r-sec">Forma y carga</h4><div class="r-kpis">
      ${k(C.ctl, `forma ${C.tendencia > 0 ? "▲" : C.tendencia < 0 ? "▼" : ""}${C.tendencia ? Math.abs(C.tendencia) : ""}`)}${k(C.atl, "fatiga")}${k((C.tsb > 0 ? "+" : "") + C.tsb, "frescura", C.tsb < -30 ? "mal" : C.tsb < -10 ? "ojo" : "ok")}
      ${C.acwr ? k(String(C.acwr).replace(".", ","), "ratio de carga", C.acwr > 1.5 ? "mal" : C.acwr > 1.3 || C.acwr < 0.8 ? "ojo" : "ok") : ""}
    </div>` : ""}
    <h4 class="r-sec">Cómo está</h4><div class="r-kpis">
      ${k(bMed != null ? bMed + "/100" : "—", `bienestar 7 días${b7.length ? ` (${b7.length} registros)` : ""}`, bMed == null ? "" : nivelBien(bMed))}
      ${k(b7.filter(x => x.dolor).length || "0", "días con dolor (7 d)", b7.some(x => x.dolor) ? "mal" : "")}
      ${fcs.length ? `<div class="r-kpi"><b>${fcs[fcs.length - 1].fcRep} ppm</b><span>pulso en reposo</span>${lineaTendencia(fcs.map(x => [x.fecha, +x.fcRep]))}</div>` : ""}
      ${pesos.length ? `<div class="r-kpi"><b>${String(pesos[pesos.length - 1].peso).replace(".", ",")} kg</b><span>peso${pesos.length > 1 ? ` (${(pesos[pesos.length - 1].peso - pesos[0].peso >= 0 ? "+" : "") + String(Math.round((pesos[pesos.length - 1].peso - pesos[0].peso) * 10) / 10).replace(".", ",")} kg)` : ""}</span>${lineaTendencia(pesos.map(x => [x.fecha, +x.peso]))}</div>` : ""}
      ${zs.map(z => { const km = kmZapa(a, z); return k(km + " km", "👟 " + esc(z.nombre), km >= 800 ? "mal" : km >= 600 ? "ojo" : ""); }).join("")}
    </div>
    <h4 class="r-sec">Rendimiento</h4><div class="r-kpis">
      ${pr ? k(fmtHoras(pr.tiempos["5k"]), "5K previsto (llano)") + k(fmtHoras(pr.tiempos["10k"]), `10K previsto · VDOT ${String(pr.vdot).replace(".", ",")}`) : ""}
      ${prox ? k(`${diasEntre(h, prox.fecha)} d`, `hasta ${esc(prox.nombre)}`) : ""}
      ${pv && !pv.falta && pv.real ? k(fmtHoras(pv.total), `previsión ${esc(prox.nombre)}${pv.obj ? ` · objetivo ${fmtHoras(pv.obj)}` : ""}`, pv.obj ? (pv.total <= pv.obj ? "ok" : (pv.total - pv.obj) / pv.km <= 4 ? "ojo" : "mal") : "") : ""}
    </div>
    <div class="fila r-acc">${sinLeer ? `<button class="btn pri mini" data-sub="chat">💬 ${sinLeer} mensaje${sinLeer > 1 ? "s" : ""} sin leer</button>` : `<button class="btn sec mini" data-sub="chat">💬 Escribirle</button>`}<button class="btn sec mini" data-sub="semana">📅 Ver su semana</button><button class="btn sec mini" data-sub="progreso">📈 Progreso</button></div>
    </article>`;
}

/* ---------------- Asistente (Claude cambia el plan por ti) ---------------- */
const conversaciones = {}; // por deportista: [{ role, content, prop?, estado? }]
function pintarAsistente() {
  const a = actual, c = conversaciones[a.id] || [];
  const ejemplos = ["Esta semana solo puede entrenar lunes y martes: métele carrera esos dos días y quítale la fuerza", "Bájale un 20 % el volumen de la semana que viene, va muy cargado", "Sus ritmos le salen rápidos: ponlos 5 segundos más lentos", "Cámbiale el menú a sin lactosa y con 4 comidas", "No tiene cinta: quítale los ritmos de cinta"];
  $("#sub").innerHTML = `<article class="dia asist"><div class="dia-cab"><h3>🤖 Asistente para ${esc(a.nombre.split(" ")[0])}</h3>${c.length ? `<button class="btn sec mini" data-acc="asist-borrar">Nueva conversación</button>` : ""}</div>
    ${claveClaude() ? "" : `<p class="alerta">Necesitas tu clave de Claude: ponla en Herramientas → Claude.</p>`}
    <div class="chat-hilo" id="asist-hilo">${c.length ? c.map((m, i) => `<div class="burbuja ${m.role === "user" ? "mia" : "suya"}">${esc(m.content).replace(/\n/g, "<br>")}${m.prop ? htmlPropuesta(m.prop, i, m.estado === "aplicada") : ""}${m.estado === "descartada" ? `<div class="small muted">Descartado</div>` : ""}</div>`).join("")
      : `<div class="chat-vacio">Dime qué quieres cambiarle y lo preparo para que lo apruebes. Por ejemplo:<div class="ej-asist">${ejemplos.map(e => `<button class="pill" data-acc="asist-ej">${esc(e)}</button>`).join("")}</div></div>`}</div>
    <div class="chat-caja"><div class="chat-fila"><textarea id="asist-txt" rows="2" placeholder="Ej.: esta semana solo puede el lunes y el martes…"></textarea><button class="btn pri" data-acc="asist-enviar" aria-label="Enviar">➤</button></div></div>
  </article>`;
  const h = $("#asist-hilo"); h.scrollTop = h.scrollHeight;
}
async function enviarAsistente(a, texto) {
  if (!texto) return;
  const c = conversaciones[a.id] = conversaciones[a.id] || [];
  c.push({ role: "user", content: texto });
  pintarAsistente();
  $("#asist-hilo").insertAdjacentHTML("beforeend", `<div class="burbuja suya pensando">🤖 Pensando…</div>`);
  try {
    const { texto: t, propuesta } = await preguntar(c.filter(m => m.role === "user" || m.content).map(m => ({ role: m.role, content: m.content })), ctxAsistente(a, calcZonas(a)));
    c.push({ role: "assistant", content: t || propuesta?.resumen || "Hecho.", prop: propuesta });
  } catch (e) { c.push({ role: "assistant", content: "⚠️ " + e.message }); }
  pintarAsistente();
}
/** Ejecuta las acciones aprobadas. Devuelve un resumen de lo hecho. */
async function aplicarAcciones(a, acciones) {
  const hecho = [], tocadas = new Set();
  const semana = l => { if (!a.semanas[l]) a.semanas[l] = generarSemana(a, l); return a.semanas[l]; };
  for (const x of acciones) {
    const l = lunesDeSemana(x.semana);
    if (x.tipo === "disponibilidad_semana" && x.dias?.length) {
      a.dispSemana = { ...(a.dispSemana || {}), [l]: { dias: x.dias, max: x.minutos || null } };
      a.semanas[l] = generarSemana(a, l); tocadas.add(l); hecho.push(`semana del ${l} rehecha con ${x.dias.map(d => DIAS[d]).join(" y ")}`);
    } else if (x.tipo === "quitar_sesiones") {
      const sn = semana(l); let n = 0;
      sn.dias.forEach((d, i) => { const antes = d.ses.length; d.ses = d.ses.filter(y => !(x.sesion_id ? y.id === x.sesion_id : (!x.deporte || y.dep === x.deporte) && (!x.dias?.length || x.dias.includes(i)))); n += antes - d.ses.length; });
      if (n) { sn.editada = true; tocadas.add(l); hecho.push(`${n} sesión${n > 1 ? "es" : ""} quitada${n > 1 ? "s" : ""}`); }
    } else if (x.tipo === "cambiar_sesion" && x.sesion_id) {
      const sn = semana(l);
      for (let i = 0; i < 7; i++) {
        const k = sn.dias[i].ses.findIndex(y => y.id === x.sesion_id); if (k < 0) continue;
        const y = sn.dias[i].ses[k];
        if (x.titulo) y.t = x.titulo; if (x.minutos) y.min = x.minutos; if (x.pasos?.length) y.p = x.pasos; if (x.nota != null) y.n = x.nota;
        if (x.titulo || x.minutos || x.pasos?.length) { y.c = null; y.est = null; y.tr = null; }
        y.editada = true;
        if (x.dia != null && x.dia !== i) { sn.dias[i].ses.splice(k, 1); sn.dias[x.dia].ses.push(y); }
        sn.editada = true; tocadas.add(l); hecho.push(`sesión «${y.t}» cambiada`); break;
      }
    } else if (x.tipo === "anadir_sesion") {
      const sn = semana(l), y = { ...sesionVacia(x.deporte || "run"), t: x.titulo || "Entreno", min: x.minutos || 45, p: x.pasos || [], n: x.nota || "" };
      if (y.dep === "fuerza") y.tipo = "fuerza"; else y.tipo = y.min >= 90 ? "largo" : "suave";
      sn.dias[x.dia ?? 0].ses.push(y); sn.editada = true; tocadas.add(l); hecho.push(`añadida «${y.t}» el ${DIAS[x.dia ?? 0]}`);
    } else if (x.tipo === "volumen_semana" && x.factor) {
      a.ajustes = { ...(a.ajustes || {}), [l]: Math.round(x.factor * 100) / 100 };
      a.semanas[l] = generarSemana(a, l); tocadas.add(l); hecho.push(`volumen de la semana del ${l} al ${Math.round(x.factor * 100)} %`);
    } else if (x.tipo === "ajuste_ritmos" && x.segundos != null) {
      a.ajusteRitmos = Math.max(-30, Math.min(30, x.segundos)); hecho.push(`ritmos ajustados ${a.ajusteRitmos > 0 ? "+" : ""}${a.ajusteRitmos} s/km`);
      a._rehacerFuturas = true;
    } else if (x.tipo === "rehacer_semana") {
      a.semanas[l] = generarSemana(a, l); tocadas.add(l); hecho.push(`semana del ${l} rehecha`);
    } else if (x.tipo === "menu") {
      if (x.dieta) a.dieta = x.dieta; if (x.comidas) a.comidas = x.comidas;
      if (x.sin_gluten != null) a.sinGluten = x.sin_gluten; if (x.sin_lactosa != null) a.sinLactosa = x.sin_lactosa;
      for (const lm of [lunesDe(hoy()), sumaDias(lunesDe(hoy()), 7)]) {
        const sn = a.semanas[lm]; if (!sn) continue;
        if (x.nuevo_menu) sn.dias.forEach((d, i) => { if (!x.dias?.length || x.dias.includes(i)) d.menuVar = (d.menuVar || 0) + 1; });
        recalcular(a, sn); tocadas.add(lm);
      }
      hecho.push("menú actualizado");
    } else if (x.tipo === "usa_cinta") {
      a.usaCinta = !!x.valor; hecho.push(x.valor ? "con ritmos de cinta" : "sin cinta: todo en min/km");
    } else if (x.tipo === "mensaje_deportista" && x.texto) {
      const id = idMensaje(), m = { tipo: "mensaje", de: "entrenador", texto: x.texto, t: new Date().toISOString(), leido: false };
      try { await A.guardarAporte(a.token, id, m); (a._aportes = a._aportes || []).push({ ...m, id }); avisarDeportista(a, "💬 Mensaje de tu entrenador", x.texto.slice(0, 300)); hecho.push("mensaje enviado"); } catch (e) { hecho.push("⚠️ no se pudo enviar el mensaje"); }
    }
  }
  for (const l of tocadas) { recalcular(a, a.semanas[l]); await A.guardarSemana(a, a.semanas[l]); }
  await A.guardarFicha(a);
  if (a._rehacerFuturas) { delete a._rehacerFuturas; await actualizarFuturas(a); for (const l of [lunesDe(hoy()), sumaDias(lunesDe(hoy()), 7)]) if (a.semanas[l]) { refrescarRitmos(a, a.semanas[l]); await A.guardarSemana(a, a.semanas[l]); } }
  await publicar(a);
  return hecho;
}

/* ---------------- Chat ---------------- */
async function pintarChat() {
  const a = actual, el = $("#sub");
  el.innerHTML = `<article class="dia chat"><div class="dia-cab"><h3>💬 Chat con ${esc(a.nombre.split(" ")[0])}</h3><button class="btn sec mini" data-acc="chat-recargar">↻</button></div>
    <div class="chat-hilo" id="chat-hilo">${htmlHilo(a._aportes, "entrenador", a.nombre)}</div>${htmlCaja()}</article>
    ${A.nube ? "" : `<p class="aviso">Sin conectar Firebase los mensajes solo se guardan en este navegador.</p>`}`;
  const hilo = $("#chat-hilo"); hilo.scrollTop = hilo.scrollHeight;
  const pend = sinLeerEnt(a._aportes);
  if (pend.length) {
    for (const m of pend) { m.visto = true; try { await A.marcarAporte(a.token, m.id, { visto: true }); } catch (e) { } }
    pintarLista();
    const b = $('#subtabs [data-sub="chat"]'); if (b) b.textContent = "💬 Chat";
  }
}
async function enviarMensaje(a) {
  const t = $("#chat-txt").value.trim(); if (!t) return;
  const id = idMensaje(), m = { tipo: "mensaje", de: "entrenador", texto: t, t: new Date().toISOString(), leido: false };
  try { await A.guardarAporte(a.token, id, m); } catch (e) { return toast("No se ha podido enviar: " + (e.code || e.message)); }
  (a._aportes = a._aportes || []).push({ ...m, id, cuando: m.t });
  avisarDeportista(a, `💬 Mensaje de ${ajustes.presentacion?.nombre ? ajustes.presentacion.nombre.split(" ")[0] : "tu entrenador"}`, t.slice(0, 300));
  pintarChat();
  toast("Enviado");
}

/* ---------------- Informe mensual ---------------- */
function dialogoInforme(a) {
  const ms = ultimosMeses(6), def = new Date().getDate() <= 7 ? ms[1] : ms[0];
  dialogo(`<h3>📄 Informe del mes</h3>
    <label>Mes<select id="inf-mes">${ms.map(m => `<option value="${m}" ${m === def ? "selected" : ""}>${nombreMes(m)}</option>`).join("")}</select></label>
    <label>Tu valoración (sale en el informe)<textarea id="inf-com" rows="5" placeholder="Qué ha ido bien, qué mejorar y el objetivo del mes que viene…"></textarea></label>
    ${claveClaude() ? `<button class="btn sec mini" data-acc="ia-informe">🤖 Redactar con Claude</button>` : ""}
    <p class="small">Se abre la ventana de imprimir: elige <b>«Guardar como PDF»</b> y luego mándaselo por WhatsApp o correo.</p>
    <div class="fila"><button class="btn sec" data-acc="cerrar-dlg">Cancelar</button><button class="btn pri" data-acc="crear-informe">Crear PDF</button></div>`);
}
function datosInforme(a, mes, comentario = "") {
  const Z = calcZonas(a);
  const carga = calcCarga({ semanas: a.semanas || {}, aportes: a._aportes || [], actividades: a.actividades || [], Z: { fcmax: Z.fcmax, fcrep: Z.fcrep }, mujer: a.sexo === "m", dias: 200 });
  return { a: { ...a, _objetivoTxt: OBJ[a.objetivo] }, mes, carga, pred: predDe(a), entrenador: ajustes.presentacion?.nombre || "", comentario };
}
function crearInforme(a) {
  const mes = $("#inf-mes").value, com = $("#inf-com").value.trim();
  let cont = $("#informe");
  if (!cont) { cont = document.createElement("div"); cont.id = "informe"; document.body.append(cont); }
  cont.innerHTML = htmlInforme(datosInforme(a, mes, com));
  $("#dlg-gen").close();
  document.body.classList.add("imprime-informe");
  const fin = () => { document.body.classList.remove("imprime-informe"); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  const titulo = document.title; document.title = `Informe ${a.nombre} ${nombreMes(mes)}`;
  setTimeout(() => { window.print(); document.title = titulo; setTimeout(fin, 1500); }, 300);
}

/* ---------------- Valoración semanal y ajuste ---------------- */
const CARGA_PIDE = { mas: "Quiere más carga", igual: "Seguir igual", menos: "Quiere menos carga" };
function htmlValoracion(a, lunes) {
  const v = (a._aportes || []).find(x => x.tipo === "semana" && x.lunes === lunes);
  if (!v) return "";
  const sig = sumaDias(lunes, 7), aj = a.ajustes?.[sig];
  const sugerido = v.molestias || v.sensacion === "excesiva" || v.carga === "menos" ? 0.85 : (v.sensacion === "muy_facil" || v.sensacion === "facil") && v.carga === "mas" ? 1.1 : 1;
  const b = (f, t) => `<button class="btn ${aj === f ? "pri" : "sec"} mini" data-acc="ajuste" data-f="${f}">${t}${f === sugerido ? " ★" : ""}</button>`;
  return `<article class="dia valoracion">
    <div class="dia-cab"><h3>📝 Su valoración de la semana</h3><span class="carga ${v.sensacion === "excesiva" || v.sensacion === "dura" ? "alta" : v.sensacion === "bien" ? "media" : "baja"}">${SENS_TXT[v.sensacion] || "—"}</span></div>
    <p>${CARGA_PIDE[v.carga] || ""}${v.molestias ? ` · <b class="txt-alerta">⚠️ Molestias${v.molestiasTxt ? `: ${esc(v.molestiasTxt)}` : ""}</b>` : ""}</p>
    ${v.texto ? `<p>“${esc(v.texto)}”</p>` : ""}
    <div class="fila"><span class="small">Semana siguiente:</span>${b(0.85, "−15 %")}${b(1, "Igual")}${b(1.1, "+10 %")}</div>
    <small>★ = lo que sugiere su valoración. Al elegir, se rehace la semana siguiente (si no la has cambiado a mano).${v.molestias ? " Con molestias, valora también cambiar sesiones a bici, natación o descanso." : ""}</small>
  </article>`;
}

/* ---------------- Plan a largo plazo (mín. 20 semanas, o hasta su carrera principal) ---------------- */
function semanasPlan(a) {
  const l0 = lunesDe(hoy());
  const A_ = (a.carreras || []).filter(c => c.prioridad === "A" && c.fecha >= hoy()).sort((x, y) => x.fecha.localeCompare(y.fecha)).pop();
  const hastaA = A_ ? Math.ceil(diasEntre(l0, A_.fecha) / 7) + 2 : 0;
  return Math.min(40, Math.max(20, hastaA));
}
const COLOR_FASE = { base: "#3DFF8B", construccion: "#00E1FF", especifico: "#FF2E63", puesta: "#FFB000", carrera: "#FF3DF5", descarga: "#8A8D93", iniciacion: "#3DFF8B", readaptacion: "#9D7BFF", progresion: "#00E1FF", consolidacion: "#FF8A00", acumulacion: "#00E1FF", intensificacion: "#FF2E63" };
async function pintarPlan() {
  const a = actual, l0 = lunesDe(hoy()), N = semanasPlan(a);
  // las semanas que falten se generan solas
  let nuevas = 0;
  for (let i = 0; i < N; i++) { const l = sumaDias(l0, 7 * i); if (!a.semanas[l]) { a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); nuevas++; } }
  if (nuevas) toast(`${nuevas} semanas nuevas generadas`);
  const ls = Array.from({ length: N }, (_, i) => sumaDias(l0, 7 * i)), mx = Math.max(60, ...ls.map(l => a.semanas[l]?.total || 0));
  const fases = [...new Map(ls.map(l => a.semanas[l]?.fase).filter(Boolean).map(f => [f.clave, f.n])).entries()];
  const graf = `<div class="plan-graf">${ls.map((l, i) => { const s = a.semanas[l], c = a.carreras?.find(x => x.fecha >= l && x.fecha <= sumaDias(l, 6) && x.prioridad !== "C");
    return `<button class="pg-b" data-acc="ir-semana" data-l="${l}" title="${rangoSemana(l)} · ${s ? esc(s.fase.n) + " · " + fmtMin(s.total) : ""}"><i style="height:${s ? Math.max(6, s.total / mx * 100) : 2}%;background:${COLOR_FASE[s?.fase?.clave] || "#555"}"></i>${c ? `<em>🏁</em>` : ""}<small>${i % 4 === 0 ? fechaCorta(l).replace(/^\D+ /, "") : ""}</small></button>`; }).join("")}</div>
    <div class="leyenda-f">${fases.map(([k, n]) => `<span><i style="background:${COLOR_FASE[k] || "#555"}"></i>${esc(n)}</span>`).join("")}</div>`;
  const filas = ls.map((l, i) => {
    const s = a.semanas[l];
    const cs = (a.carreras || []).filter(c => c.fecha >= l && c.fecha <= sumaDias(l, 6));
    const claves = s ? s.dias.flatMap(d => d.ses).filter(x => ["largo", "calidad", "competicion", "transicion", "test"].includes(x.tipo)).map(x => x.t).slice(0, 3).join(" · ") : "";
    return `<tr class="${i < 2 ? "visible" : ""}"><td><button class="link" data-acc="ir-semana" data-l="${l}">${rangoSemana(l)}</button>${i < 2 ? ' <span class="badge-vis" title="La ve el deportista">👁️</span>' : ""}</td>
      <td><i class="fase-p" style="background:${COLOR_FASE[s?.fase?.clave] || "#555"}"></i>${s ? esc(s.fase.n) : "—"}${s?.editada ? " ✎" : ""}${a.ajustes?.[l] && a.ajustes[l] !== 1 ? ` <small>(${a.ajustes[l] > 1 ? "+" : "−"}${Math.round(Math.abs(a.ajustes[l] - 1) * 100)} %)</small>` : ""}</td>
      <td>${s ? fmtMin(s.total) : "—"}</td><td class="small">${cs.map(c => `🏁 ${esc(c.nombre)} (${c.prioridad})`).join(" ")}${cs.length && claves ? "<br>" : ""}${esc(claves)}</td></tr>`;
  });
  $("#sub").innerHTML = `<article class="dia plan12">
    <div class="dia-cab"><h3>Plan a ${N} semanas</h3></div>
    <p class="ayuda">Tu planificación a largo plazo (mínimo 20 semanas o hasta su carrera principal). Se va ajustando sola con sus registros, sus valoraciones y sus marcas: las semanas futuras que no cambies a mano se rehacen cuando cambia algo. El deportista solo ve las dos primeras (👁️).</p>
    ${graf}
    <div class="wrap"><table class="acts"><tr><th>Semana</th><th>Fase</th><th>Tiempo</th><th>Claves</th></tr>${filas.join("")}</table></div>
  </article>`;
}

/* ---------------- Tests de recalibración ---------------- */
async function procesarTests(a) {
  const hechos = (a.tests || []).map(t => t.id);
  for (const r of (a._aportes || []).filter(x => x.tipo === "sesion" && x.hecho !== "no" && !hechos.includes(x.id))) {
    const ses = a.semanas?.[r.lunes]?.dias?.[r.dia]?.ses?.find(s => s.id === r.sesId);
    if (ses?.tipo !== "test") continue;
    const km = r.act?.km || parseFloat(String(r.km || "5").replace(",", ".")) || 5;
    const seg = r.act?.mejores?.["5k"] || (r.act?.dur ? r.act.dur * 5 / km : r.tiempo ? parseTiempo(r.tiempo) * 5 / km : 0);
    if (!seg || seg / 5 < 170 || seg / 5 > 600) continue;
    a.tests = [...(a.tests || []), { id: r.id, fecha: sumaDias(r.lunes, r.dia), t5: Math.round(seg) }];
    const marcas = { ...(a.marcas || {}) }; // el test actualiza su 5K; el resto de marcas siguen contando
    marcas["5k"] = fmtHoras(seg); a.marcas = marcas;
    await A.guardarFicha(a);
    await actualizarFuturas(a);
    toast(`🎯 Test de 5 km: ${fmtHoras(seg)}. Ritmos actualizados y semanas rehechas.`);
  }
}

/* ---------------- Comentarios y análisis con Claude ---------------- */
function dialogo(html) { $("#gen").innerHTML = html; $("#dlg-gen").showModal(); }
const cerrarDialogo = () => $("#dlg-gen").close();
async function fotosDe(a, r) {
  const imgs = [];
  if (r.img) imgs.push(r.img);
  for (const id of (r.fotos || [])) { try { const f = await A.leerFoto(a.token, id); if (f) imgs.push(f); } catch (e) { } }
  return imgs;
}
function contextoDeportista(a) {
  const Z = calcZonas(a);
  return `Deportista: ${a.nombre}, ${a.edad} años, ${a.sexo === "m" ? "mujer" : "hombre"}, nivel ${a.nivel}, objetivo ${OBJ[a.objetivo]}.
Zonas de ritmo (min/km): ${Z.ritmos ? Z.ritmos.map((r, i) => `Z${i + 1} ${fmtRitmo(r[0])}-${fmtRitmo(r[1])}`).join(", ") : "sin ritmos"}${Z.ritmoEstimado ? " (estimados)" : ""}.
Zonas de pulso (ppm): ${Z.fc.map((r, i) => `Z${i + 1} ${r[0]}-${r[1]}`).join(", ")}.`;
}
let comentando = null;
function abrirComentario(sesId) {
  const snap = actual.semanas[lunesVista];
  const dia = snap.dias.findIndex(d => d.ses.some(s => s.id === sesId));
  const s = snap.dias[dia].ses.find(x => x.id === sesId);
  const r = (actual._aportes || []).find(x => x.tipo === "sesion" && x.lunes === lunesVista && x.sesId === sesId);
  comentando = { dia, s, r };
  dialogo(`<h3>💬 Comentario para ${esc(actual.nombre.split(" ")[0])}</h3>
    <p class="small">${DIAS[dia]} · ${esc(s.t)}</p>
    <textarea id="com-txt" rows="5" placeholder="Ej.: ¡Muy bien! Pero los rodajes suaves, más despacio: 5:40 como mínimo.">${esc(s.coment || "")}</textarea>
    <div id="com-ia"></div>
    <div class="acciones fila">
      ${claveClaude() ? `<button class="btn sec mini" data-acc="ia-sesion">🤖 Analizar con Claude</button>` : `<span class="small muted">Con tu clave de Claude (Herramientas → Claude) puede redactarlo analizando sus capturas.</span>`}
      <span class="sp"></span><button class="btn sec mini" data-acc="cerrar-dlg">Cancelar</button><button class="btn pri mini" data-acc="guardar-coment">Guardar</button>
    </div>`);
}
async function iaSesion() {
  const { dia, s, r } = comentando, a = actual;
  $("#com-ia").innerHTML = `<p class="cargando">🤖 Analizando${(r.fotos?.length || r.img) ? " sus capturas" : ""}…</p>`;
  try {
    const imgs = await fotosDe(a, r);
    const datos = `${contextoDeportista(a)}
SESIÓN PLANIFICADA (${DIAS[dia]}): ${s.t}, ${s.min} min. ${s.z || ""}
Pasos: ${(s.p || []).join(" | ")}
LO QUE HA REGISTRADO: ${{ si: "hecho", parcial: "a medias", no: "no lo hizo" }[r.hecho] || r.hecho}. Esfuerzo ${r.rpe || "?"}/10. Km ${r.km || "?"}. Tiempo ${r.tiempo || "?"}. Pulso medio ${r.fc || "?"}. Comentario: "${r.texto || ""}".
${r.act ? `Datos del archivo del reloj: ${r.act.km} km, ${fmtHoras(r.act.dur)}, pulso ${r.act.fcMed || "?"}/${r.act.fcMax || "?"}.` : ""}
${imgs.length ? `Adjunto ${imgs.length} captura(s) de su actividad.` : "Sin capturas."}`;
    const texto = await analizar(`Analiza cómo ha ido esta sesión respecto a lo planificado (ritmos, pulso, sensaciones; lee los datos de las capturas: parciales, ritmos por km, pulso, desnivel).
Responde en dos partes, con estos títulos exactos:
PARA EL DEPORTISTA: un comentario de 2-4 frases, directo y motivador, con lo que ha hecho bien y lo que debe ajustar.
PARA EL ENTRENADOR: 2-4 puntos técnicos (si iba fuera de zona, fatiga, si conviene ajustar la próxima semana).`, datos, imgs);
    const [, dep = texto, ent = ""] = /PARA EL DEPORTISTA:?\s*([\s\S]*?)\s*PARA EL ENTRENADOR:?\s*([\s\S]*)/i.exec(texto) || [];
    $("#com-txt").value = dep.trim();
    $("#com-ia").innerHTML = ent ? `<p class="small"><b>Para ti (no lo ve el deportista):</b></p><div class="ia-res">${esc(ent.trim())}</div>` : "";
  } catch (e) { $("#com-ia").innerHTML = `<p class="alerta">${esc(e.message)}</p>`; }
}
async function guardarComentario() {
  const { dia, s } = comentando, snap = actual.semanas[lunesVista];
  const x = snap.dias[dia].ses.find(y => y.id === s.id);
  x.coment = $("#com-txt").value.trim();
  await A.guardarSemana(actual, snap); await publicar(actual);
  if (x.coment) avisarDeportista(actual, `💬 Tu entrenador ha comentado «${x.t}»`, x.coment.slice(0, 300));
  cerrarDialogo(); toast("Comentario guardado: lo verá en su entreno"); pintarAtleta();
}
async function iaSemana() {
  const a = actual, snap = a.semanas[lunesVista];
  if (!snap) return;
  dialogo(`<h3>🤖 Análisis de la semana</h3><p class="cargando">Analizando su semana…</p>`);
  try {
    const regs = (a._aportes || []).filter(x => x.tipo === "sesion" && x.lunes === lunesVista);
    const val = (a._aportes || []).find(x => x.tipo === "semana" && x.lunes === lunesVista);
    const acts = (a.actividades || []).filter(x => x.fecha >= lunesVista && x.fecha <= sumaDias(lunesVista, 6));
    const imgs = [];
    for (const r of regs) { if (imgs.length >= 8) break; imgs.push(...(await fotosDe(a, r)).slice(0, 8 - imgs.length)); }
    const datos = `${contextoDeportista(a)}
SEMANA ${rangoSemana(lunesVista)} · fase ${snap.fase.n}.
PLAN: ${snap.dias.map((d, i) => `${DIAS[i]}: ${d.ses.map(s => `${s.t} (${s.min}')`).join(" + ") || "descanso"}`).join(" | ")}
REGISTROS: ${regs.map(r => `${DIAS[r.dia]} ${r.titulo || ""}: ${r.hecho}, esfuerzo ${r.rpe || "?"}, ${r.km || "?"} km, ${r.tiempo || "?"}, pulso ${r.fc || "?"}, "${r.texto || ""}"`).join(" | ") || "ninguno"}
ACTIVIDADES DEL RELOJ: ${acts.map(x => `${x.fecha} ${x.dep} ${x.km} km ${fmtHoras(x.dur)} pulso ${x.fcMed || "?"}`).join(" | ") || "ninguna"}
VALORACIÓN DEL DEPORTISTA: ${val ? `${val.sensacion}, pide ${val.carga} carga${val.molestias ? `, molestias: ${val.molestiasTxt}` : ""}. "${val.texto || ""}"` : "no ha valorado"}`;
    const texto = await analizar(`Haz un análisis de la semana: cumplimiento, si los rodajes fueron suaves de verdad, calidad de las sesiones clave y señales de fatiga.
Termina con una RECOMENDACIÓN para la semana siguiente (bajar un 15 %, mantener o subir un 10 %) y por qué, y un MENSAJE PARA EL DEPORTISTA de 2-3 frases.`, datos, imgs);
    const msg = (/MENSAJE PARA EL DEPORTISTA:?\s*([\s\S]*)$/i.exec(texto) || [])[1] || "";
    dialogo(`<h3>🤖 Análisis de la semana</h3><div class="ia-res">${esc(texto)}</div>
      <label>Mensaje que verá en su semana <textarea id="sem-msg" rows="3">${esc((msg || snap.comentSemana || "").trim())}</textarea></label>
      <div class="acciones fila"><span class="sp"></span><button class="btn sec mini" data-acc="cerrar-dlg">Cerrar</button><button class="btn pri mini" data-acc="guardar-msg-sem">Guardar mensaje</button></div>`);
  } catch (e) { dialogo(`<h3>🤖 Análisis de la semana</h3><p class="alerta">${esc(e.message)}</p><div class="acciones fila"><span class="sp"></span><button class="btn sec mini" data-acc="cerrar-dlg">Cerrar</button></div>`); }
}
function mensajeSemana() {
  const snap = actual.semanas[lunesVista];
  dialogo(`<h3>💬 Mensaje de la semana</h3><p class="small">Lo verá arriba de su semana.</p>
    <textarea id="sem-msg" rows="4">${esc(snap?.comentSemana || "")}</textarea>
    <div class="acciones fila">${claveClaude() ? `<button class="btn sec mini" data-acc="ia-semana">🤖 Analizar la semana con Claude</button>` : ""}<span class="sp"></span><button class="btn sec mini" data-acc="cerrar-dlg">Cancelar</button><button class="btn pri mini" data-acc="guardar-msg-sem">Guardar</button></div>`);
}

/* ---------------- Semanas tipo ---------------- */
function guardarSemanaTipo() {
  const snap = actual.semanas[lunesVista]; if (!snap) return;
  const nombre = prompt("Nombre de la semana tipo:", `${snap.fase.n} · ${actual.nombre.split(" ")[0]}`);
  if (!nombre) return;
  const dias = snap.dias.map(d => d.ses.map(({ id, editada, coment, ...s }) => s));
  ajustes.semanasTipo = [...(ajustes.semanasTipo || []), { nombre, dias, fecha: hoy() }];
  A.guardarAjustes(ajustes).then(() => toast(`Semana tipo «${nombre}» guardada`));
}
function elegirSemanaTipo() {
  const st = ajustes.semanasTipo || [];
  dialogo(`<h3>📋 Aplicar una semana tipo</h3>
    ${st.length ? `<p class="small">Sustituye los entrenos de esta semana (${rangoSemana(lunesVista)}). El menú se recalcula solo.</p><div class="st-lista">${st.map((x, i) => `<div class="fila"><span><b>${esc(x.nombre)}</b> <span class="small muted">${x.dias.flat().length} sesiones · ${fmtMin(x.dias.flat().reduce((t, s) => t + (+s.min || 0), 0))}</span></span><span><button class="btn pri mini" data-acc="aplicar-st" data-i="${i}">Aplicar</button> <button class="quita" data-acc="borrar-st" data-i="${i}" aria-label="Borrar">✕</button></span></div>`).join("")}</div>`
      : `<p class="muted">Aún no tienes semanas tipo. Prepara una semana como te guste y pulsa «⭐ Guardar semana tipo».</p>`}
    <div class="acciones fila"><span class="sp"></span><button class="btn sec mini" data-acc="cerrar-dlg">Cerrar</button></div>`);
}
async function aplicarSemanaTipo(i) {
  const st = (ajustes.semanasTipo || [])[i]; if (!st) return;
  const snap = actual.semanas[lunesVista] || generarSemana(actual, lunesVista);
  snap.dias.forEach((d, k) => { d.ses = (st.dias[k] || []).map(s => ({ ...JSON.parse(JSON.stringify(s)), id: uid(8), editada: true })); });
  snap.editada = true;
  recalcular(actual, snap);
  actual.semanas[lunesVista] = snap;
  await A.guardarSemana(actual, snap); await publicar(actual);
  cerrarDialogo(); toast(`Semana tipo «${st.nombre}» aplicada`); pintarAtleta();
}

/* ---------------- Novedades del deportista ---------------- */
function htmlNovedades(a) {
  const n = nuevos(a);
  if (!n.length) return "";
  const lin = n.sort((x, y) => (y.cuando || "").localeCompare(x.cuando || "")).slice(0, 6).map(x => {
    if (x.tipo === "sesion") return `<li>✅ Registró un entreno (${esc(x.dia != null ? DIAS[x.dia] : "")} ${x.lunes ? fechaCorta(sumaDias(x.lunes, x.dia || 0)) : ""})${x.texto ? `: “${esc(x.texto.slice(0, 80))}”` : ""}</li>`;
    if (x.tipo === "bienestar") { const pb = puntuarBien(x); return `<li>${nivelBien(pb) === "ok" ? "✅" : nivelBien(pb) === "ojo" ? "🟡" : "🔴"} Se levantó el ${fechaCorta(x.fecha)}: <b>${pb}/100</b>${x.dolor ? ` · 🤕 ${esc(x.dolorTxt || "dolor")}` : ""}</li>`; }
    if (x.tipo === "resultado") return `<li>🏅 <b>Resultado ${esc(x.nombre || "")}:</b> ${esc(x.tiempo || "")}${x.puesto ? ` · puesto ${esc(x.puesto)}` : ""} · ${({ genial: "🤩 genial", bien: "💪 bien", regular: "😐 regular", mal: "😣 mal" })[x.sens] || ""}${x.texto ? `: “${esc(x.texto.slice(0, 80))}”` : ""}</li>`;
    if (x.tipo === "mensaje") return `<li>💬 <b>Mensaje</b>${x.ref ? ` sobre ${esc(x.ref)}` : ""}: “${esc((x.texto || "").slice(0, 90))}” → <button class="link" data-sub="chat">responder</button></li>`;
    if (x.tipo === "material") return `<li>👟 Ha actualizado sus zapatillas → míralas en «Progreso»</li>`;
    if (x.tipo === "semana") return `<li>📝 Valoró la semana del ${fechaCorta(x.lunes)}: <b>${SENS_TXT[x.sensacion] || "—"}</b>${x.molestias ? " · ⚠️ molestias" : ""}</li>`;
    return `<li>🏁 Propone la carrera <b>${esc(x.nombre)}</b> (${fechaCorta(x.fecha)}) → mírala en «Carreras»</li>`;
  }).join("");
  return `<div class="novedades"><div class="nov-cab"><b>🔔 Novedades</b><button class="btn sec mini" data-acc="visto">Marcar como visto</button></div><ul>${lin}</ul></div>`;
}

/* =========================================================
   Herramientas: presentación, plantillas y biblioteca
   ========================================================= */
const PLANTILLAS_BASE = [
  { nombre: "Rodaje Z2 + progresivos", dep: "run", t: "Rodaje suave + progresivos", min: 30, z: "Z2", p: ["20' de rodaje en Z2", "4 progresivos de 50'' (de suave a rápido) con 1' andando o trotando entre ellos", "5' de vuelta a la calma"] },
  { nombre: "Series 6 × 1000 m", dep: "run", t: "Series 6 × 1000 m", min: 60, z: "Z4", p: ["Calentamiento 15' en Z1-Z2 + 3 progresivos", "6 × 1000 m a ritmo 10 km, recuperando 90'' trotando", "Vuelta a la calma 10' en Z1"] },
  { nombre: "Fartlek 8 × 1'", dep: "run", t: "Fartlek", min: 45, z: "Z4", p: ["Calentamiento 15' suave", "8 × (1' fuerte / 1' suave)", "Vuelta a la calma 10'"] },
  { nombre: "Cuestas 8 × 45''", dep: "run", t: "Cuestas", min: 50, z: "Z5", p: ["Calentamiento 15' suave", "8 × 45'' subiendo fuerte, bajada trotando", "Vuelta a la calma 10'"] },
  { nombre: "Tempo 3 × 10'", dep: "run", t: "Tempo", min: 60, z: "Z3-Z4", p: ["Calentamiento 15'", "3 × 10' en Z4 con 2' de trote", "Vuelta a la calma 10'"] },
  { nombre: "Tirada larga progresiva", dep: "run", t: "Tirada larga progresiva", min: 90, z: "Z2 → Z3", p: ["60' en Z2", "20' en Z3", "10' suave para terminar"], n: "Lleva agua y algo de hidratos." },
  { nombre: "Bici: sweet spot 3 × 10'", dep: "bike", t: "Sweet spot", min: 60, z: "Z3-Z4", p: ["Calentamiento 15' progresivo", "3 × 10' al 88-93 % del FTP con 5' suaves", "Vuelta a la calma 10'"] },
  { nombre: "Core exprés 20'", dep: "fuerza", t: "Core exprés", min: 20, z: "3 vueltas", p: ["3 vueltas seguidas, 1' de descanso entre vueltas"], ej: [{ n: "Plancha frontal 40''", s: "3 series" }, { n: "Plancha lateral 30''/lado", s: "3 series" }, { n: "Dead bug (10 por lado)", s: "3 series" }, { n: "Puente de glúteo", s: "3 × 15" }] },
  { nombre: "Movilidad 20'", dep: "movilidad", t: "Movilidad", min: 20, z: "Suave", p: ["Movilidad de tobillo, cadera y columna (10')", "Estiramientos suaves (10')"] }
];
const plantillas = () => [...(ajustes.plantillas || []).map(p => ({ ...p, propia: true })), ...PLANTILLAS_BASE];

function pintarHerr() {
  $$("#subherr [data-herr]").forEach(b => b.setAttribute("aria-selected", b.dataset.herr === subH));
  const el = $("#herr");
  if (subH === "plantillas") {
    el.innerHTML = `<article class="dia"><div class="dia-cab"><h3>🧩 Plantillas de sesiones</h3></div>
      <p class="ayuda">Para meter tus entrenos favoritos con un clic: en la semana de un deportista, pulsa «＋ Añadir sesión» o «✎ Cambiar» y elige la plantilla arriba. Para crear una, escribe la sesión allí y pulsa «⭐ Guardar como plantilla».</p>
      ${plantillas().map((p, i) => `<div class="plantilla"><div><b>${DEP[p.dep]?.i || ""} ${esc(p.nombre)}</b> <span class="small">· ${fmtMin(p.min)}${p.z ? " · " + esc(p.z) : ""}${p.propia ? " · tuya" : " · de serie"}</span>
        <div class="small muted">${esc((p.p || []).join(" · "))}${p.ej ? esc(" · " + p.ej.map(x => x.n).join(", ")) : ""}</div></div>
        ${p.propia ? `<button class="quita" data-acc="borrar-plantilla" data-i="${i}" aria-label="Borrar">✕</button>` : ""}</div>`).join("")}
    </article>`;
  } else if (subH === "avisos") {
    const c = ajustes.ntfy || "", pa = prefAvisos();
    el.innerHTML = `<article class="dia"><div class="dia-cab"><h3>🔔 Avisos en tu móvil</h3></div>
      <p class="ayuda">Te llega una notificación cuando tus deportistas registran un entreno, se levantan mal o con dolor, valoran la semana, ponen un resultado o te escriben. Funciona con la app gratuita <b>ntfy</b>, sin cuentas ni tarjeta.</p>
      ${c ? htmlSuscribir(c, "tú") : `<button class="btn pri" data-acc="crear-canal">Activar mis avisos</button>`}
      ${c ? `<h4 class="sep">¿De qué quieres que te avise?</h4>
      ${[["registros", "✅ Entrenos registrados"], ["bienestar", "🔴 Se levanta mal o con dolor"], ["mensajes", "💬 Mensajes"], ["resultados", "🏅 Resultados de carrera"], ["valoraciones", "📝 Valoraciones de la semana"]].map(([k, t]) => `<label class="chk"><input type="checkbox" data-aviso="${k}" ${pa[k] ? "checked" : ""}> ${t}</label>`).join("")}
      <p class="small">Tus deportistas activan sus avisos (mensajes tuyos, comentarios y recordatorio del entreno del día) desde su enlace: <b>Progreso → 🔔 Avisos en tu móvil</b>.</p>` : ""}
    </article>`;
  } else if (subH === "claude") {
    el.innerHTML = `<article class="dia"><div class="dia-cab"><h3>🤖 Análisis con Claude</h3></div>
      <p class="ayuda">Con tu clave de la API de Anthropic, Claude lee las capturas y los datos de tus deportistas y te redacta comentarios de cada entreno y análisis de cada semana (botones «💬 Comentar» y «💬 Mensaje / 🤖 Análisis» en su semana).</p>
      <ul class="usa"><li><b>La clave se guarda solo en este navegador</b>: no se sube a la nube y tus deportistas nunca la ven. En otro dispositivo tendrás que ponerla otra vez.</li>
      <li><b>Se paga por uso</b> en tu cuenta de Anthropic: analizar un entreno con capturas cuesta del orden de unos céntimos.</li>
      <li>Consigue la clave en <b>console.anthropic.com</b> → API Keys → «Create Key» (necesitas añadir saldo en Billing).</li></ul>
      <label>Clave de la API <input type="password" id="clave-claude" value="${esc(claveClaude())}" placeholder="sk-ant-…" autocomplete="off"></label>
      <div class="acciones fila"><button class="btn pri mini" data-acc="guardar-clave">Guardar</button><button class="btn sec mini" data-acc="probar-clave" ${claveClaude() ? "" : "disabled"}>Probar conexión</button>${claveClaude() ? `<button class="btn peligro mini" data-acc="borrar-clave">Quitar clave</button>` : ""}<span class="small" id="clave-res"></span></div>
    </article>`;
  } else if (subH === "biblioteca") {
    const v = ajustes.videos || {};
    el.innerHTML = `<article class="dia"><div class="dia-cab"><h3>🏋️ Biblioteca de ejercicios</h3></div>
      <p class="ayuda">Tus deportistas ven esta ficha al pulsar un ejercicio en su sesión de fuerza. Si pegas el enlace de <b>tu propio vídeo</b> (YouTube, Instagram…), verán el tuyo; si no, una búsqueda de vídeos de la técnica.</p>
      ${BIBLIO.map(x => `<div class="biblio"><b>${esc(x.n)}</b><p class="small">${esc(x.como)} <span class="txt-alerta">Ojo: ${esc(x.ojo)}</span></p>
        <input type="url" data-video="${x.id}" value="${esc(v[x.id] || "")}" placeholder="Enlace a tu vídeo (opcional)"></div>`).join("")}
      <div class="acciones"><button class="btn pri" data-acc="guardar-videos">Guardar vídeos</button></div>
    </article>`;
  } else {
    const p = ajustes.presentacion || {};
    const url = new URL("conoceme.html", location.href).href;
    el.innerHTML = `<article class="dia"><div class="dia-cab"><h3>⭐ Mi presentación</h3></div>
      <p class="ayuda">Tu página pública para que te conozcan: quién eres, cómo trabajas y cómo contactarte. Mándala a quien te pregunte o ponla en tu Instagram.</p>
      ${A.nube ? `<div class="enlace"><span class="lbl">Tu página</span><code>${esc(url)}</code>
        <div class="fila"><button class="btn pri mini" data-acc="copiar-pres">🔗 Copiar enlace</button><a class="btn sec mini" href="${esc(url)}" target="_blank" rel="noopener">👁️ Ver mi página</a></div></div>` : `<p class="alerta">La página pública funciona al conectar Firebase.</p>`}
      <form id="f-pres" class="pres" autocomplete="off">
        <div class="g2"><label>Tu nombre <input name="nombre" value="${esc(p.nombre || "")}" placeholder="Ej.: Diego Enjamio"></label>
        <label>Frase de presentación <input name="titular" value="${esc(p.titular || "")}" placeholder="Ej.: Entrenador de running y triatlón"></label></div>
        <div class="foto-pres">${p.foto ? `<img src="${p.foto}" alt="">` : ""}<label class="btn sec mini">📷 ${p.foto ? "Cambiar" : "Subir"} foto <input type="file" id="f-foto-pres" accept="image/*" hidden></label></div>
        <label>Sobre mí <textarea name="sobre" rows="4" placeholder="Tu experiencia, tus títulos, tus carreras, por qué entrenas…">${esc(p.sobre || "")}</textarea></label>
        <label>Cómo trabajo (un paso por línea) <textarea name="pasos" rows="4" placeholder="Hablamos de tu objetivo y tu disponibilidad
Analizo tus datos de Garmin, Strava o Polar
Te preparo cada semana tus entrenos y tu menú
Me cuentas cómo te ha ido y ajustamos">${esc((p.pasos || []).join("\n"))}</textarea></label>
        <label>Servicios (uno por línea: nombre | precio | descripción) <textarea name="servicios" rows="3" placeholder="Plan mensual | 40 €/mes | Entrenos y menú semanales con seguimiento
Preparación de carrera | 60 € | 12 semanas para tu objetivo">${esc((p.servicios || []).map(x => [x.n, x.precio, x.d].join(" | ")).join("\n"))}</textarea></label>
        <label>Deportes <input name="deportes" value="${esc(p.deportes || "")}" placeholder="Running, trail, bici, triatlón, fuerza"></label>
        <label>Opiniones de deportistas (una por línea: texto | nombre) <textarea name="opiniones" rows="3" placeholder="Bajé de 50 minutos en el 10K por primera vez | Laura">${esc((p.opiniones || []).map(x => [x.t, x.n].join(" | ")).join("\n"))}</textarea></label>
        <div class="g2"><label>WhatsApp <input name="telefono" type="tel" value="${esc(p.telefono || "")}" placeholder="Tu teléfono"></label>
        <label>Instagram <input name="instagram" value="${esc(p.instagram || "")}" placeholder="@tuusuario"></label>
        <label>Correo <input name="email" type="email" value="${esc(p.email || "")}"></label>
        <label>Zona <input name="zona" value="${esc(p.zona || "")}" placeholder="Ej.: Online · A Coruña"></label></div>
        <div class="acciones"><button type="submit" class="btn pri">Guardar y publicar mi página</button></div>
      </form>
    </article>`;
    $("#f-foto-pres").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try { ajustes.presentacion = { ...(ajustes.presentacion || {}), ...leerPres(), foto: await comprimirImagen(f, 700, 0.8) }; pintarHerr(); } catch (err) { toast(err.message); }
    });
    $("#f-pres").addEventListener("submit", async e => {
      e.preventDefault();
      ajustes.presentacion = { ...(ajustes.presentacion || {}), ...leerPres() };
      try {
        await A.guardarAjustes(ajustes);
        if (A.nube) await A.publicar({ token: "entrenador" }, ajustes.presentacion);
        toast(A.nube ? "Tu página está publicada" : "Guardado (se publicará al conectar Firebase)");
      } catch (err) { toast("No se ha podido guardar: " + (err.code || err.message)); }
    });
  }
}
function leerPres() {
  const f = $("#f-pres"), v = n => f.elements[n].value.trim(), lineas = n => v(n).split("\n").map(x => x.trim()).filter(Boolean);
  return {
    nombre: v("nombre"), titular: v("titular"), sobre: v("sobre"), pasos: lineas("pasos"), deportes: v("deportes"),
    servicios: lineas("servicios").map(x => { const [n, precio, d] = x.split("|").map(y => (y || "").trim()); return { n, precio, d }; }),
    opiniones: lineas("opiniones").map(x => { const [t, n] = x.split("|").map(y => (y || "").trim()); return { t, n }; }),
    telefono: v("telefono"), instagram: v("instagram").replace(/^@/, ""), email: v("email"), zona: v("zona")
  };
}
async function accionHerr(t) {
  const acc = t.dataset.acc;
  if (acc === "crear-canal") { await canalEntrenador(); for (const x of atletas.filter(x => x.token)) publicar(x); pintarHerr(); return true; }
  if (acc === "copiar-canal") { try { await navigator.clipboard.writeText(t.dataset.c); toast("Copiado"); } catch (e) { prompt("Copia el nombre del canal:", t.dataset.c); } return true; }
  if (acc === "probar-aviso") { const ok = await avisar(t.dataset.c, { titulo: "🔔 Dienjamio Entrenador", texto: "¡Funciona! Así te llegarán los avisos.", tags: ["white_check_mark"] }); toast(ok ? "Aviso enviado: debería llegarte en unos segundos" : "No se ha podido enviar (revisa la conexión)"); return true; }
  if (acc === "borrar-plantilla") {
    const p = plantillas()[+t.dataset.i]; if (!p?.propia || !confirm(`¿Borrar la plantilla «${p.nombre}»?`)) return true;
    ajustes.plantillas = (ajustes.plantillas || []).filter(x => x.nombre !== p.nombre);
    await A.guardarAjustes(ajustes); pintarHerr(); return true;
  }
  if (acc === "guardar-videos") {
    ajustes.videos = Object.fromEntries($$("[data-video]").map(i => [i.dataset.video, i.value.trim()]).filter(x => x[1]));
    await A.guardarAjustes(ajustes);
    for (const a of atletas) if (a.semanas) await publicar(a);
    toast("Vídeos guardados. Tus deportistas los verán en sus ejercicios."); return true;
  }
  if (acc === "guardar-clave") { guardarClave($("#clave-claude").value); toast("Clave guardada en este navegador"); pintarHerr(); return true; }
  if (acc === "borrar-clave") { guardarClave(""); toast("Clave quitada"); pintarHerr(); return true; }
  if (acc === "probar-clave") { $("#clave-res").textContent = "⏳ Probando…"; try { await probarClave(); $("#clave-res").textContent = "✅ Conectado"; } catch (e) { $("#clave-res").textContent = "⚠️ " + e.message; } return true; }
  if (acc === "copiar-pres") { const u = new URL("conoceme.html", location.href).href; try { await navigator.clipboard.writeText(u); toast("Enlace copiado"); } catch (e) { prompt("Copia el enlace:", u); } return true; }
  return false;
}

/* ---------------- De dónde sale cada dato ---------------- */
function htmlFuentes(a) {
  const ef = efectivo(a), H = a.hist, de = ef._de || {}, Z = calcZonas(a);
  const fila = (q, v, f, mal = false) => `<tr><td>${q}</td><td><b>${v}</b></td><td class="${mal ? "flojo" : ""}">${f}</td></tr>`;
  const filas = [];
  const zp = Array.isArray(a.fc?.zonas);
  filas.push(fila("FC máxima", `${Z.fcmax} ppm`, +a.fc?.max ? "Escrita en la ficha" : de.fcmax ? "La más alta de sus actividades" : "Estimada por la edad (208 − 0,7 × edad). Poco fiable: escríbela o sube actividades", !(+a.fc?.max) && !de.fcmax));
  filas.push(fila("FC en reposo", +ef.fc?.rep ? `${ef.fc.rep} ppm` : "—", +a.fc?.rep ? "Escrita en la ficha" : de.fcrep ? "Mediana de sus datos de los últimos 60 días" : "Sin dato (opcional)"));
  filas.push(fila("FC de umbral", +ef.fc?.umbral ? `${ef.fc.umbral} ppm` : "—", +a.fc?.umbral ? "Escrita en la ficha" : de.umbral ? "Estimada con su mejor esfuerzo de 20' corriendo" : "Sin dato (opcional, la más fiable para las zonas)"));
  filas.push(fila("Zonas de pulso", zp ? "Propias" : Z.umbral ? "Por umbral" : Z.fcrep ? "Por reserva cardiaca" : "Por % de FC máx", Z.metodo));
  const m = ["10k", "5k", "media", "maraton"].find(k => ef.marcas?.[k]);
  const nm = { "5k": "5 km", "10k": "10 km", media: "media maratón", maraton: "maratón" };
  filas.push(fila("Ritmos de los entrenos", m ? `${nm[m]} en ${ef.marcas[m]}` : "Sin ritmos", m ? (de["m" + m] ? "Su mejor marca en las actividades subidas" : "Marca escrita en la ficha") : "No hay ninguna marca: los entrenos van solo por pulso. Escribe una marca reciente o sube actividades", !m));
  filas.push(fila("FTP (bici)", +ef.ftp ? `${ef.ftp} W` : "—", +a.ftp ? "Escrito en la ficha" : de.ftp ? "95 % de su mejor 20' con potenciómetro" : "Sin dato: la bici va por pulso"));
  const disp = (a.disp || []).reduce((t, d) => t + (d.on ? Math.min(+d.max || 240, 240) : 0), 0);
  filas.push(fila("Volumen semanal", +a.horas ? `${coma(a.horas)} h` : H?.horasMedia ? `desde ${coma(Math.round(H.horasMedia * 11) / 10)} h` : `~${coma(Math.round(disp * 0.8 / 6) / 10)} h`, +a.horas ? "Escrito en la ficha" : H?.horasMedia ? `Lo que entrenaba (${coma(H.horasMedia)} h/sem) + 10 %, y sube un 5 % por semana` : "El 80 % del tiempo disponible que marcaste (no hay historial)"));
  filas.push(fila("Tirada larga", H?.largoRun ? `desde ${H.largoRun}'` : "Según objetivo", H?.largoRun ? "Su tirada más larga de las últimas 6 semanas, +5' por semana" : "Según objetivo y nivel, sin pasar del máximo de cada día"));
  filas.push(fila("Actividades subidas", `${(a.actividades || []).length}`, (a.actividades || []).length ? `De ${fechaCorta(a.actividades[a.actividades.length - 1].fecha)} a ${fechaCorta(a.actividades[0].fecha)}` : "Ninguna todavía: sube su historial en «Datos»", !(a.actividades || []).length));
  const b = Math.round(bmr(a));
  const ajuste = a.objetivo === "bajar_peso" ? " · −18 % para bajar peso (salvo días duros)" : a.objetivo === "musculo" ? " · +10 % para ganar músculo" : "";
  return `<article class="dia fuentes"><div class="dia-cab"><h3>De dónde sale cada dato</h3></div>
    <div class="wrap"><table><tr><th>Dato</th><th>Valor</th><th>De dónde sale</th></tr>${filas.join("")}</table></div>
    <h4 class="sep">Cómo se calcula el menú</h4>
    <ul class="usa">
      <li><b>Gasto en reposo</b>: ${b.toLocaleString("es-ES")} kcal (fórmula Mifflin-St Jeor con ${a.peso} kg, ${a.altura} cm, ${a.edad} años, ${a.sexo === "m" ? "mujer" : "hombre"}), × 1,35 por la vida diaria.</li>
      <li><b>+ Cada entreno</b>: según deporte, intensidad, minutos y peso${ajuste}.</li>
      <li><b>Ración de hidratos</b> según la carga del día: pequeña en descanso y días suaves, normal en días medios y grande en días duros o la víspera de uno.</li>
      <li>El menú es <b>orientativo</b>: primero y segundo con su guarnición, rotando platos durante la semana${a.dieta !== "omni" ? `, con dieta ${a.dieta === "veg" ? "vegetariana" : "vegana"}` : ""}${a.sinGluten ? ", sin gluten" : ""}${a.sinLactosa ? ", sin lactosa" : ""}. Las kcal son solo una referencia.</li>
    </ul></article>`;
}

/* ---------------- Carreras ---------------- */
function pintarCarreras() {
  const cs = (actual.carreras || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
  const fut = cs.filter(c => c.fecha >= hoy()), pas = cs.filter(c => c.fecha < hoy()).reverse();
  const Z = calcZonas(actual);
  const props = (actual._aportes || []).filter(x => x.tipo === "carrera" && (!x.estado || x.estado === "pendiente"));
  const pr = predDe(actual); const ficha = c => { const p = prevision(c, Z, pr); return htmlCarreraFicha(c, true, p) + (c.fecha >= hoy() ? `<details class="prev-det"><summary>Previsión kilómetro a kilómetro${c.track ? "" : " (sube el track para afinarla)"}</summary>${htmlPrevision(c, p)}</details>` : ""); };
  $("#sub").innerHTML = `${props.length ? `<article class="dia propuestas"><div class="dia-cab"><h3>🔔 Carreras que propone</h3></div>
    ${props.map(x => `<div class="propuesta"><div><b>${esc(x.nombre)}</b><span class="small"> · ${fechaCorta(x.fecha)} · ${esc(PRUEBAS[x.prueba] || x.prueba || "")}${x.lugar ? " · " + esc(x.lugar) : ""}</span>${x.texto ? `<p class="small">“${esc(x.texto)}”</p>` : ""}${x.web ? `<a class="small" href="${esc(x.web)}" target="_blank" rel="noopener">Web de la carrera</a>` : ""}</div>
      <div class="fila"><select data-prio="${x.id}"><option value="A">A · Principal</option><option value="B">B · Importante</option><option value="C" selected>C · Preparación</option></select>
      <button class="btn pri mini" data-acc="aceptar-carrera" data-id="${x.id}">Aceptar</button><button class="btn peligro mini" data-acc="descartar-carrera" data-id="${x.id}">Descartar</button></div></div>`).join("")}
  </article>` : ""}
  <article class="dia">
    <div class="dia-cab"><h3>Carreras</h3><button class="btn pri mini" data-acc="nueva-carrera">＋ Añadir carrera</button></div>
    <p class="ayuda">Al guardar una carrera, las semanas que no has cambiado a mano se rehacen solas. Sube el <b>track (GPX)</b> del recorrido en cada carrera para tener la previsión kilómetro a kilómetro; el deportista la ve en su enlace.</p>
    ${fut.length ? fut.map(ficha).join("") : `<p class="muted">Sin carreras próximas.</p>`}
    ${pas.length ? `<h4 class="sep">Pasadas</h4>${pas.map(c => htmlCarreraFicha(c, true)).join("")}` : ""}
  </article>`;
}
let carEdit = null, trackNuevo;
function abrirCarrera(id) {
  carEdit = id ? actual.carreras.find(c => c.id === id) : null;
  const f = $("#f-car");
  f.reset();
  const c = carEdit || { prueba: ["5k", "10k", "media", "maraton", "ciclismo", "triatlon"].includes(actual.objetivo) ? actual.objetivo : "10k", prioridad: (actual.carreras || []).some(x => x.prioridad === "A" && x.fecha >= hoy()) ? "B" : "A" };
  for (const k of ["nombre", "fecha", "prueba", "prioridad", "objetivo", "lugar", "ritmoObjetivo", "estrategia"]) f.elements[k].value = c[k] || "";
  trackNuevo = undefined;
  $("#track-info").textContent = c.track ? `Track: ${(c.track.dist / 1000).toFixed(2).replace(".", ",")} km · +${c.track.sube} m / −${c.track.baja} m${c.track.conAltura ? "" : " (sin altura)"}` : "Sin track";
  $("#quitar-track").hidden = !c.track;
  $("#car-borrar").hidden = !carEdit;
  $("#dlg-car").returnValue = "";
  $("#dlg-car").showModal();
}
async function cerrarCarrera(accion) {
  const f = $("#f-car");
  if (!["guardar", "borrar"].includes(accion)) return;
  if (accion === "borrar") { if (!confirm("¿Borrar esta carrera?")) return; actual.carreras = actual.carreras.filter(c => c !== carEdit); }
  else {
    const d = Object.fromEntries(["nombre", "fecha", "prueba", "prioridad", "objetivo", "lugar", "ritmoObjetivo", "estrategia"].map(k => [k, f.elements[k].value.trim()]));
    if (d.ritmoObjetivo && !parseTiempo(d.ritmoObjetivo)) return toast("El ritmo objetivo va como m:ss (por ejemplo 4:30).");
    if (trackNuevo !== undefined) d.track = trackNuevo;
    if (!d.nombre || !d.fecha) return toast("La carrera necesita nombre y fecha.");
    if (carEdit) Object.assign(carEdit, d); else (actual.carreras = actual.carreras || []).push({ id: uid(8), ...d });
  }
  await A.guardarFicha(actual);
  const r = await actualizarFuturas(actual);
  await publicar(actual);
  toast(r);
  pintarAtleta();
}

/* ---------------- Datos importados ---------------- */
const PERIODOS = { 3: "3 meses", 6: "6 meses", 12: "1 año" };
let periodo = 6;
const desdePeriodo = () => sumaDias(hoy(), -Math.round(periodo * 30.5));
const AYUDA = `<details class="como"><summary>¿Cómo consigue el deportista ese ZIP?</summary>
  <p>Lo pide él desde su cuenta (le lleva 2 minutos) y te lo manda por WhatsApp o correo. Tú lo subes aquí <b>sin descomprimir</b>. Nadie tiene que darte su contraseña.</p>
  <ul>
    <li><b>Garmin</b>: en un ordenador, entra en garmin.com con su cuenta → «Gestión de datos» → «Exportar tus datos» → «Solicitar exportación». Le llega un correo con el ZIP (puede tardar de unas horas a varios días). Si corre prisa: Garmin Connect web → Actividades → «Exportar CSV» (solo el resumen de cada actividad).</li>
    <li><b>Strava</b>: strava.com → Ajustes → Mi cuenta → «Descargar o eliminar tu cuenta» → «Solicitar tu archivo». Le llega un ZIP por correo, normalmente en unas horas.</li>
    <li><b>Polar</b>: account.polar.com → «Descargar tus datos». Le llega un ZIP por correo.</li>
    <li><b>Coros, Suunto, Wahoo…</b>: en cada actividad, «Exportar» o «Compartir» como .FIT o .GPX.</li>
  </ul></details>`;
function htmlSubida(id) {
  return `<label class="soltar" id="soltar-${id}">
      <input type="file" id="f-${id}" multiple>
      <b>📂 Sube su historial</b>
      <span>El <b>ZIP</b> con sus datos de Garmin, Strava o Polar (tal cual llega), actividades sueltas .FIT, .GPX o .TCX, la lista .CSV de actividades, e informes en PDF o foto.</span>
    </label>
    <div class="periodo"><span>Usar los últimos</span>${Object.entries(PERIODOS).map(([k, v]) => `<label class="chip"><input type="radio" name="periodo-${id}" value="${k}" ${+k === periodo ? "checked" : ""}> ${v}</label>`).join("")}</div>
    ${AYUDA}`;
}
function enlazarSubida(id, fn) {
  const zona = $(`#soltar-${id}`);
  zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("sobre"); fn([...e.dataTransfer.files]); });
  $(`#f-${id}`).addEventListener("change", e => { fn([...e.target.files]); e.target.value = ""; });
  $$(`[name="periodo-${id}"]`).forEach(r => r.addEventListener("change", () => { periodo = +r.value; }));
}
const esDoc = f => /\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name) || f.type.startsWith("image/") || f.type === "application/pdf";
async function procesarArchivos(files, avisar) {
  const desde = desdePeriodo(), acts = [], docs = [], errores = [];
  let viejas = 0, masVieja = null;
  const medidas = [];
  for (const f of files) {
    try {
      avisar(`Leyendo ${f.name}…`);
      if (esDoc(f)) {
        const lim = A.nube ? 700 * 1024 : 10 * 1024 * 1024;
        if (f.size > lim) throw new Error(`pesa ${Math.round(f.size / 1024)} KB; el máximo es ${Math.round(lim / 1024)} KB (prueba a comprimirlo)`);
        const datos = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
        docs.push({ id: uid(10), nombre: f.name, tipo: f.type || "application/pdf", tam: f.size, fecha: hoy(), datos });
      } else {
        const r = await leerArchivo(f, { desde: "0000", progreso: t => avisar(`${f.name}: ${t}`) });
        for (const x of r) { if (x.medida) medidas.push(x); else if (x.fecha >= desde) acts.push(x); else { viejas++; if (!masVieja || x.fecha > masVieja) masVieja = x.fecha; } }
      }
    } catch (e) { errores.push(`${f.name}: ${e.message}`); }
  }
  // la misma actividad puede venir dos veces en un ZIP (lista + archivo original): se juntan
  return { acts: fusionar([], acts).lista, medidas, docs, errores, viejas, masVieja, desde, n: files.length };
}
/** Explicación de lo leído, para que nunca parezca que no ha pasado nada. */
function htmlLeido(r) {
  const p = [`📂 ${r.n} archivo${r.n > 1 ? "s" : ""} leído${r.n > 1 ? "s" : ""}: <b>${r.acts.length} actividad${r.acts.length === 1 ? "" : "es"}</b> de los últimos ${PERIODOS[periodo]}${r.docs.length ? ` y ${r.docs.length} documento${r.docs.length > 1 ? "s" : ""}` : ""}.`];
  if (r.viejas) p.push(`<span class="alerta-l">⚠️ ${r.viejas} actividad${r.viejas > 1 ? "es son" : " es"} anterior${r.viejas > 1 ? "es" : ""} al ${fechaCorta(r.desde)} (la más reciente de ellas, del ${fechaCorta(r.masVieja)}) y no se ha${r.viejas > 1 ? "n" : ""} usado. Si las quieres, elige «1 año» y vuelve a subirlas.</span>`);
  if (r.medidas.length) p.push(`❤️ ${r.medidas.length} días de <b>pulso en reposo</b> (se usa la mediana de los últimos 60 días si la ficha no tiene uno).`);
  if (!r.acts.length && !r.viejas && !r.docs.length && !r.errores.length && !r.medidas.length) p.push(`<span class="alerta-l">⚠️ No he encontrado actividades en ${r.n > 1 ? "esos archivos" : "ese archivo"}.</span>`);
  return `<p class="small">${p.join("<br>")}</p>${r.errores.length ? `<ul class="errores">${r.errores.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
}
const coma = x => String(x).replace(".", ",");
function htmlResumenCorto(H) {
  const p = [`${coma(H.horasMedia)} h/semana`];
  if (H.kmRun) p.push(`${H.kmRun} km/semana corriendo`);
  if (H.largoRun) p.push(`tirada más larga ${H.largoRun}'`);
  if (H.fcMaxObs) p.push(`FC máx ${H.fcMaxObs}`);
  if (H.lthr) p.push(`umbral ~${H.lthr} ppm`);
  for (const [k, n] of [["5k", "5 km"], ["10k", "10 km"], ["media", "media"], ["maraton", "maratón"]]) if (H.mejores[k]) p.push(`${n} ${fmtHoras(H.mejores[k].s)}`);
  if (H.ftpEst) p.push(`FTP ~${H.ftpEst} W`);
  return p.join(" · ");
}

async function pintarDatos() {
  const a = actual;
  if (!archivos.length) { try { archivos = await A.listarArchivos(a); } catch (e) { archivos = []; } }
  const acts = (a.actividades || []).slice().sort((x, y) => y.fecha.localeCompare(x.fecha));
  const H = a.hist, ef = efectivo(a), Z = calcZonas(a);
  const usa = [], sug = [];
  if (H) {
    if (+a.horas > 0) usa.push(`Volumen fijado a mano en la ficha: <b>${coma(a.horas)} h/semana</b>. Bórralo de la ficha si prefieres que lo marquen sus datos.`);
    else if (H.horasMedia) usa.push(`<b>Volumen</b>: arranca en ${coma(Math.round(H.horasMedia * 11) / 10)} h/semana (+10 % sobre lo que hace) y sube un 5 % cada semana, sin pasar de su disponibilidad.`);
    if (H.largoRun) usa.push(`<b>Tirada larga</b>: parte de ${H.largoRun}' (la más larga de sus últimas 6 semanas) y crece unos 5' por semana.`);
    if (ef._de?.fcmax) usa.push(`<b>FC máxima</b>: ${H.fcMaxObs} ppm, la más alta registrada. Si nunca ha apretado a tope, la real será mayor: si la conoces, escríbela en la ficha.`);
    if (ef._de?.umbral) usa.push(`<b>FC de umbral</b>: ~${H.lthr} ppm, estimada con su mejor esfuerzo de 20' corriendo. Sus zonas salen de aquí.`);
    for (const [k, n] of [["5k", "5 km"], ["10k", "10 km"], ["media", "media maratón"], ["maraton", "maratón"]]) if (ef._de?.["m" + k]) usa.push(`<b>Marca de ${n}</b>: ${fmtHoras(H.mejores[k].s)} (${fechaCorta(H.mejores[k].fecha)}). De aquí salen sus ritmos.`);
    if (ef._de?.fcrep) usa.push(`<b>FC en reposo</b>: ${H.fcRep} ppm (mediana de sus datos de los últimos 60 días).`);
    if (ef._de?.ftp) usa.push(`<b>FTP</b>: ~${H.ftpEst} W (95 % de su mejor 20').`);
    // Diferencias con lo escrito en la ficha
    if (H.fcMaxObs && +a.fc?.max && H.fcMaxObs > +a.fc.max) sug.push({ k: "fcmax", v: H.fcMaxObs, t: `En sus datos aparece una FC máx de <b>${H.fcMaxObs}</b> y la ficha dice ${a.fc.max}.` });
    for (const k of ["5k", "10k", "media", "maraton"]) if (H.mejores[k] && a.marcas?.[k] && H.mejores[k].s < parseTiempo(a.marcas[k])) sug.push({ k: "marca", d: k, v: fmtHoras(H.mejores[k].s), t: `Ha hecho <b>${fmtHoras(H.mejores[k].s)}</b> en ${k === "media" ? "media maratón" : k === "maraton" ? "maratón" : k.replace("k", " km")} y la ficha dice ${a.marcas[k]}.` });
    if (H.ftpEst && +a.ftp && Math.abs(H.ftpEst - a.ftp) > 8) sug.push({ k: "ftp", v: H.ftpEst, t: `Su FTP estimado es <b>${H.ftpEst} W</b> y la ficha dice ${a.ftp} W.` });
  }
  let intensidad = "";
  if (H?.suave) {
    const z = Z.fc.findIndex(r => H.suave.fc <= r[1]) + 1 || 5;
    intensidad = z <= 2
      ? `<p class="ok-msg">✅ Sus rodajes suaves (~${fmtRitmo(H.suave.ritmo)} /km a ${H.suave.fc} ppm) van en Z${z}: bien hechos.</p>`
      : `<p class="alerta">⚠️ Sus rodajes «suaves» van a ${H.suave.fc} ppm (~${fmtRitmo(H.suave.ritmo)} /km): eso es <b>Z${z}</b>, demasiado rápido. El plan se los pone en Z2 (${Z.fc[1][0]}-${Z.fc[1][1]} ppm), aunque tenga que ir más despacio.</p>`;
  }
  const maxH = H ? Math.max(1, ...H.semanas.map(s => s.horas)) : 1;
  $("#sub").innerHTML = `
  <article class="dia">
    <div class="dia-cab"><h3>Historial de entrenos</h3>${acts.length ? `<span class="muted small">${acts.length} actividades</span>` : ""}</div>
    ${htmlSubida("datos")}
    <div id="import-msg"></div>
  </article>
  ${H ? `<article class="dia">
    <div class="dia-cab"><h3>Cómo entrena ahora</h3><span class="muted small">últimas 4 semanas</span></div>
    <div class="kpis">
      <div class="kpi"><b>${coma(H.horasMedia)} h</b><span>por semana</span></div>
      <div class="kpi"><b>${H.kmRun || 0} km</b><span>corriendo/semana</span></div>
      <div class="kpi"><b>${coma(H.sesiones)}</b><span>sesiones/semana</span></div>
      <div class="kpi"><b>${H.largoRun ? H.largoRun + "'" : "—"}</b><span>tirada más larga</span></div>
    </div>
    ${intensidad}
    <h4 class="sep">Horas por semana</h4>
    <div class="vol">${H.semanas.map(s => `<div class="vol-c" title="${rangoSemana(s.lunes)}: ${s.horas} h"><i style="height:${s.horas / maxH * 100}%"></i><b>${coma(s.horas)}</b><span>${fechaCorta(s.lunes)}</span></div>`).join("")}</div>
  </article>
  <article class="dia">
    <div class="dia-cab"><h3>Lo que el plan saca de sus datos</h3></div>
    ${usa.length ? `<ul class="usa">${usa.map(x => `<li>${x}</li>`).join("")}</ul>` : `<p class="muted">La ficha ya tiene todos los valores escritos a mano; el plan usa los de la ficha.</p>`}
    ${sug.length ? `<h4 class="sep">No coincide con la ficha</h4><ul class="sugs">${sug.map((s, i) => `<li><span>${s.t}</span><button class="btn sec mini" data-acc="aplicar" data-i="${i}">Usar dato</button></li>`).join("")}</ul>` : ""}
    <small>Lo que escribas en la ficha manda sobre los datos. Deja un campo vacío para que lo calculen sus actividades.</small>
  </article>
  <article class="dia">
    <div class="dia-cab"><h3>Actividades</h3></div>
    <div class="wrap"><table class="acts"><tr><th>Fecha</th><th></th><th>Km</th><th>Tiempo</th><th>Ritmo</th><th>FC med/máx</th><th></th></tr>
    ${acts.slice(0, 60).map(x => `<tr><td>${fechaCorta(x.fecha)}</td><td>${DEP[x.dep]?.i || "•"}</td><td>${x.km ? coma(x.km) : "—"}</td><td>${x.dur ? fmtHoras(x.dur) : "—"}</td><td>${x.dep === "run" && x.km ? fmtRitmo(x.dur / x.km) : x.dep === "bike" && x.km ? coma(Math.round(x.km / x.dur * 36000) / 10) + " km/h" : "—"}</td><td>${x.fcMed || "—"}/${x.fcMax || "—"}</td><td><button class="quita" data-acc="quitar-act" data-id="${esc(x.id)}" aria-label="Quitar">✕</button></td></tr>`).join("")}
    </table></div>${acts.length > 60 ? `<small>Mostrando las 60 más recientes.</small>` : ""}
  </article>` : ""}
  <article class="dia">
    <div class="dia-cab"><h3>Informes y documentos</h3></div>
    ${archivos.length ? `<ul class="docs">${archivos.sort((x, y) => y.fecha.localeCompare(x.fecha)).map(x => `<li><span>${x.tipo.includes("pdf") ? "📄" : "🖼️"} <b>${esc(x.nombre)}</b> <span class="muted small">${fechaCorta(x.fecha)} · ${Math.max(1, Math.round(x.tam / 1024))} KB</span></span>
      <span class="fila"><button class="btn sec mini" data-acc="ver-doc" data-id="${x.id}">Abrir</button><button class="quita" data-acc="quitar-doc" data-id="${x.id}" aria-label="Borrar">✕</button></span></li>`).join("")}</ul>`
      : `<p class="muted">Pruebas de esfuerzo, analíticas, informes del fisio… Súbelos arriba y quedan guardados en su ficha.</p>`}
  </article>`;
  pintarDatos.sug = sug;
  enlazarSubida("datos", importar);
}

/** Añade actividades al deportista y recalcula lo que se deduce de ellas. */
function anadirActividades(a, nuevas, medidas = []) {
  const { lista, anadidas } = fusionar(a.actividades || [], nuevas);
  a.actividades = lista.slice(0, 1500);
  // el detalle (parciales, gráficas, recorrido) se guarda solo de las 40 más recientes, para no pasar del tamaño máximo
  a.actividades.forEach((x, i) => { if (i >= 40 && x.det) delete x.det; });
  const m = new Map((a.medidas || []).map(x => [x.medida + x.fecha, x]));
  for (const x of medidas) m.set(x.medida + x.fecha, x);
  a.medidas = [...m.values()].sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 400);
  recalcHist(a);
  return anadidas + medidas.length;
}
const recalcHist = a => { a.hist = (a.actividades?.length || a.medidas?.length) ? resumen(a.actividades || [], a.medidas || []) : null; };

async function importar(files) {
  const msg = $("#import-msg");
  const a = actual;
  const r = await procesarArchivos(files, t => { msg.innerHTML = `<p class="cargando">⏳ ${esc(t)}</p>`; });
  for (const d of r.docs) { try { await A.guardarArchivo(a, d); } catch (e) { r.errores.push(`${d.nombre}: ${e.message}`); } }
  const nuevas = anadirActividades(a, r.acts, r.medidas);
  let rehecho = "";
  try {
    await A.guardarFicha(a);
    if (nuevas) { await actualizarFuturas(a); rehecho = " El plan de las próximas semanas se ha rehecho con sus datos."; }
    await publicar(a);
  } catch (e) { r.errores.push("No se ha podido guardar: " + e.message); }
  archivos = [];
  await pintarDatos();
  $("#import-msg").innerHTML = `${nuevas || r.docs.length ? `<p class="ok-msg">✅ ${nuevas} actividad${nuevas === 1 ? "" : "es"} nueva${nuevas === 1 ? "" : "s"}${r.acts.length !== nuevas ? ` (${r.acts.length - nuevas} ya estaban)` : ""}${r.docs.length ? ` y ${r.docs.length} documento${r.docs.length > 1 ? "s" : ""} guardado${r.docs.length > 1 ? "s" : ""}` : ""}.${rehecho}</p>` : r.acts.length ? `<p class="ok-msg">✅ Ya estaban todas subidas: no hay nada nuevo.</p>` : ""}${htmlLeido(r)}`;
}

async function aplicarSug(lista) {
  const a = actual;
  for (const s of lista) {
    if (s.k === "fcmax") a.fc = { ...a.fc, max: s.v };
    if (s.k === "marca") a.marcas = { ...a.marcas, [s.d]: s.v };
    if (s.k === "ftp") a.ftp = s.v;
  }
  await A.guardarFicha(a);
  const r = await actualizarFuturas(a);
  await publicar(a);
  toast(r);
  pintarAtleta();
}

/* ---------------- Historial en el formulario ---------------- */
let pendientes = { acts: [], docs: [], medidas: [] };
function prepararSubidaForm() {
  pendientes = { acts: [], docs: [], medidas: [] };
  $("#subida-form").innerHTML = htmlSubida("form");
  $("#form-hist-msg").innerHTML = editando?.hist ? `<p class="muted small">Ya tiene ${editando.actividades.length} actividades: ${htmlResumenCorto(editando.hist)}</p>` : "";
  enlazarSubida("form", async files => {
    const msg = $("#form-hist-msg"), btn = $("#btn-guardar"), txt = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ Leyendo archivos… espera";
    let r;
    try { r = await procesarArchivos(files, t => { msg.innerHTML = `<p class="cargando">⏳ ${esc(t)}</p>`; }); }
    finally { btn.disabled = false; btn.textContent = txt; }
    pendientes.acts.push(...r.acts); pendientes.docs.push(...r.docs); pendientes.medidas.push(...r.medidas);
    const { lista } = fusionar(editando?.actividades || [], pendientes.acts);
    const H = lista.length ? resumen(lista, pendientes.medidas) : null;
    msg.innerHTML = `${htmlLeido(r)}${H ? `<p class="ok-msg">✅ Listo para guardar: ${lista.length} actividades</p><p class="small">${htmlResumenCorto(H)}</p>` : ""}
      ${pendientes.docs.length ? `<p class="small">📄 ${pendientes.docs.length} documento${pendientes.docs.length > 1 ? "s" : ""} listo${pendientes.docs.length > 1 ? "s" : ""} para guardar.</p>` : ""}
      ${H || pendientes.docs.length ? `<p class="muted small">Se guardan al pulsar el botón de abajo. Lo que dejes vacío en la ficha (pulso, marcas, FTP, horas) lo sacarán estos datos.</p>` : ""}`;
  });
}
async function guardarPendientes(a) {
  if (pendientes.acts.length || pendientes.medidas.length) anadirActividades(a, pendientes.acts, pendientes.medidas);
  for (const d of pendientes.docs) { try { await A.guardarArchivo(a, d); } catch (e) { toast(`${d.nombre}: ${e.message}`); } }
  const habia = pendientes.acts.length > 0 || pendientes.medidas.length > 0;
  pendientes = { acts: [], docs: [], medidas: [] };
  archivos = [];
  return habia;
}

/* ---------------- Editor de sesión ---------------- */
let sesEdit = null; // { dia, id }
function abrirSesion(dia, id) {
  const snap = actual.semanas[lunesVista];
  const s = id ? snap.dias[dia].ses.find(x => x.id === id) : sesionVacia();
  sesEdit = { dia, id: id || null, nueva: !id, s };
  const f = $("#f-ses");
  f.elements.dia.value = dia; f.elements.dep.value = ["run", "bike", "swim", "fuerza", "movilidad"].includes(s.dep) ? s.dep : "run";
  f.elements.t.value = s.t; f.elements.min.value = s.min; f.elements.z.value = s.z || "";
  f.elements.p.value = (s.p || []).join("\n"); f.elements.n.value = s.n || "";
  f.elements.ej.value = (s.ej || []).map(e => `${e.n} | ${e.s}`).join("\n");
  $("#ses-borrar").hidden = !id;
  $("#sel-plantilla").innerHTML = `<option value="">🧩 Usar una plantilla…</option>` + plantillas().map((p, i) => `<option value="${i}">${esc(p.nombre)}</option>`).join("");
  $("#dlg-ses").querySelector("h3").textContent = id ? "Cambiar sesión" : `Nueva sesión · ${DIAS[dia]}`;
  $("#dlg-ses").returnValue = "";
  $("#dlg-ses").showModal();
}
async function cerrarSesion(accion) {
  if (!["guardar", "borrar"].includes(accion) || !sesEdit) return;
  const snap = actual.semanas[lunesVista];
  const { dia, id } = sesEdit;
  const f = $("#f-ses");
  const lista = snap.dias[dia].ses;
  const i = id ? lista.findIndex(x => x.id === id) : -1;
  if (accion === "borrar") { if (i >= 0) lista.splice(i, 1); }
  else {
    const min = parseInt(f.elements.min.value, 10);
    if (!f.elements.t.value.trim() || !(min > 0)) return toast("La sesión necesita título y duración.");
    const s = { ...sesEdit.s, dep: f.elements.dep.value, t: f.elements.t.value.trim(), min, z: f.elements.z.value.trim(),
      p: f.elements.p.value.split("\n").map(x => x.trim()).filter(Boolean), n: f.elements.n.value.trim(),
      ej: f.elements.ej.value.split("\n").map(x => x.trim()).filter(Boolean).map(x => { const [n, s_] = x.split("|"); return { n: n.trim(), s: (s_ || "").trim() }; }),
      editada: true };
    if (!s.ej.length) s.ej = null;
    const o = sesEdit.s || {};
    if (o.dep !== s.dep || o.t !== s.t || o.min !== s.min || (o.p || []).join("\n") !== s.p.join("\n")) { s.c = null; s.est = null; s.tr = null; } // la estructura automática ya no vale
    if (s.tipo === "manual") s.tipo = s.dep === "fuerza" ? "fuerza" : s.min >= 90 ? "largo" : "suave";
    const nuevoDia = +f.elements.dia.value;
    if (i >= 0) lista.splice(i, 1);
    snap.dias[nuevoDia].ses.push(s);
    snap.dias[nuevoDia].ses.sort((x, y) => (x.dep === "fuerza") - (y.dep === "fuerza"));
  }
  snap.editada = true;
  recalcular(actual, snap);
  await A.guardarSemana(actual, snap);
  await publicar(actual);
  toast("Sesión guardada");
  pintarAtleta();
}

/* =========================================================
   Eventos
   ========================================================= */
function enlazar() {
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-vista],[data-vista-ir],[data-abrir],[data-sub],[data-herr],[data-acc]");
    if (!t) return;
    if (t.dataset.vista || t.dataset.vistaIr) {
      const v = t.dataset.vista || t.dataset.vistaIr;
      if (v === "nuevo") return formNuevo();
      if (v === "atleta") { vista("atleta"); return pintarAtleta(); }
      if (v === "herr") { vista("herr"); return pintarHerr(); }
      history.replaceState(null, "", location.pathname);
      return vista(v);
    }
    if (t.dataset.abrir) return abrir(t.dataset.abrir);
    if (t.dataset.sub) { sub = t.dataset.sub; return pintarAtleta(); }
    if (t.dataset.herr) { subH = t.dataset.herr; return pintarHerr(); }
    if (t.dataset.acc === "ejercicio") return mostrarEjercicio(t.dataset.n, ajustes.videos || {});
    if (t.dataset.acc === "ver-act") return mostrarActividad(actPorClave(t.dataset.k));
    if (await accionHerr(t)) return;
    const acc = t.dataset.acc, a = actual;
    if (acc === "ficha") return formEditar();
    if (acc === "sem-ant" || acc === "sem-sig") { lunesVista = sumaDias(lunesVista, acc === "sem-ant" ? -7 : 7); if (lunesVista >= lunesDe(hoy()) && !a.semanas[lunesVista]) { a.semanas[lunesVista] = generarSemana(a, lunesVista); await A.guardarSemana(a, a.semanas[lunesVista]); await publicar(a); } return pintarAtleta(); }
    if (acc === "hoy") { lunesVista = lunesDe(hoy()); return pintarAtleta(); }
    if (acc === "generar" || acc === "rehacer") {
      if (acc === "rehacer" && (a.semanas[lunesVista]?.editada || conRegistros(a, lunesVista)) && !confirm("Esta semana tiene cambios a mano o entrenos ya registrados por el deportista (sus registros dejarían de verse en esta semana). ¿Rehacerla igualmente?")) return;
      a.semanas[lunesVista] = generarSemana(a, lunesVista);
      await A.guardarSemana(a, a.semanas[lunesVista]); await publicar(a);
      toast("Semana generada"); return pintarAtleta();
    }
    if (acc === "imprimir") return window.print();
    if (acc === "chat-enviar") return enviarMensaje(a);
    if (acc === "chat-recargar") { try { a._aportes = await A.listarAportes(a.token); } catch (e) { } return pintarChat(); }
    if (acc === "informe") return dialogoInforme(a);
    if (acc === "asist-enviar") { const t_ = $("#asist-txt").value.trim(); return enviarAsistente(a, t_); }
    if (acc === "asist-ej") return enviarAsistente(a, t.textContent.trim());
    if (acc === "asist-borrar") { conversaciones[a.id] = []; return pintarAsistente(); }
    if (acc === "aplicar-prop" || acc === "descartar-prop") {
      const m = (conversaciones[a.id] || [])[+t.dataset.i]; if (!m?.prop) return;
      if (acc === "descartar-prop") { m.estado = "descartada"; return pintarAsistente(); }
      t.disabled = true; t.textContent = "Aplicando…";
      try { const h = await aplicarAcciones(a, m.prop.acciones || []); m.estado = "aplicada"; conversaciones[a.id].push({ role: "assistant", content: `✅ Hecho: ${h.join("; ") || "sin cambios"}. Su enlace ya está al día.` }); }
      catch (e) { conversaciones[a.id].push({ role: "assistant", content: "⚠️ No se ha podido aplicar: " + e.message }); }
      return pintarAsistente();
    }
    if (acc === "aviso-movil") {
      return dialogo(`<h3>🔔 Aviso a su móvil</h3>
        <p class="small">Le llega como notificación si ha activado los avisos en su enlace (Progreso → 🔔 Avisos en tu móvil, con la app ntfy). Al pulsarla abre su plan.</p>
        <label>Mensaje<textarea id="aviso-txt" rows="3">He actualizado tu plan, échale un vistazo 💪</textarea></label>
        <div class="fila"><button class="btn sec" data-acc="cerrar-dlg">Cancelar</button><button class="btn pri" data-acc="enviar-aviso">Enviar</button></div>`);
    }
    if (acc === "enviar-aviso") {
      const ok = await avisarDeportista(a, `📣 ${ajustes.presentacion?.nombre ? ajustes.presentacion.nombre.split(" ")[0] : "Tu entrenador"}`, $("#aviso-txt").value.trim() || "Tienes novedades en tu plan");
      $("#dlg-gen").close(); return toast(ok ? "🔔 Aviso enviado" : "No se ha podido enviar el aviso (revisa la conexión)");
    }
    if (acc === "ia-todo") {
      const el = $("#ia-todo-res"); t.disabled = true; el.innerHTML = `<p class="small muted">🤖 Analizando todos sus datos…</p>`;
      try {
        const tmp = document.createElement("div"); tmp.innerHTML = htmlResumen(a) + htmlCarga(cargaDe(a)) + htmlBienTrainer(a);
        const ses = Object.values(a.semanas || {}).filter(s => s.lunes >= sumaDias(lunesDe(hoy()), -21) && s.lunes <= lunesDe(hoy())).flatMap(s => s.dias.flatMap((d, i) => d.ses.map(x => { const r = (a._aportes || []).find(y => y.sesId === x.id); return `${sumaDias(s.lunes, i)} ${x.t} ${x.min}' → ${r ? `${r.hecho}${r.rpe ? " RPE " + r.rpe : ""}${r.texto ? " «" + r.texto + "»" : ""}` : "sin registrar"}`; })));
        const txt = await analizar("Eres su entrenador. Analiza al deportista con TODOS estos datos y dame: 1) Estado actual en 2 frases. 2) Lo que va bien. 3) Riesgos o señales de alarma. 4) Ajustes concretos para las próximas 2 semanas (volumen, intensidad, descanso). 5) Un mensaje breve y cercano para mandarle. Sé concreto y usa sus números.",
          `Deportista: ${a.nombre}, ${a.edad} años, objetivo ${OBJ[a.objetivo]}, nivel ${a.nivel}.\n${tmp.innerText}\n\nÚltimas 3 semanas, sesión a sesión:\n${ses.join("\n")}`);
        el.innerHTML = `<div class="ia-res">${esc(txt).replace(/\n/g, "<br>")}</div>`;
      } catch (e) { el.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; }
      t.disabled = false; return;
    }
    if (acc === "crear-informe") return crearInforme(a);
    if (acc === "cerrar-dlg") return $("#dlg-gen").close();
    if (acc === "ia-informe") {
      const b = t; b.disabled = true; b.textContent = "🤖 Pensando…";
      try {
        const d = datosInforme(a, $("#inf-mes").value);
        const tmp = document.createElement("div"); tmp.innerHTML = htmlInforme(d);
        const txt = await analizar("Redacta la valoración del entrenador para este informe mensual: 4-6 frases en segunda persona dirigidas al deportista, cercanas y concretas (qué ha ido bien con datos, qué mejorar y el foco del mes que viene). Sin saludos ni firma.", `Informe:\n${tmp.innerText}`);
        $("#inf-com").value = txt;
      } catch (e) { toast(e.message); }
      b.disabled = false; b.textContent = "🤖 Redactar con Claude"; return;
    }
    if (acc === "usar-pred") {
      const pr = predDe(a); if (!pr) return;
      if (!confirm(`¿Actualizar sus ritmos con su forma actual (10 km en ${fmtHoras(pr.tiempos["10k"])})? Se rehacen las semanas futuras que no hayas cambiado a mano.`)) return;
      a.marcas = { ...(a.marcas || {}), "10k": fmtHoras(pr.tiempos["10k"]) }; delete a.marcas["5k"];
      await A.guardarFicha(a); await actualizarFuturas(a); await publicar(a);
      toast("Ritmos actualizados con su forma actual"); return pintarAtleta();
    }
    if (acc === "editar-ses") { const snap = a.semanas[lunesVista]; const dia = snap.dias.findIndex(d => d.ses.some(s => s.id === t.dataset.id)); return abrirSesion(dia, t.dataset.id); }
    if (acc === "add-ses") return abrirSesion(+t.dataset.dia, null);
    if (acc === "otro-menu") {
      const snap = a.semanas[lunesVista], i = +t.dataset.dia;
      snap.dias[i].menuVar = (snap.dias[i].menuVar || 0) + 1;
      recalcular(a, snap, i); await A.guardarSemana(a, snap); await publicar(a); return pintarAtleta();
    }
    if (acc === "comentar") return abrirComentario(t.dataset.id);
    if (acc === "ia-sesion") return iaSesion();
    if (acc === "guardar-coment") return guardarComentario();
    if (acc === "cerrar-dlg") return cerrarDialogo();
    if (acc === "msg-semana") return mensajeSemana();
    if (acc === "ia-semana") return iaSemana();
    if (acc === "guardar-msg-sem") { const snap = a.semanas[lunesVista]; snap.comentSemana = $("#sem-msg").value.trim(); await A.guardarSemana(a, snap); await publicar(a); cerrarDialogo(); toast("Mensaje guardado"); return pintarAtleta(); }
    if (acc === "guardar-st") return guardarSemanaTipo();
    if (acc === "elegir-st") return elegirSemanaTipo();
    if (acc === "aplicar-st") { if (a.semanas[lunesVista]?.ses?.length !== 0 && !confirm("¿Sustituir los entrenos de esta semana por la semana tipo?")) return; return aplicarSemanaTipo(+t.dataset.i); }
    if (acc === "borrar-st") { ajustes.semanasTipo = (ajustes.semanasTipo || []).filter((_, i) => i !== +t.dataset.i); await A.guardarAjustes(ajustes); return elegirSemanaTipo(); }
    if (acc === "avisar") {
      let tel = a.telefono.replace(/\D/g, ""); if (tel.length === 9) tel = "34" + tel;
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${a.nombre.split(" ")[0]}, te he actualizado el plan. Échale un ojo 👇\n${enlace(a)}`)}`, "_blank");
      return;
    }
    if (acc === "visto") {
      for (const x of nuevos(a)) { x.visto = true; try { await A.marcarAporte(a.token, x.id, { visto: true }); } catch (e) { } }
      pintarLista(); return pintarAtleta();
    }
    if (acc === "ajuste") {
      const sig = sumaDias(lunesVista, 7), f = +t.dataset.f;
      a.ajustes = { ...(a.ajustes || {}), [sig]: f };
      await A.guardarFicha(a);
      if (!a.semanas[sig]?.editada) { a.semanas[sig] = generarSemana(a, sig); await A.guardarSemana(a, a.semanas[sig]); }
      await publicar(a);
      toast(f === 1 ? "La semana siguiente sigue igual" : `Semana siguiente ${f > 1 ? "+10 %" : "−15 %"} de volumen`);
      return pintarAtleta();
    }
    if (acc === "ir-semana") { lunesVista = t.dataset.l; sub = "semana"; return pintarAtleta(); }

    if (acc === "aceptar-carrera" || acc === "descartar-carrera") {
      const x = (a._aportes || []).find(y => y.id === t.dataset.id);
      if (!x) return;
      if (acc === "aceptar-carrera") {
        (a.carreras = a.carreras || []).push({ id: uid(8), nombre: x.nombre, fecha: x.fecha, prueba: x.prueba || "otra", prioridad: $(`[data-prio="${x.id}"]`).value, objetivo: x.objetivo || "", lugar: x.lugar || "" });
        await A.guardarFicha(a);
      }
      x.estado = acc === "aceptar-carrera" ? "aceptada" : "descartada"; x.visto = true;
      try { await A.marcarAporte(a.token, x.id, { estado: x.estado, visto: true }); } catch (e) { }
      const r = acc === "aceptar-carrera" ? await actualizarFuturas(a) : "Carrera descartada";
      await publicar(a); toast(r); pintarLista(); return pintarAtleta();
    }
    if (acc === "ver-foto") {
      const img = await A.leerFoto(a.token, t.dataset.f).catch(() => null) || t.querySelector("img")?.src;
      const w = window.open(); if (w && img) w.document.write(`<title>Captura</title><body style="margin:0;background:#000"><img src="${img}" style="max-width:100%;display:block;margin:auto">`);
      return;
    }
    if (acc === "ver-img") { const src = t.querySelector("img")?.src; const w = window.open(); if (w && src) w.document.write(`<title>Captura</title><img src="${src}" style="max-width:100%">`); return; }
    if (acc === "nueva-carrera") return abrirCarrera(null);
    if (acc === "editar-carrera") return abrirCarrera(t.dataset.id);
    if (acc === "copiar-enlace") { try { await navigator.clipboard.writeText(enlace(a)); toast("Enlace copiado. Mándaselo una vez: siempre verá lo último."); } catch (e) { prompt("Copia el enlace:", enlace(a)); } return; }
    if (acc === "compartir" && a.telefono) {
      let tel = a.telefono.replace(/\D/g, ""); if (tel.length === 9) tel = "34" + tel;
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${a.nombre.split(" ")[0]}, aquí tienes tus entrenos y tu menú. Guárdalo: se actualiza solo.\n${enlace(a)}`)}`, "_blank");
      return;
    }
    if (acc === "compartir") {
      if (navigator.share) { try { await navigator.share({ title: `Plan de ${a.nombre}`, text: `Hola ${a.nombre.split(" ")[0]}, aquí tienes tus entrenos y tu menú. Guárdalo: se actualiza solo.`, url: enlace(a) }); } catch (e) { } }
      else { await navigator.clipboard.writeText(enlace(a)).catch(() => {}); toast("Enlace copiado"); }
      return;
    }
    if (acc === "aplicar") return aplicarSug([pintarDatos.sug[+t.dataset.i]]);
    if (acc === "quitar-act") { a.actividades = a.actividades.filter(x => x.id !== t.dataset.id); recalcHist(a); await A.guardarFicha(a); return pintarDatos(); }
    if (acc === "ver-doc") {
      const d = await A.leerArchivoGuardado(a, t.dataset.id);
      if (!d) return toast("No encuentro el archivo");
      const w = window.open();
      if (w) w.document.write(d.tipo.includes("pdf") ? `<title>${esc(d.nombre)}</title><iframe src="${d.datos}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>` : `<title>${esc(d.nombre)}</title><img src="${d.datos}" style="max-width:100%">`);
      return;
    }
    if (acc === "quitar-doc") { if (!confirm("¿Borrar este documento?")) return; await A.borrarArchivo(a, t.dataset.id); archivos = []; return pintarDatos(); }
  });

  $("#form").addEventListener("submit", guardarForm);
  $("#form").elements.objetivo.addEventListener("change", mostrarSegunObjetivo);
  $("#zonas-propias").addEventListener("change", e => { $("#zp").hidden = !e.target.checked; });
  // vista previa en directo de sus ritmos mientras escribes las marcas
  $("#form").addEventListener("input", e => { if (/^(m1k|m5k|m10k|m15k|mmedia|mmaraton|ajusteRitmos|edad|sexo|nivel)$/.test(e.target.name || "")) previaRitmos(); });
  document.addEventListener("change", async e => {
    const k = e.target.dataset?.aviso; if (!k) return;
    ajustes.avisos = { ...prefAvisos(), [k]: e.target.checked };
    await A.guardarAjustes(ajustes); for (const x of atletas.filter(x => x.token)) publicar(x);
    toast("Preferencias de avisos guardadas");
  });
  $("#r-aplicar").addEventListener("click", () => {
    const lv = leerMin($("#r-lv").value), sd = leerMin($("#r-sd").value);
    if (isNaN(lv) || isNaN(sd)) return toast("Escribe el tiempo como 1:15 o 75");
    DIAS.forEach((_, i) => { const v = i < 5 ? lv : sd; if (v || $(`#r-${i < 5 ? "lv" : "sd"}`).value.trim()) $(`[data-max="${i}"]`).value = minTxt(v); });
  });
  $("#btn-borrar").addEventListener("click", async () => {
    if (!editando || !confirm(`¿Borrar a ${editando.nombre} y todo su plan? Su enlace dejará de funcionar.`)) return;
    await A.borrar(editando);
    atletas = atletas.filter(x => x !== editando); actual = null; editando = null;
    $("#tab-atleta").hidden = true; history.replaceState(null, "", location.pathname);
    pintarLista(); vista("lista"); toast("Deportista borrado");
  });
  $("#dlg-ses").addEventListener("close", () => cerrarSesion($("#dlg-ses").returnValue));
  $("#sel-plantilla").addEventListener("change", e => {
    const p = plantillas()[+e.target.value]; if (!p) return;
    const f = $("#f-ses");
    f.elements.dep.value = p.dep; f.elements.t.value = p.t; f.elements.min.value = p.min; f.elements.z.value = p.z || "";
    f.elements.p.value = (p.p || []).join("\n"); f.elements.n.value = p.n || ""; f.elements.ej.value = (p.ej || []).map(x => `${x.n} | ${x.s}`).join("\n");
  });
  $("#guardar-plantilla").addEventListener("click", async () => {
    const f = $("#f-ses");
    const nombre = prompt("Nombre de la plantilla:", f.elements.t.value.trim());
    if (!nombre) return;
    const p = { nombre, dep: f.elements.dep.value, t: f.elements.t.value.trim(), min: +f.elements.min.value || 45, z: f.elements.z.value.trim(),
      p: f.elements.p.value.split("\n").map(x => x.trim()).filter(Boolean), n: f.elements.n.value.trim(),
      ej: f.elements.ej.value.split("\n").map(x => x.trim()).filter(Boolean).map(x => { const [n, s_] = x.split("|"); return { n: n.trim(), s: (s_ || "").trim() }; }) };
    ajustes.plantillas = [...(ajustes.plantillas || []), p];
    await A.guardarAjustes(ajustes);
    toast(`Plantilla «${nombre}» guardada`);
  });
  $("#dlg-car").addEventListener("close", () => cerrarCarrera($("#dlg-car").returnValue));
  $("#f-track").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      trackNuevo = leerTrack(await f.text());
      $("#track-info").textContent = `✅ ${f.name}: ${(trackNuevo.dist / 1000).toFixed(2).replace(".", ",")} km · +${trackNuevo.sube} m / −${trackNuevo.baja} m${trackNuevo.conAltura ? "" : " (el archivo no trae altura: previsión en llano)"}`;
      $("#quitar-track").hidden = false;
    } catch (err) { $("#track-info").textContent = "⚠️ " + err.message; }
  });
  $("#quitar-track").addEventListener("click", () => { trackNuevo = null; $("#track-info").textContent = "Sin track"; $("#quitar-track").hidden = true; });
}

document.addEventListener("DOMContentLoaded", init);
