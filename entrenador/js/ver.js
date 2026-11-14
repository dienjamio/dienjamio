/* Vista del deportista: su semana, su menú, sus carreras y su progreso. Puede registrar entrenos,
   valorar la semana y proponer carreras (se guardan en su buzón y los ve el entrenador). */
import { $, $$, esc, hoy, lunesDe, sumaDias, diaSemana, rangoSemana, fechaLarga, fechaCorta, diasEntre, uid, toast, comprimirImagen, DIAS } from "./util.js?v=202611141819";
import { htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha, htmlSesion, htmlPrevision, htmlProgreso, SENS_TXT, mostrarEjercicio, htmlActividades, htmlDatosAct } from "./vista.js?v=202611141819";
import { leerArchivo, fusionar } from "./importar.js?v=202611141819";
import { leerPublico, listarAportes, guardarAporte, borrarAporte, registrarVisita, guardarFoto, leerFoto, borrarFoto } from "./almacen.js?v=202611141819";
import { PRUEBAS, CARGA_TXT } from "./motor.js?v=202611141819";
import { calcProgreso, mezclarProgreso } from "./progreso.js?v=202611141819";

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
  enlazarDialogos();
  pintar();
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
    if (L.n) html += `<button class="racha" data-acc="ir-progreso"><span>🔥 <b>${L.racha}</b> semana${L.racha === 1 ? "" : "s"} seguidas</span><span>✅ <b>${L.n}</b> entrenos</span>${L.km ? `<span>🛣️ <b>${Math.round(L.km)}</b> km</span>` : ""}<span>🏅 ${L.M.filter(m => m[0]).length}/${L.M.length}</span></button>`;
    if (prox) { const d = diasEntre(h, prox.fecha); html += `<button class="cuenta-atras" data-acc="ir-carreras"><b>${d === 0 ? "¡HOY!" : d}</b><span>${d === 0 ? "" : d === 1 ? "día para" : "días para"} <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b>${prox.prev && !prox.prev.falta ? ` · previsión ${esc(fmtT(prox.prev.total))}` : ""}</span></button>`; }
    if (!sh) html += `<div class="panel vacio"><p>Tu entrenador todavía no ha preparado esta semana.</p></div>`;
    else {
      const i = diaSemana(h), d = sh.dias[i], regs = regsDe(l0);
      html += `<h2 class="hoy-t">${fechaLarga(h)}</h2>`;
      html += `<article class="dia hoy"><div class="dia-cab"><h3>Entreno</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
        ${d.ses.length ? d.ses.map(s => htmlSesion(s, false, { regs, registrar: true })).join("") + actividades().filter(a => a.fecha === h).map(a => `<div class="reloj">⌚ <b>Hecho:</b> ${htmlDatosAct(a)}</div>`).join("") : `<div class="ses descanso"><div class="ses-cab"><h4>😴 Hoy toca descansar</h4></div><div class="nota">Duerme bien, hidrátate y, si apetece, un paseo suave.</div></div>`}</article>`;
      // entrenos de días anteriores sin registrar
      const sin = sh.dias.slice(0, i).flatMap((dd, k) => dd.ses.filter(s => s.dep !== "movilidad" && !regs[s.id]).map(s => ({ s, k })));
      if (sin.length) html += `<div class="pendientes"><b>Sin registrar esta semana:</b> ${sin.map(x => `<button class="link" data-acc="registrar" data-id="${x.s.id}">${DIAS[x.k]} · ${esc(x.s.t)}</button>`).join(" · ")}</div>`;
      if (i >= 4) html += htmlValorar(l0);
      html += htmlMenuDia(sh, i);
      const man = sh.dias[(i + 1) % 7];
      if (i < 6) html += `<div class="manana"><b>Mañana:</b> ${man.ses.length ? man.ses.map(s => esc(s.t)).join(" + ") : "descanso"}</div>`;
    }
    m.innerHTML = html;
  } else if (v === "semana") {
    const regs = regsDe(lunes), editable = lunes <= lunesDe(hoy());
    const acts = actividades();
    m.innerHTML = navSemana() + (snap ? htmlCabSemana(snap) + snap.dias.map((_, i) => htmlDia(snap, i, false, { regs, acts, registrar: editable && sumaDias(lunes, i) <= hoy() })).join("") + (editable ? htmlValorar(lunes) : "") : `<div class="panel vacio"><p>Sin plan para esta semana.</p></div>`);
  } else if (v === "menu") {
    m.innerHTML = navSemana() + (snap ? snap.dias.map((_, i) => htmlMenuDia(snap, i)).join("") + `<p class="aviso">Menú orientativo según la carga de cada día.</p>` : "");
  } else if (v === "carreras") {
    const cs = (P.carreras || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const props = aportes.filter(x => x.tipo === "carrera" && (!x.estado || x.estado === "pendiente"));
    m.innerHTML = `<article class="dia"><div class="dia-cab"><h3>Mis carreras</h3><button class="btn pri mini" data-acc="proponer">＋ Proponer</button></div>
      ${cs.length ? cs.map(c => htmlCarreraFicha(c, false, c.prev) + (c.fecha >= hoy() && c.prev ? `<details class="prev-det" ${cs.indexOf(c) === cs.findIndex(x => x.fecha >= hoy()) ? "open" : ""}><summary>Mi previsión kilómetro a kilómetro</summary>${htmlPrevision(c, c.prev)}</details>` : "")).join("") : `<p class="muted">Sin carreras apuntadas.</p>`}
      ${props.length ? `<h4 class="sep">Propuestas (pendientes de tu entrenador)</h4>${props.map(x => `<div class="propuesta"><div><b>${esc(x.nombre)}</b> <span class="small">· ${fechaCorta(x.fecha)} · ${esc(PRUEBAS[x.prueba] || "")}</span></div><button class="quita" data-acc="quitar-prop" data-id="${x.id}" aria-label="Quitar">✕</button></div>`).join("")}` : ""}
    </article>
    ${P.zonas ? `<article class="dia zonas">${htmlZonas(P.zonas)}</article>` : ""}
    <p class="aviso">Actualizado el ${new Date(P.actualizado).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}.</p>`;
  } else {
    const propio = calcProgreso({ semanas: P.semanas, aportes }), L = logros();
    m.innerHTML = `<article class="dia medallas"><div class="dia-cab"><h3>🏅 Mis medallas</h3><span class="muted small">${L.M.filter(x => x[0]).length} de ${L.M.length}</span></div>
      <div class="med">${L.M.map(([ok, i, t]) => `<div class="${ok ? "ok" : ""}"><span>${ok ? i : "🔒"}</span><small>${t}</small></div>`).join("")}</div>
      <p class="small">🔥 Racha: <b>${L.racha}</b> semana${L.racha === 1 ? "" : "s"} seguidas entrenando · ✅ ${L.n} entrenos registrados${L.km ? ` · 🛣️ ${Math.round(L.km)} km` : ""}</p></article>` + htmlProgreso(mezclarProgreso(P.progreso || [], propio)) + (htmlActividades(actividades().filter(a => a.fecha >= sumaDias(hoy(), -84)), "Mis actividades") || `<p class="muted small">Cuando registres entrenos subiendo el archivo de tu reloj (o tu entrenador suba tu historial), aquí verás todas tus actividades con sus datos.</p>`);
  }
}
/* Racha y medallas: para que apetezca registrar */
function logros() {
  const ses = aportes.filter(x => x.tipo === "sesion" && x.hecho !== "no");
  const n = ses.length, km = ses.reduce((t, x) => t + (parseFloat(String(x.km || 0).replace(",", ".")) || 0), 0);
  const fotos = ses.filter(x => x.img).length, vals = aportes.filter(x => x.tipo === "semana").length;
  const con = new Set(ses.map(x => x.lunes));
  let racha = 0, l = lunesDe(hoy());
  if (!con.has(l)) l = sumaDias(l, -7);
  while (con.has(l)) { racha++; l = sumaDias(l, -7); }
  const M = [[n >= 1, "🥇", "Primer entreno"], [n >= 10, "🔟", "10 entrenos"], [n >= 25, "🏅", "25 entrenos"], [n >= 50, "💯", "50 entrenos"],
    [racha >= 3, "🔥", "3 semanas seguidas"], [racha >= 8, "🚀", "8 semanas seguidas"], [km >= 50, "🛣️", "50 km"], [km >= 200, "🌍", "200 km"],
    [vals >= 1, "📝", "Primera valoración"], [fotos >= 1, "📷", "Primera captura"]];
  return { n, km, racha, M };
}
const fmtT = s => { s = Math.round(s); const h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`; };

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
  if (acc === "hecho-rapido") {
    const r = buscarSesion(b.dataset.id); if (!r) return;
    return guardar(`ses-${r.l}-${r.s.id}`, { tipo: "sesion", lunes: r.l, dia: r.i, sesId: r.s.id, titulo: r.s.t, min: r.s.min, hecho: "si", visto: false }, "✅ ¡Hecho! Bien trabajado");
  }
  if (acc === "ejercicio") return mostrarEjercicio(b.dataset.n, P.videos || {});
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

async function guardar(id, datos, ok) {
  const antes = logros().M.filter(m => m[0]).map(m => m[2]);
  try {
    await guardarAporte(token, id, datos);
    const i = aportes.findIndex(x => x.id === id), nuevo = { ...(aportes[i] || {}), ...datos, id, visto: false };
    if (i >= 0) aportes[i] = nuevo; else aportes.push(nuevo);
    const nueva = logros().M.find(m => m[0] && !antes.includes(m[2]));
    toast(nueva ? `${nueva[1]} ¡Medalla nueva: ${nueva[2]}!` : ok); pintar();
  } catch (e) { toast("No se ha podido guardar: " + (e.code || e.message)); }
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
      regAct = { fecha: a.fecha, dep: a.dep, km: a.km, dur: a.dur, fcMed: a.fcMed || null, fcMax: a.fcMax || null, potMed: a.potMed || null, mejores: a.mejores || {}, hr20: a.hr20 || null, fuente: "Deportista" };
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
