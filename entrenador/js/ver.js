/* Vista del deportista: su semana, su menú, sus carreras y su progreso. Puede registrar entrenos,
   valorar la semana y proponer carreras (se guardan en su buzón y los ve el entrenador). */
import { $, $$, esc, hoy, lunesDe, sumaDias, diaSemana, rangoSemana, fechaLarga, fechaCorta, diasEntre, uid, toast, comprimirImagen, DIAS } from "./util.js?v=202611142037";
import { tipoDia, NOM_TIPO, htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha, htmlSesion, htmlPrevision, htmlProgreso, SENS_TXT, mostrarEjercicio, htmlActividades, htmlDatosAct, mostrarActividad, actPorClave, registrarAct } from "./vista.js?v=202611142037";
import { leerArchivo, fusionar } from "./importar.js?v=202611142037";
import { leerPublico, listarAportes, guardarAporte, borrarAporte, registrarVisita, guardarFoto, leerFoto, borrarFoto } from "./almacen.js?v=202611142037";
import { PRUEBAS, CARGA_TXT } from "./motor.js?v=202611142037";
import { avisar, htmlSuscribir } from "./avisos.js?v=202611142037";
import { htmlHilo, htmlCaja, sinLeerDep, idMensaje } from "./chat.js?v=202611142037";
import { htmlPrediccion } from "./prediccion.js?v=202611142037";
import { calcCarga, htmlCarga, BIEN_PREG, puntuarBien, nivelBien } from "./carga.js?v=202611142037";
import { geoGuardada, pedirUbicacion, tiempoHoy, resumenTiempo, htmlTiempo } from "./tiempo.js?v=202611142037";
import { calcProgreso, mezclarProgreso } from "./progreso.js?v=202611142037";

let P = null, v = "hoy", lunes = lunesDe(hoy()), token = "", aportes = [];
const semanas = () => Object.keys(P.semanas || {}).sort();
/** Sus actividades: las que publicó el entrenador y las que el deportista ha subido al registrar. */
function actividades() {
  const propias = aportes.filter(x => x.tipo === "sesion" && x.act).map(x => ({ ...x.act, titulo: x.act.titulo || x.titulo }));
  return fusionar(P.actividades || [], propias).lista;
}
const regsDe = l => Object.fromEntries(aportes.filter(x => x.tipo === "sesion" && x.lunes === l).map(x => [x.sesId, x]));

async function init() {
  token = new URLSearchParams(location.search).get("d") || "";
  if (!token) return fallo("Este enlace no está completo. Pídele a tu entrenador que te lo vuelva a mandar.");
  try { P = await leerPublico(token); }
  catch (e) { return fallo(e.message === "sin-nube" ? "La app de tu entrenador todavía no está conectada. Prueba más tarde." : "No se ha podido cargar tu plan. Revisa la conexión y vuelve a abrir el enlace."); }
  if (!P) return fallo("Este enlace ya no existe. Pídele a tu entrenador uno nuevo.");
  try { aportes = await listarAportes(token); } catch (e) { aportes = []; }
  if (!new URLSearchParams(location.search).has("yo")) registrarVisita(token, hoy()).catch(() => {}); // el entrenador ve cuántas veces entra
  document.title = `Plan de ${P.nombre.split(" ")[0]}`;
  $("#nombre").textContent = P.nombre;
  $("#objetivo").textContent = P.objetivo || "";
  if (!P.semanas[lunes]) lunes = semanas().filter(l => l <= lunes).pop() || semanas()[0] || lunes;
  $("#barra").hidden = false;
  $("#barra").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { v = b.dataset.v; pintar(); } });
  $("#main").addEventListener("click", clic);
  $("#main").addEventListener("toggle", e => { const d = e.target; if (d.classList?.contains("wday")) { if (d.open) diasAbiertos.add(d.dataset.f); else diasAbiertos.delete(d.dataset.f); } }, true);
  $("#main").addEventListener("change", e => {
    if (e.target.id === "bien-dolor") $("#bien-dolor-txt").hidden = !e.target.checked;
    if (e.target.id === "rec-on" || e.target.id === "rec-h") {
      const r = { ...(recordatorio() || {}), on: $("#rec-on").checked, h: +$("#rec-h").value, prog: [] };
      try { localStorage.setItem(REC, JSON.stringify(r)); } catch (er) { }
      toast(r.on ? `⏰ Te avisaré cada día a las ${r.h}:00 (abre la app al menos cada 2-3 días para que se sigan programando)` : "Recordatorio desactivado");
      programarRecordatorios();
    }
    if (e.target.dataset.chk) { const k = "chk-" + e.target.dataset.car; let o = {}; try { o = JSON.parse(localStorage.getItem(k) || "{}"); } catch (er) { } o[e.target.dataset.chk] = e.target.checked; try { localStorage.setItem(k, JSON.stringify(o)); } catch (er) { } }
  });
  enlazarDialogos();
  pintar();
  botonChat();
  programarRecordatorios();
}
/* ---------------- Chat con el entrenador ---------------- */
let chatRef = "", chatTimer = null;
function botonChat() {
  let b = $("#chat-flot");
  if (!b) { b = document.createElement("button"); b.id = "chat-flot"; b.className = "chat-flot"; b.dataset.acc = "chat"; b.setAttribute("aria-label", "Chat con tu entrenador"); document.body.append(b); b.addEventListener("click", clic); }
  const n = sinLeerDep(aportes).length;
  b.innerHTML = `💬${n ? `<span class="badge">${n}</span>` : ""}`;
}
function dlgChat() {
  let d = $("#dlg-chat");
  if (!d) {
    d = document.createElement("dialog"); d.id = "dlg-chat"; d.className = "hoja chat-dlg"; document.body.append(d);
    d.addEventListener("click", clic);
    d.addEventListener("close", () => { clearInterval(chatTimer); chatRef = ""; });
  }
  return d;
}
async function abrirChat(ref = "") {
  chatRef = ref;
  const d = dlgChat();
  pintarChat();
  if (!d.open) d.showModal();
  await marcarLeidos();
  clearInterval(chatTimer);
  chatTimer = setInterval(async () => { try { const n = await listarAportes(token); const antes = aportes.filter(x => x.tipo === "mensaje").length; aportes = n; if (n.filter(x => x.tipo === "mensaje").length !== antes) { pintarChat(); marcarLeidos(); } } catch (e) { } }, 20000);
}
function pintarChat() {
  const d = dlgChat(), txt = $("#chat-txt")?.value || "";
  d.innerHTML = `<div class="dia-cab"><h3>💬 Tu entrenador</h3><button class="icon-btn" data-acc="chat-cerrar" aria-label="Cerrar">✕</button></div>
    <div class="chat-hilo" id="chat-hilo">${htmlHilo(aportes, "deportista")}</div>${htmlCaja(chatRef)}`;
  $("#chat-txt").value = txt;
  const h = $("#chat-hilo"); h.scrollTop = h.scrollHeight;
}
async function marcarLeidos() {
  const pend = sinLeerDep(aportes);
  for (const m of pend) { m.leido = true; try { await guardarAporte(token, m.id, { tipo: "mensaje", leido: true }); } catch (e) { } }
  botonChat();
}
async function enviarChat() {
  const t = $("#chat-txt").value.trim(); if (!t) return;
  const id = idMensaje(), m = { tipo: "mensaje", de: "deportista", texto: t, t: new Date().toISOString(), visto: false, ...(chatRef ? { ref: chatRef } : {}) };
  try { await guardarAporte(token, id, m); } catch (e) { return toast(errTxt(e, "enviar")); }
  aportes.push({ ...m, id }); chatRef = "";
  if (!new URLSearchParams(location.search).has("yo")) avisarEntrenador(m);
  $("#chat-txt").value = ""; pintarChat(); toast("Enviado a tu entrenador");
}

function fallo(t) { $("#main").innerHTML = `<div class="panel vacio"><div class="big">😕</div><p>${esc(t)}</p></div>`; }

function navSemana() {
  const ls = semanas(), i = ls.indexOf(lunes);
  return `<div class="weeknav">
    <button class="icon-btn" data-nav="-1" ${i <= 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>
    <div class="c"><b>${rangoSemana(lunes)}</b><span>${lunes === lunesDe(hoy()) ? "Esta semana" : lunes > hoy() ? "La semana que viene" : "Pasada"}</span></div>
    <button class="icon-btn" data-nav="1" ${i >= ls.length - 1 ? "disabled" : ""} aria-label="Semana siguiente">›</button>
  </div>`;
}

/* Valoración de la semana */
function htmlValorar(l) {
  const val = aportes.find(x => x.tipo === "semana" && x.lunes === l);
  if (val) return `<article class="dia valoracion"><div class="dia-cab"><h3>📝 Tu valoración de la semana</h3></div>
    <p><b>${SENS_TXT[val.sensacion] || ""}</b>${val.carga ? ` · ${{ mas: "quieres más carga", igual: "seguir igual", menos: "quieres menos carga" }[val.carga]}` : ""}${val.molestias ? " · ⚠️ con molestias" : ""}</p>
    ${val.texto ? `<p>“${esc(val.texto)}”</p>` : ""}<button class="btn sec mini" data-acc="valorar" data-l="${l}">✎ Cambiar</button></article>`;
  return `<article class="dia valoracion pendiente"><div class="dia-cab"><h3>📝 ¿Cómo ha ido la semana?</h3></div>
    <p class="small">Cuéntaselo a tu entrenador al terminarla: así ajusta la siguiente.</p>
    <button class="btn pri" data-acc="valorar" data-l="${l}">Valorar la semana</button></article>`;
}

function pintar() {
  $$("#barra [data-v]").forEach(b => b.toggleAttribute("aria-current", b.dataset.v === v));
  const m = $("#main"), snap = P.semanas[lunes];
  window.scrollTo({ top: 0 });
  if (v === "hoy") {
    const h = hoy(), l0 = lunesDe(h), sh = P.semanas[l0];
    const prox = (P.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
    let html = "";
    if (P.mensaje) html += `<div class="mensaje">💬 ${esc(P.mensaje)}</div>`;
    const L = logros();
    const racha = L.n ? `<button class="racha" data-acc="ir-progreso"><span>🔥 <b>${L.racha}</b> semana${L.racha === 1 ? "" : "s"} seguidas</span><span>✅ <b>${L.n}</b> entrenos</span>${L.km ? `<span>🛣️ <b>${Math.round(L.km)}</b> km</span>` : ""}<span>🏅 ${L.M.filter(m => m[0]).length}/${L.M.length}</span></button>` : "";
    if (prox && !sh) { const d = diasEntre(h, prox.fecha); html += `<button class="cuenta-atras" data-acc="ir-carreras"><b>${d === 0 ? "¡HOY!" : d}</b><span>${d === 0 ? "" : d === 1 ? "día para" : "días para"} <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b>${prox.prev && !prox.prev.falta ? ` · previsión ${esc(fmtT(prox.prev.total))}` : ""}</span></button>`; }
    if (!sh) html += `<div class="panel vacio"><p>Tu entrenador todavía no ha preparado esta semana.</p></div>`;
    else {
      const i = diaSemana(h), d = sh.dias[i], regs = regsDe(l0);
      html += htmlDorsal(d, h, prox, i < 6 ? sh.dias[i + 1] : (P.semanas[sumaDias(l0, 7)]?.dias[0] || null));
      html += htmlBien(h);
      html += htmlResultado(h);
      if (P.ntfy && !recordatorio()) { let no = false; try { no = !!localStorage.getItem("avisos-no"); } catch (e) { } if (!no) html += `<div class="bien-ok"><span>🔔 <b>Activa los avisos</b> y te llegarán al móvil los mensajes de ${esc(P.entrenador ? nomEnt() : "tu entrenador")} y tu entreno de cada día.</span><span><button class="btn pri mini" data-acc="ir-avisos">Activar</button> <button class="link" data-acc="avisos-no">Ahora no</button></span></div>`; }
      if (d.ses.some(x => ["run", "bike"].includes(x.dep))) html += `<div id="tiempo-hoy">${geoGuardada() ? `<p class="small muted">Cargando el tiempo…</p>` : `<button class="btn sec mini" data-acc="ver-tiempo">📍 Ver el tiempo y la mejor hora para entrenar</button>`}</div>`;
      html += "<!--extra-->" + racha;
      html += `<article class="dia hoy"><div class="dia-cab"><h3>Entreno</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
        ${d.ses.length ? d.ses.map(s => htmlSesion(s, false, { regs, registrar: true, abierto: s.dep !== "movilidad" })).join("") + actividades().filter(a => a.fecha === h).map(a => `<div class="reloj"><button class="reloj-b" data-acc="ver-act" data-k="${registrarAct(a)}">⌚ <b>Hecho:</b> ${htmlDatosAct(a)} <span class="mas">Ver detalle ›</span></button></div>`).join("") : `<div class="ses descanso"><div class="ses-cab"><h4>😴 Hoy toca descansar</h4></div><div class="nota">Duerme bien, hidrátate y, si apetece, un paseo suave.</div></div>`}</article>`;
      // entrenos de días anteriores sin registrar
      const sin = sh.dias.slice(0, i).flatMap((dd, k) => dd.ses.filter(s => s.dep !== "movilidad" && !regs[s.id]).map(s => ({ s, k })));
      if (sin.length) html += `<div class="pendientes"><b>Sin registrar esta semana:</b> ${sin.map(x => `<button class="link" data-acc="registrar" data-id="${x.s.id}">${DIAS[x.k]} · ${esc(x.s.t)}</button>`).join(" · ")}</div>`;
      if (i >= 4) html += htmlValorar(l0);
      html += htmlMenuDia(sh, i);
    }
    if (sh) html = html.replace("<!--extra-->", htmlSemanaCarrera(h, prox) + htmlResumenLunes(h));
    m.innerHTML = html;
    if (geoGuardada() && $("#tiempo-hoy")) cargarTiempo();
  } else if (v === "semana") {
    const regs = regsDe(lunes), editable = lunes <= lunesDe(hoy());
    const acts = actividades();
    const fila = i => {
      const d = snap.dias[i], f = sumaDias(lunes, i), t = tipoDia(d.ses), ses = d.ses.filter(x => x.dep !== "movilidad");
      const hechas = ses.filter(x => regs[x.id] && regs[x.id].hecho !== "no").length || acts.filter(a => a.fecha === f && ["run", "bike", "swim", "fuerza"].includes(a.dep)).length;
      const princ = ses.find(x => x.dep !== "fuerza") || ses[0];
      return `<details class="wday t-${t}" data-f="${f}"${f === hoy() || diasAbiertos.has(f) ? " open" : ""}><summary class="wrow${f === hoy() ? " hoy" : ""}">
        <span class="d"><b>${+f.slice(8)}</b><span>${DIAS[i].slice(0, 3)}</span></span><span class="bar"></span>
        <span class="tx"><span class="t">${ses.length ? ses.map(x => esc(x.t)).join(" + ") : "Descanso"}</span><span class="s">${princ?.c ? esc(princ.c.calle) : princ?.z ? esc(princ.z) : ses.length ? "" : "Recuperar también es entrenar"}</span></span>
        <span class="st">${hechas && ses.length ? `<b class="ok">✓</b>` : ""}${ses.length ? `<span>${ses.reduce((x, y) => x + (+y.min || 0), 0)}'</span>` : ""}</span>
      </summary>${htmlDia(snap, i, false, { regs, acts, registrar: editable && f <= hoy() })}</details>`;
    };
    m.innerHTML = navSemana() + (snap ? htmlCabSemana(snap) + `<div class="card semana-l">${snap.dias.map((_, i) => fila(i)).join("")}</div>
      <div class="leyenda">${["calidad", "cuestas", "rodaje", "tirada", "fuerza", "bici", "carrera", "descanso"].filter(t => snap.dias.some(d => tipoDia(d.ses) === t)).map(t => `<span class="t-${t}"><i></i>${NOM_TIPO[t]}</span>`).join("")}</div>
      <div class="fila cal-f"><button class="btn sec mini" data-acc="calendario">📅 Añadir la semana a mi calendario</button></div>` + (editable ? htmlValorar(lunes) : "") : `<div class="panel vacio"><p>Sin plan para esta semana.</p></div>`);
  } else if (v === "menu") {
    m.innerHTML = navSemana() + (snap ? snap.dias.map((_, i) => htmlMenuDia(snap, i)).join("") + `<p class="aviso">Menú orientativo según la carga de cada día.</p>` : "");
  } else if (v === "carreras") {
    const cs = (P.carreras || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const props = aportes.filter(x => x.tipo === "carrera" && (!x.estado || x.estado === "pendiente"));
    m.innerHTML = `<article class="dia"><div class="dia-cab"><h3>Mis carreras</h3><button class="btn pri mini" data-acc="proponer">＋ Proponer</button></div>
      ${cs.length ? cs.map(c => htmlCarreraFicha(c, false, c.prev) + (c.fecha >= hoy() && c.prev ? `<details class="prev-det" ${cs.indexOf(c) === cs.findIndex(x => x.fecha >= hoy()) ? "open" : ""}><summary>Mi previsión kilómetro a kilómetro</summary>${htmlPrevision(c, c.prev)}</details>` : "")).join("") : `<p class="muted">Sin carreras apuntadas.</p>`}
      ${props.length ? `<h4 class="sep">Propuestas (pendientes de tu entrenador)</h4>${props.map(x => `<div class="propuesta"><div><b>${esc(x.nombre)}</b> <span class="small">· ${fechaCorta(x.fecha)} · ${esc(PRUEBAS[x.prueba] || "")}</span></div><button class="quita" data-acc="quitar-prop" data-id="${x.id}" aria-label="Quitar">✕</button></div>`).join("")}` : ""}
    </article>
    ${htmlPrediccion(P.pred, P.zonas, cs.find(c => c.fecha >= hoy()))}
    ${P.zonas ? `<article class="dia zonas">${htmlZonas(P.zonas)}</article>` : ""}
    <p class="aviso">Actualizado el ${new Date(P.actualizado).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}.</p>`;
  } else {
    const propio = calcProgreso({ semanas: P.semanas, aportes }), L = logros();
    m.innerHTML = `<article class="dia medallas"><div class="dia-cab"><h3>🏅 Mis medallas</h3><span class="muted small">${L.M.filter(x => x[0]).length} de ${L.M.length}</span></div>
      <div class="med">${L.M.map(([ok, i, t]) => `<div class="${ok ? "ok" : ""}"><span>${ok ? i : "🔒"}</span><small>${t}</small></div>`).join("")}</div>
      <p class="small">🔥 Racha: <b>${L.racha}</b> semana${L.racha === 1 ? "" : "s"} seguidas entrenando · ✅ ${L.n} entrenos registrados${L.km ? ` · 🛣️ ${Math.round(L.km)} km` : ""}${L.kmAno ? ` · 🗓️ ${L.kmAno} km este año` : ""}</p></article>` + htmlPrediccion(P.pred, P.zonas, (P.carreras || []).filter(c => c.fecha >= hoy()).sort((x, y) => x.fecha.localeCompare(y.fecha))[0]) + htmlCarga(miCarga(), "Mi forma") + htmlZapatillas() + htmlAvisos() + htmlProgreso(mezclarProgreso(P.progreso || [], propio)) + (htmlActividades(actividades().filter(a => a.fecha >= sumaDias(hoy(), -84)), "Mis actividades") || `<p class="muted small">Cuando registres entrenos subiendo el archivo de tu reloj (o tu entrenador suba tu historial), aquí verás todas tus actividades con sus datos.</p>`);
  }
}
/* Calendario: un evento de día completo por sesión (.ics, lo abren Google Calendar, iPhone, Outlook…) */
function descargarCalendario(snap) {
  if (!snap) return;
  const e = t => String(t || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const f = d => d.replace(/-/g, "");
  const ev = [];
  snap.dias.forEach((d, i) => d.ses.forEach(x => {
    const dia = sumaDias(snap.lunes, i);
    ev.push(["BEGIN:VEVENT", `UID:${x.id}-${dia}@dienjamio-entrenador`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${f(dia)}`, `DTEND;VALUE=DATE:${f(sumaDias(dia, 1))}`, `SUMMARY:${e(`${x.t} (${x.min}')`)}`,
      `DESCRIPTION:${e([x.z, ...(x.p || []), ...(x.ej || []).map(j => `${j.n}: ${j.s}`), x.n].filter(Boolean).join("\n"))}`, "END:VEVENT"].join("\r\n"));
  }));
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dienjamio Entrenador//ES", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `entrenos-${snap.lunes}.ics`;
  document.body.append(a); a.click(); a.remove();
  toast("Abre el archivo descargado para añadir los entrenos a tu calendario");
}

/* Racha y medallas: para que apetezca registrar */
function logros() {
  const ses = aportes.filter(x => x.tipo === "sesion" && x.hecho !== "no");
  const n = ses.length, km = ses.reduce((t, x) => t + (parseFloat(String(x.km || 0).replace(",", ".")) || 0), 0);
  const fotos = ses.filter(x => x.img || x.fotos?.length).length, vals = aportes.filter(x => x.tipo === "semana").length;
  const con = new Set(ses.map(x => x.lunes));
  let racha = 0, l = lunesDe(hoy());
  if (!con.has(l)) l = sumaDias(l, -7);
  while (con.has(l)) { racha++; l = sumaDias(l, -7); }
  // semanas seguidas con 3 o más entrenos
  const porSem = {}; ses.forEach(x => { porSem[x.lunes] = (porSem[x.lunes] || 0) + 1; });
  let r3 = 0; l = lunesDe(hoy()); if (!(porSem[l] >= 3)) l = sumaDias(l, -7);
  while (porSem[l] >= 3) { r3++; l = sumaDias(l, -7); }
  // km del año: lo que trae el reloj + lo registrado a mano este año que no venga del reloj
  const ano = hoy().slice(0, 4);
  const kmAno = Math.max(P.kmAno || 0, Math.round(actividades().filter(a => a.dep === "run" && a.fecha?.startsWith(ano)).reduce((t, a) => t + (+a.km || 0), 0)));
  const mk = P.marcas || {}, seg = t => { const p = String(t || "").split(":").map(Number); return p.some(isNaN) || !t ? 0 : p.reduce((x, y) => x * 60 + y, 0); };
  const bajo = (k, lim) => { const t = seg(mk[k]); return t > 0 && t < lim; };
  const carreras = Math.max(P.carrerasHechas || 0, (P.carreras || []).filter(c => c.fecha < hoy()).length);
  const M = [[n >= 1, "🥇", "Primer entreno"], [n >= 10, "🔟", "10 entrenos"], [n >= 25, "🏅", "25 entrenos"], [n >= 50, "💯", "50 entrenos"], [n >= 100, "👑", "100 entrenos"],
    [racha >= 3, "🔥", "3 semanas seguidas"], [racha >= 8, "🚀", "8 semanas seguidas"], [r3 >= 4, "💪", "4 semanas con 3+ entrenos"], [r3 >= 12, "🦾", "12 semanas con 3+ entrenos"],
    [km >= 50 || kmAno >= 50, "🛣️", "50 km"], [km >= 200 || kmAno >= 200, "🌍", "200 km"], [kmAno >= 500, "🗺️", `500 km en ${ano}`], [kmAno >= 1000, "🌋", `1.000 km en ${ano}`],
    [carreras >= 1, "🏁", "Primera carrera"], [carreras >= 5, "🎽", "5 carreras"],
    [bajo("5k", 1800), "⚡", "5K en menos de 30'"], [bajo("5k", 1500), "⚡", "5K en menos de 25'"], [bajo("10k", 3000), "🎯", "10K en menos de 50'"], [bajo("10k", 2700), "🎯", "10K en menos de 45'"],
    [bajo("media", 7200), "🥈", "Media en menos de 2 h"], [bajo("maraton", 14400), "🏆", "Maratón en menos de 4 h"],
    [vals >= 1, "📝", "Primera valoración"], [fotos >= 1, "📷", "Primera captura"]];
  return { n, km, racha, r3, kmAno, M };
}

/* Tarjeta tipo dorsal con el entreno principal de hoy */
/* Dorsal del día: franja del color del tipo, título grande, chinchetas y línea de corte */
const NOM_SES = { recuperacion: "Regenerativo", iniciacion: "Correr y andar", readapt: "Vuelta a correr", activacion: "Activación", test: "Test" };
function htmlDorsal(d, h, prox, man = null) {
  const ses = d.ses.filter(s => s.dep !== "movilidad");
  const s = ses.find(x => x.dep !== "fuerza") || ses[0] || null;
  const t = tipoDia(d.ses);
  const cat = s ? (NOM_SES[s.tipo] || NOM_TIPO[t]) : "Descanso";
  const total = d.ses.reduce((x, y) => x + (+y.min || 0), 0);
  const dias = prox ? diasEntre(h, prox.fecha) : null;
  const est = s?.est?.length > 1 ? `<div class="estr">${s.est.map(([m, n]) => `<i class="n${n}" style="flex-grow:${m};height:${18 + n * 16}%"></i>`).join("")}</div>` : "";
  const fmtT = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + "'" : ""}` : m + "'";
  return `<div class="bib t-${t}">
    <div class="bib-band"><span>${cat}</span><span>${fechaLarga(h).replace(/ de \d{4}$/, "")}</span></div>
    <div class="bib-body"><i class="pin tl"></i><i class="pin tr"></i><i class="pin bl"></i><i class="pin br"></i>
      <div class="bib-title">${s ? esc(s.tipo === "competicion" ? s.t.replace(/^🏁\s*/, "") : s.t) : "Hoy toca descansar"}</div>
      <div class="chips">${total ? `<span class="chip">⏱️ ${fmtT(total)}</span>` : `<span class="chip">😴 Recuperar también es entrenar</span>`}${ses.slice(1).map(x => `<span class="chip">+ ${esc(x.t)}</span>`).join("")}${s?.z && !s.c ? `<span class="chip">${esc(s.z)}</span>` : ""}</div>
      ${est}
      ${s?.c ? `<p class="ent-texto"><span class="c-calle">${esc(s.c.calle)}</span><span class="c-cinta">${esc(s.c.cinta)}</span></p>` : ""}
      ${consejoBien(h, s)}
    </div>
    <div class="bib-foot"><div><div class="k">Mañana</div><div class="n">${man ? (man.ses.length ? man.ses.map(x => esc(x.t)).join(" + ") : "Descanso") : "—"}</div></div>
      ${prox && dias > 0 ? `<button class="cd" data-acc="ir-carreras" title="${esc(prox.nombre || PRUEBAS[prox.prueba])}"><span class="cd-n">${dias}</span><span class="cd-u">día${dias === 1 ? "" : "s"}<br><small>${esc((prox.nombre || PRUEBAS[prox.prueba]).slice(0, 18))}</small></span></button>` : ""}</div>
  </div>`;
}
const fmtT = s => { s = Math.round(s); const h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`; };

const diasAbiertos = new Set(); // días de la semana que el deportista ha desplegado (siguen abiertos al repintar)

/* ---------------- Bienestar diario ---------------- */
let bienTmp = null;
const bienDe = f => aportes.find(x => x.tipo === "bienestar" && x.fecha === f);
function htmlBien(h) {
  const b = bienDe(h);
  if (b && !bienTmp) {
    const p = puntuarBien(b), n = nivelBien(p);
    return `<div class="bien-ok ${n}"><span>${n === "ok" ? "✅" : n === "ojo" ? "🟡" : "🔴"} Hoy te has levantado: <b>${p}/100</b>${b.dolor ? ` · dolor${b.dolorTxt ? ": " + esc(b.dolorTxt) : ""}` : ""}${b.fcRep ? ` · ❤️ ${b.fcRep}` : ""}${b.peso ? ` · ⚖️ ${b.peso} kg` : ""}${b.visto ? `<br><small>👀 ${esc(nomEnt())} lo ha visto</small>` : ""}</span><button class="link" data-acc="bien-editar">Cambiar</button></div>`;
  }
  const t = bienTmp || {};
  return `<article class="dia bien"><div class="dia-cab"><h3>☀️ ¿Cómo te has levantado?</h3><span class="small muted">10 segundos</span></div>
    ${BIEN_PREG.map(([k, n, ico]) => `<div class="bien-f"><b>${n}</b><div class="bien-o">${ico.map((e, i) => `<button type="button" data-acc="bien" data-k="${k}" data-v="${i + 1}" aria-label="${n} ${i + 1} de 5" ${+t[k] === i + 1 ? 'aria-pressed="true"' : ""}>${e}</button>`).join("")}</div></div>`).join("")}
    <div class="bien-extra"><label>❤️ Pulso en reposo <small>(opcional, al despertar)</small><input id="bien-fc" inputmode="numeric" placeholder="ppm" value="${esc(t.fcRep || "")}"></label>
      <label>⚖️ Peso <small>(opcional)</small><input id="bien-peso" inputmode="decimal" placeholder="kg" value="${esc(t.peso || "")}"></label></div>
    <label class="bien-dolor"><input type="checkbox" id="bien-dolor" ${t.dolor ? "checked" : ""}> Tengo algún dolor</label>
    <input id="bien-dolor-txt" placeholder="¿Dónde? (rodilla, gemelo…)" value="${esc(t.dolorTxt || "")}" ${t.dolor ? "" : "hidden"}>
    <button class="btn pri" data-acc="bien-guardar">Guardar</button></article>`;
}
function consejoBien(h, s) {
  const p = puntuarBien(bienDe(h));
  if (p == null || !s || s.dep === "movilidad") return "";
  if (bienDe(h).dolor) return `<div class="dor-aviso mal">🤕 Con dolor: si te cambia la forma de correr o va a más, hoy descansa o haz bici suave y avisa a tu entrenador.</div>`;
  if (p < 45) return `<div class="dor-aviso mal">🔴 Hoy vienes justo: ${["calidad", "test", "largo"].includes(s.tipo) ? "cambia la sesión por un rodaje suave y recorta un 30 %" : "hazlo muy suave y recorta un 30 %"}. Mejor un entreno menos que una lesión.</div>`;
  if (p < 70) return `<div class="dor-aviso ojo">🟡 Escucha al cuerpo: si en el calentamiento no te encuentras mejor, hazlo todo suave.</div>`;
  return "";
}

const errTxt = (e, que) => e.code === "unavailable" || /network|fetch/i.test(e.message || "") ? `Sin conexión: no se ha podido ${que}. Prueba de nuevo en un momento.`
  : e.code === "permission-denied" ? `No se ha podido ${que} (permisos). Avisa a tu entrenador.` : `No se ha podido ${que}: ${e.code || e.message}`;
const nomEnt = () => P.entrenador ? P.entrenador.split(" ")[0] : "Tu entrenador";

/* ---------------- Resumen de la semana pasada (lunes y martes) ---------------- */
function htmlResumenLunes(h) {
  const dia = diaSemana(h);
  if (dia > 1) return "";
  const l = sumaDias(lunesDe(h), -7), clave = "resumen-" + l;
  try { if (localStorage.getItem(clave)) return ""; } catch (e) { }
  const prog = mezclarProgreso(P.progreso || [], calcProgreso({ semanas: P.semanas, aportes })).find(x => x.lunes === l);
  if (!prog || (!prog.sesPlan && !prog.sesHechas)) return "";
  const sh = P.semanas[lunesDe(h)], ses = sh ? sh.dias.flatMap(d => d.ses).filter(x => x.dep !== "movilidad") : [];
  const claveS = ses.filter(x => ["calidad", "largo", "test", "competicion"].includes(x.tipo)).map(x => x.t);
  const pct = prog.sesPlan ? prog.sesHechas / prog.sesPlan : 1;
  const frase = pct >= 0.9 ? "¡Semana redonda! Así se construye la forma 💪" : pct >= 0.6 ? "Buena semana: lo importante es la constancia." : "Semana complicada, pasa: esta la sacamos adelante juntos.";
  return `<article class="dia resumen-l"><div class="dia-cab"><h3>📊 Tu semana pasada</h3><button class="link" data-acc="cerrar-resumen" data-k="${clave}">Cerrar</button></div>
    <div class="rl-kpis"><div><b>${prog.sesHechas}/${prog.sesPlan || prog.sesHechas}</b><span>entrenos</span></div><div><b>${Math.round(prog.hechoMin / 6) / 10} h</b><span>de entreno</span></div>${prog.km ? `<div><b>${String(prog.km).replace(".", ",")}</b><span>km</span></div>` : ""}</div>
    <p>${frase}</p>
    ${sh ? `<p class="small">Esta semana: <b>${esc(sh.fase?.n || "")}</b> · ${Math.round(sh.total / 6) / 10} h${claveS.length ? ` · claves: ${claveS.map(esc).join(", ")}` : ""}</p>` : ""}
  </article>`;
}

/* ---------------- Semana de carrera ---------------- */
const CHECK = [["dorsal", "Dorsal y chip recogidos (o sé dónde y cuándo)"], ["ropa", "Ropa y zapatillas probadas en entrenos (nada nuevo)"], ["imperd", "Imperdibles, reloj cargado, auriculares si se permiten"],
  ["cena", "Cena rica en hidratos y conocida la noche antes"], ["desayuno", "Desayuno 2,5-3 h antes: lo de siempre"], ["hora", "Sé la hora de salida, cómo llegar y dónde aparcar"],
  ["calent", "Calentamiento: 10-15' suave + 3 progresivos"], ["plan", "Me sé mis parciales (pestaña Carreras)"], ["dormir", "Dormir bien las dos noches antes"]];
function htmlSemanaCarrera(h, prox) {
  if (!prox || prox.prioridad === "C") return "";
  const d = diasEntre(h, prox.fecha);
  if (d < 0 || d > 7) return "";
  let ok = {}; try { ok = JSON.parse(localStorage.getItem("chk-" + prox.id) || "{}"); } catch (e) { }
  const p = prox.prev, hechos = CHECK.filter(([k]) => ok[k]).length;
  return `<article class="dia semana-car"><div class="dia-cab"><h3>🏁 ${d === 0 ? "¡Hoy es el día!" : `Semana de carrera · faltan ${d} día${d === 1 ? "" : "s"}`}</h3><span class="small muted">${hechos}/${CHECK.length}</span></div>
    <p><b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b>${p && !p.falta ? ` · ${p.obj ? `objetivo <b>${fmtT(p.obj)}</b> (${Math.floor(p.ritmoObjMedio / 60)}:${String(Math.round(p.ritmoObjMedio % 60)).padStart(2, "0")} /km)` : `previsión <b>${fmtT(p.total)}</b>`}` : ""}</p>
    ${p?.kms?.length && (p.obj || p.real) ? `<p class="small">Primer km a <b>${fmtR(p.obj ? p.kms[0].ritmoObj : p.kms[0].ritmo)}</b>, controlado. Mitad (km ${Math.ceil(p.kms.length / 2)}) en <b>${fmtT(p.obj ? p.kms[Math.ceil(p.kms.length / 2) - 1].acumObj : p.kms[Math.ceil(p.kms.length / 2) - 1].acum)}</b>. <button class="link" data-acc="ir-carreras">Ver todos los parciales</button></p>` : ""}
    <details class="check-d"${d <= 1 ? " open" : ""}><summary>✅ Checklist de carrera (${hechos}/${CHECK.length})</summary><ul class="check">${CHECK.map(([k, t]) => `<li><label><input type="checkbox" data-chk="${k}" data-car="${prox.id}" ${ok[k] ? "checked" : ""}> ${t}</label></li>`).join("")}</ul></details>
    ${d <= 2 ? `<p class="small">💧 Bebe bien estos días y sube un poco los hidratos (pasta, arroz, pan). Nada de experimentos.</p>` : `<p class="small">Esta semana baja el volumen y se mantiene algo de ritmo: es normal sentirse «raro». Confía.</p>`}
  </article>`;
}
const fmtR = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/* ---------------- ¿Cómo fue la carrera? ---------------- */
function htmlResultado(h) {
  const cs = (P.carreras || []).filter(c => c.fecha <= h && diasEntre(c.fecha, h) <= 5);
  return cs.map(c => {
    const r = aportes.find(x => x.id === "res-" + c.id);
    if (r) return diasEntre(c.fecha, h) <= 2 ? `<div class="bien-ok ok"><span>🏅 ${esc(c.nombre)}: <b>${esc(r.tiempo || "—")}</b>${r.puesto ? ` · puesto ${esc(r.puesto)}` : ""}${r.visto ? `<br><small>👀 ${esc(nomEnt())} lo ha visto</small>` : ""}</span></div>` : "";
    return `<article class="dia resultado"><div class="dia-cab"><h3>🏁 ¿Cómo fue la ${esc(c.nombre)}?</h3></div>
      <div class="res-f"><label>Tiempo oficial<input id="res-t-${c.id}" placeholder="48:21" inputmode="numeric"></label><label>Puesto <small>(opcional)</small><input id="res-p-${c.id}" placeholder="125"></label></div>
      <label>Sensaciones<select id="res-s-${c.id}"><option value="genial">🤩 Genial</option><option value="bien" selected>💪 Bien</option><option value="regular">😐 Regular</option><option value="mal">😣 Mal</option></select></label>
      <label>Cuéntale cómo fue <small>(opcional)</small><textarea id="res-x-${c.id}" rows="2" placeholder="Salida, cuestas, cómo acabaste…"></textarea></label>
      <button class="btn pri" data-acc="guardar-res" data-id="${c.id}">Guardar resultado</button></article>`;
  }).join("");
}

/* ---------------- Tiempo ---------------- */
async function cargarTiempo() {
  const el = $("#tiempo-hoy"); if (!el) return;
  try {
    const g = geoGuardada() || await pedirUbicacion();
    const d = await tiempoHoy(g);
    const ref = P.zonas?.tipos?.rodaje ? (P.zonas.tipos.rodaje[0] + P.zonas.tipos.rodaje[1]) / 2 : 360;
    if ($("#tiempo-hoy")) $("#tiempo-hoy").innerHTML = htmlTiempo(resumenTiempo(d, ref));
  } catch (e) { if ($("#tiempo-hoy")) $("#tiempo-hoy").innerHTML = `<p class="small muted">⚠️ ${esc(e.message)}</p>`; }
}

/* ---------------- Forma (carga) ---------------- */
function miCarga() {
  return calcCarga({ semanas: P.semanas, aportes, actividades: P.actividades || [], Z: { fcmax: P.zonas?.fcmax, fcrep: P.zonas?.fcrep }, mujer: P.mujer });
}

/* ---------------- Avisos al móvil (ntfy) ---------------- */
const REC = "entrenador.recordatorio";
const recordatorio = () => { try { return JSON.parse(localStorage.getItem(REC) || "null"); } catch (e) { return null; } };
function htmlAvisos() {
  if (!P.ntfy) return "";
  const r = recordatorio();
  return `<article class="dia avisos" id="avisos"><div class="dia-cab"><h3>🔔 Avisos en tu móvil</h3></div>
    <p class="small">Te avisa cuando ${esc(P.entrenador ? nomEnt() : "tu entrenador")} te escribe o comenta tus entrenos y, si quieres, cada mañana con el entreno del día.</p>
    ${htmlSuscribir(P.ntfy, "tú")}
    <label class="chk"><input type="checkbox" id="rec-on" ${r?.on ? "checked" : ""}> Recordarme el entreno del día a las <select id="rec-h">${[6, 7, 8, 9, 10, 12, 14, 17, 19].map(h => `<option value="${h}" ${(r?.h ?? 8) === h ? "selected" : ""}>${h}:00</option>`).join("")}</select></label>
  </article>`;
}
/** Programa en ntfy el recordatorio de los próximos 2 días (ntfy guarda avisos programados hasta 3 días). */
async function programarRecordatorios() {
  const r = recordatorio();
  if (!r?.on || !P.ntfy) return;
  const hechos = new Set(r.prog || []);
  for (let i = 0; i <= 2; i++) {
    const f = sumaDias(hoy(), i), l = lunesDe(f), d = P.semanas[l]?.dias?.[diaSemana(f)];
    const cuando = new Date(f + "T" + String(r.h).padStart(2, "0") + ":00:00");
    if (!d || hechos.has(f + "@" + r.h) || cuando < Date.now() + 60000) continue;
    const ses = d.ses.filter(x => x.dep !== "movilidad");
    const txt = ses.length ? ses.map(x => `${x.t} (${x.min}')${x.c ? " · " + x.c.calle : ""}`).join("\n") : "Hoy toca descansar: duerme bien e hidrátate 😴";
    const ok = await avisar(P.ntfy, { titulo: ses.length ? "🏃 Tu entreno de hoy" : "😴 Hoy descanso", texto: txt, click: location.href.split("#")[0], en: cuando, tags: ["runner"] });
    if (ok) hechos.add(f + "@" + r.h);
  }
  try { localStorage.setItem(REC, JSON.stringify({ ...r, prog: [...hechos].filter(x => x >= sumaDias(hoy(), -1)) })); } catch (e) { }
}

/* ---------------- Zapatillas ---------------- */
const material = () => aportes.find(x => x.id === "material")?.zap || [];
function kmZap(z) {
  const fin = z.hasta || "9999";
  let km = actividades().filter(a => a.dep === "run" && a.fecha >= z.desde && a.fecha < fin).reduce((t, a) => t + (+a.km || 0), 0);
  km += aportes.filter(r => r.tipo === "sesion" && !r.act && r.hecho !== "no" && r.lunes).filter(r => { const f = sumaDias(r.lunes, r.dia || 0); return f >= z.desde && f < fin; })
    .reduce((t, r) => t + (parseFloat(String(r.km || 0).replace(",", ".")) || 0), 0);
  return Math.round((+z.previos || 0) + km);
}
function htmlZapatillas() {
  const zs = material();
  const fila = z => {
    const km = kmZap(z), pct = Math.min(100, km / 800 * 100), n = km >= 800 ? "mal" : km >= 600 ? "ojo" : "ok";
    return `<div class="zap ${z.hasta ? "retirada" : ""}"><div class="zap-t"><b>👟 ${esc(z.nombre)}</b><span>${km} km${z.hasta ? " · retiradas" : n === "mal" ? " · toca cambiarlas" : n === "ojo" ? " · ve pensando en cambiarlas" : ""}</span></div>
      <div class="zap-b"><i class="${n}" style="width:${pct}%"></i></div>
      ${z.hasta ? "" : `<button class="link" data-acc="zap-retirar" data-id="${z.id}">Retirar</button>`}</div>`;
  };
  return `<article class="dia zapas"><div class="dia-cab"><h3>👟 Mis zapatillas</h3><span class="small muted">Duran ~600-800 km</span></div>
    ${zs.length ? zs.slice().sort((a, b) => !!a.hasta - !!b.hasta).map(fila).join("") : `<p class="small muted">Apúntalas y se suman solas los km que corras con ellas.</p>`}
    <div class="zap-add"><input id="zap-n" placeholder="Modelo (p. ej. Pegasus 41)"><input id="zap-k" inputmode="numeric" placeholder="km que ya tienen"><button class="btn sec mini" data-acc="zap-add">＋ Añadir</button></div></article>`;
}

/* ---------------- Acciones ---------------- */
let regSes = null, fotos = [], regAct = undefined; // fotos: [{ id?, thumb, full? }]
function buscarSesion(id) {
  for (const l of semanas()) { const s = P.semanas[l]; for (let i = 0; i < 7; i++) { const x = s.dias[i].ses.find(y => y.id === id); if (x) return { l, i, s: x }; } }
  return null;
}
async function clic(e) {
  const b = e.target.closest("[data-nav],[data-acc]");
  if (!b) return;
  if (b.dataset.nav) { const ls = semanas(), i = ls.indexOf(lunes) + (+b.dataset.nav); if (ls[i]) { lunes = ls[i]; pintar(); } return; }
  const acc = b.dataset.acc;
  if (acc === "ir-carreras") { v = "carreras"; return pintar(); }
  if (acc === "ir-progreso") { v = "progreso"; return pintar(); }
  if (acc === "calendario") return descargarCalendario(P.semanas[lunes]);
  if (acc === "hecho-rapido") {
    const r = buscarSesion(b.dataset.id); if (!r) return;
    return guardar(`ses-${r.l}-${r.s.id}`, { tipo: "sesion", lunes: r.l, dia: r.i, sesId: r.s.id, titulo: r.s.t, min: r.s.min, hecho: "si", visto: false }, "✅ ¡Hecho! Bien trabajado");
  }
  if (acc === "ejercicio") return mostrarEjercicio(b.dataset.n, P.videos || {});
  if (acc === "ver-act") return mostrarActividad(actPorClave(b.dataset.k));
  if (acc === "registrar") {
    const r = buscarSesion(b.dataset.id); if (!r) return;
    regSes = r; regAct = undefined;
    const prev = aportes.find(x => x.id === `ses-${r.l}-${r.s.id}`) || {};
    const f = $("#f-reg");
    f.reset();
    $("#reg-t").textContent = `${DIAS[r.i]} · ${r.s.t}`;
    f.elements.hecho.value = prev.hecho || "si";
    for (const k of ["rpe", "km", "tiempo", "fc", "texto"]) f.elements[k].value = prev[k] || "";
    fotos = (prev.thumbs || []).map((t, k) => ({ id: prev.fotos?.[k], thumb: t }));
    if (prev.img) fotos.unshift({ legado: true, thumb: prev.img });
    pintarFotos();
    $("#reg-act").innerHTML = prev.act ? `✅ ${htmlDatosAct(prev.act)}` : "";
    $("#dlg-reg").returnValue = ""; $("#dlg-reg").showModal();
    return;
  }
  if (acc === "chat") return abrirChat();
  if (acc === "copiar-canal") { try { await navigator.clipboard.writeText(b.dataset.c); toast("Copiado"); } catch (er) { prompt("Copia el nombre del canal:", b.dataset.c); } return; }
  if (acc === "probar-aviso") { const ok = await avisar(b.dataset.c, { titulo: "🔔 ¡Avisos activados!", texto: "Así te llegarán los mensajes de tu entrenador.", tags: ["white_check_mark"] }); return toast(ok ? "Aviso enviado: debería llegarte en unos segundos" : "No se ha podido enviar (revisa la conexión)"); }
  if (acc === "avisos-no") { try { localStorage.setItem("avisos-no", "1"); } catch (er) { } return pintar(); }
  if (acc === "ir-avisos") { v = "progreso"; pintar(); setTimeout(() => $("#avisos")?.scrollIntoView({ behavior: "smooth" }), 50); return; }
  if (acc === "cerrar-resumen") { try { localStorage.setItem(b.dataset.k, "1"); } catch (er) { } return pintar(); }
  if (acc === "guardar-res") {
    const id = b.dataset.id, c = (P.carreras || []).find(x => x.id === id); if (!c) return;
    const t = $(`#res-t-${id}`).value.trim();
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return toast("Escribe el tiempo así: 48:21 o 1:45:30");
    const obj = c.prev?.obj, seg = t.split(":").map(Number).reduce((x, y) => x * 60 + y, 0);
    return guardar("res-" + id, { tipo: "resultado", carreraId: id, nombre: c.nombre, prueba: c.prueba, fecha: c.fecha, tiempo: t, puesto: $(`#res-p-${id}`).value.trim(), sens: $(`#res-s-${id}`).value, texto: $(`#res-x-${id}`).value.trim(), visto: false },
      obj && seg <= obj ? "🎉 ¡Objetivo conseguido! Enhorabuena" : "🏅 Resultado guardado. ¡Enhorabuena por terminarla!");
  }
  if (acc === "chat-ses") { const r = buscarSesion(b.dataset.id); return abrirChat(r ? `${r.s.t} (${DIAS[r.i]} ${fechaCorta(sumaDias(r.l, r.i))})` : ""); }
  if (acc === "chat-cerrar") return dlgChat().close();
  if (acc === "chat-sin-ref") { chatRef = ""; return pintarChat(); }
  if (acc === "chat-enviar") return enviarChat();
  if (acc === "bien") {
    bienTmp = { ...(bienTmp || bienDe(hoy()) || {}), [b.dataset.k]: +b.dataset.v, dolor: $("#bien-dolor")?.checked || false, dolorTxt: $("#bien-dolor-txt")?.value || "", fcRep: $("#bien-fc")?.value || "", peso: $("#bien-peso")?.value || "" };
    return pintar();
  }
  if (acc === "bien-editar") { bienTmp = { ...bienDe(hoy()) }; return pintar(); }
  if (acc === "bien-guardar") {
    const t = { ...(bienTmp || {}), dolor: $("#bien-dolor").checked, dolorTxt: $("#bien-dolor").checked ? $("#bien-dolor-txt").value.trim() : "" };
    const fc = parseInt($("#bien-fc").value, 10), peso = parseFloat($("#bien-peso").value.replace(",", "."));
    if ($("#bien-fc").value && !(fc >= 30 && fc <= 110)) return toast("El pulso en reposo suele estar entre 35 y 90 ppm: revísalo.");
    if ($("#bien-peso").value && !(peso >= 30 && peso <= 200)) return toast("Revisa el peso.");
    if (BIEN_PREG.some(([k]) => !t[k])) return toast("Marca las cuatro: sueño, energía, piernas y ánimo.");
    const h = hoy(), d = { tipo: "bienestar", fecha: h, sueno: t.sueno, energia: t.energia, piernas: t.piernas, animo: t.animo, dolor: t.dolor, dolorTxt: t.dolorTxt, puntos: puntuarBien(t), visto: false, ...(fc ? { fcRep: fc } : {}), ...(peso ? { peso: Math.round(peso * 10) / 10 } : {}) };
    bienTmp = null;
    return guardar(`bien-${h}`, d, puntuarBien(t) >= 70 ? "💪 ¡A por el día!" : "Anotado: tu entrenador lo verá");
  }
  if (acc === "ver-tiempo") { $("#tiempo-hoy").innerHTML = `<p class="small muted">Buscando tu ubicación…</p>`; return cargarTiempo(); }
  if (acc === "zap-add") {
    const nombre = $("#zap-n").value.trim(); if (!nombre) return toast("Escribe el modelo de las zapatillas.");
    const zap = [...material(), { id: uid(6), nombre, previos: parseInt($("#zap-k").value, 10) || 0, desde: hoy(), hasta: "" }];
    return guardar("material", { tipo: "material", zap }, "👟 Zapatillas añadidas");
  }
  if (acc === "zap-retirar") {
    if (!confirm("¿Retirar estas zapatillas? Dejarán de sumar kilómetros.")) return;
    const zap = material().map(z => z.id === b.dataset.id ? { ...z, hasta: hoy() } : z);
    return guardar("material", { tipo: "material", zap }, "Zapatillas retiradas");
  }
  if (acc === "valorar") {
    const l = b.dataset.l, prev = aportes.find(x => x.id === `sem-${l}`) || {};
    const f = $("#f-val"); f.reset(); f.dataset.l = l;
    f.elements.sensacion.value = prev.sensacion || "bien"; f.elements.carga.value = prev.carga || "igual";
    f.elements.molestias.checked = !!prev.molestias; f.elements.molestiasTxt.value = prev.molestiasTxt || ""; f.elements.texto.value = prev.texto || "";
    $("#dlg-val").returnValue = ""; $("#dlg-val").showModal();
    return;
  }
  if (acc === "proponer") { $("#f-prop").reset(); $("#dlg-prop").returnValue = ""; $("#dlg-prop").showModal(); return; }
  if (acc === "quitar-prop") { if (!confirm("¿Quitar esta propuesta?")) return; await borrarAporte(token, b.dataset.id); aportes = aportes.filter(x => x.id !== b.dataset.id); return pintar(); }
  if (acc === "ver-foto") {
    const img = await leerFoto(token, b.dataset.f).catch(() => null) || b.querySelector("img")?.src;
    const w = window.open(); if (w && img) w.document.write(`<title>Captura</title><body style="margin:0;background:#000"><img src="${img}" style="max-width:100%;display:block;margin:auto">`);
    return;
  }
  if (acc === "ver-img") { const src = b.querySelector("img")?.src; const w = window.open(); if (w && src) w.document.write(`<title>Captura</title><img src="${src}" style="max-width:100%">`); }
}

/** Aviso al móvil del entrenador según lo que ha registrado el deportista. */
function avisarEntrenador(d) {
  if (!P.ntfyEnt) return;
  const pa = P.avisosEnt || {}, n = P.nombre.split(" ")[0], click = new URL(`index.html?a=${P.id || ""}`, location.href).href;
  let t = null, x = "", pr = 3;
  if (d.tipo === "sesion" && pa.registros !== false) { t = `${d.hecho === "no" ? "❌" : "✅"} ${n}: ${d.titulo || "entreno"}`; x = [d.hecho === "no" ? "No lo ha hecho" : d.hecho === "parcial" ? "Hecho a medias" : "Hecho", d.rpe && `RPE ${d.rpe}`, d.km && `${d.km} km`, d.tiempo, d.texto && `«${d.texto}»`].filter(Boolean).join(" · "); }
  else if (d.tipo === "bienestar" && pa.bienestar !== false && (d.dolor || d.puntos < 45)) { t = `${d.dolor ? "🤕" : "🔴"} ${n} se ha levantado ${d.dolor ? "con dolor" : "mal"}`; x = `${d.puntos}/100${d.dolor ? ` · dolor: ${d.dolorTxt || "sin detallar"}` : ""}`; pr = 4; }
  else if (d.tipo === "mensaje" && pa.mensajes !== false) { t = `💬 ${n}`; x = d.texto; pr = 4; }
  else if (d.tipo === "resultado" && pa.resultados !== false) { t = `🏅 ${n}: ${d.nombre}`; x = `${d.tiempo}${d.puesto ? ` · puesto ${d.puesto}` : ""}${d.texto ? ` · «${d.texto}»` : ""}`; }
  else if (d.tipo === "semana" && pa.valoraciones !== false) { t = `📝 ${n} ha valorado su semana`; x = `${SENS_TXT[d.sensacion] || ""}${d.molestias ? " · ⚠️ molestias" : ""}${d.texto ? ` · «${d.texto}»` : ""}`; }
  else if (d.tipo === "carrera") { t = `🏁 ${n} propone una carrera`; x = `${d.nombre} · ${d.fecha}`; }
  if (t) avisar(P.ntfyEnt, { titulo: t, texto: x || " ", click, prioridad: pr, tags: ["runner"] });
}
async function guardar(id, datos, ok) {
  const antes = logros().M.filter(m => m[0]).map(m => m[2]);
  try {
    await guardarAporte(token, id, datos);
    if (!new URLSearchParams(location.search).has("yo")) avisarEntrenador(datos);
    const i = aportes.findIndex(x => x.id === id), nuevo = { ...(aportes[i] || {}), ...datos, id, visto: false };
    if (i >= 0) aportes[i] = nuevo; else aportes.push(nuevo);
    const nueva = logros().M.find(m => m[0] && !antes.includes(m[2]));
    toast(nueva ? `${nueva[1]} ¡Medalla nueva: ${nueva[2]}!` : ok); pintar();
  } catch (e) { toast(errTxt(e, "guardar")); }
}

function pintarFotos() {
  $("#reg-fotos").innerHTML = fotos.map((f, k) => `<div class="fc"><img src="${f.thumb}" alt=""><button type="button" class="fc-x" data-quitar-foto="${k}" aria-label="Quitar">✕</button></div>`).join("");
}
function enlazarDialogos() {
  $("#reg-foto-in").addEventListener("change", async e => {
    const files = [...e.target.files].slice(0, Math.max(0, 8 - fotos.length)); e.target.value = "";
    if (!files.length) return toast("Máximo 8 fotos por entreno");
    for (const f of files) {
      try { fotos.push({ full: await comprimirImagen(f, 1600, 0.8), thumb: await comprimirImagen(f, 260, 0.6) }); pintarFotos(); }
      catch (err) { toast(err.message); }
    }
  });
  $("#reg-fotos").addEventListener("click", e => { const b = e.target.closest("[data-quitar-foto]"); if (!b) return; fotos.splice(+b.dataset.quitarFoto, 1); pintarFotos(); });
  $("#reg-act-in").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    $("#reg-act").textContent = "⏳ Leyendo…";
    try {
      const a = (await leerArchivo(f))[0];
      if (!a) throw new Error("no trae ninguna actividad");
      regAct = { fecha: a.fecha, dep: a.dep, km: a.km, dur: a.dur, fcMed: a.fcMed || null, fcMax: a.fcMax || null, potMed: a.potMed || null, mejores: a.mejores || {}, hr20: a.hr20 || null,
        sube: a.sube ?? null, cad: a.cad || null, kcal: a.kcal || null, det: a.det || null, fuente: "Subida por el deportista" };
      const fm = $("#f-reg");
      if (a.km) fm.elements.km.value = String(a.km).replace(".", ",");
      if (a.dur) fm.elements.tiempo.value = fmtT(a.dur);
      if (a.fcMed) fm.elements.fc.value = a.fcMed;
      $("#reg-act").innerHTML = `✅ ${htmlDatosAct(regAct)}`;
    } catch (err) { $("#reg-act").textContent = "⚠️ No he podido leerla: " + err.message; }
  });
  $("#dlg-reg").addEventListener("close", async () => {
    if ($("#dlg-reg").returnValue !== "guardar" || !regSes) return;
    const f = $("#f-reg"), r = regSes;
    const d = { tipo: "sesion", lunes: r.l, dia: r.i, sesId: r.s.id, titulo: r.s.t, min: r.s.min, hecho: f.elements.hecho.value, rpe: f.elements.rpe.value, km: f.elements.km.value.trim(), tiempo: f.elements.tiempo.value.trim(), fc: f.elements.fc.value.trim(), texto: f.elements.texto.value.trim(), visto: false };
    if (regAct !== undefined) d.act = regAct;
    // fotos: subir las nuevas una a una y quitar las que se han borrado
    const prev = aportes.find(x => x.id === `ses-${r.l}-${r.s.id}`) || {};
    try {
      toast("Subiendo fotos…");
      for (const fo of fotos) if (fo.full && !fo.id) { fo.id = uid(14); await guardarFoto(token, fo.id, fo.full); }
      for (const id of (prev.fotos || [])) if (!fotos.some(fo => fo.id === id)) await borrarFoto(token, id).catch(() => {});
    } catch (err) { return toast("No se han podido subir las fotos: " + (err.code || err.message)); }
    const nuevas = fotos.filter(fo => !fo.legado);
    d.fotos = nuevas.map(fo => fo.id); d.thumbs = nuevas.map(fo => fo.thumb);
    if (!fotos.some(fo => fo.legado)) d.img = "";
    await guardar(`ses-${r.l}-${r.s.id}`, d, "Entreno registrado. ¡Bien hecho!");
  });
  $("#dlg-val").addEventListener("close", async () => {
    if ($("#dlg-val").returnValue !== "guardar") return;
    const f = $("#f-val"), l = f.dataset.l;
    await guardar(`sem-${l}`, { tipo: "semana", lunes: l, sensacion: f.elements.sensacion.value, carga: f.elements.carga.value, molestias: f.elements.molestias.checked, molestiasTxt: f.elements.molestiasTxt.value.trim(), texto: f.elements.texto.value.trim(), visto: false }, "Gracias: tu entrenador ya lo tiene");
  });
  $("#dlg-prop").addEventListener("close", async () => {
    if ($("#dlg-prop").returnValue !== "guardar") return;
    const f = $("#f-prop");
    const d = Object.fromEntries(["nombre", "fecha", "prueba", "lugar", "web", "objetivo", "texto"].map(k => [k, f.elements[k].value.trim()]));
    if (!d.nombre || !d.fecha) return toast("Pon al menos el nombre y la fecha");
    await guardar(`car-${uid(10)}`, { tipo: "carrera", estado: "pendiente", visto: false, ...d }, "Carrera enviada a tu entrenador");
  });
}

document.addEventListener("DOMContentLoaded", init);
