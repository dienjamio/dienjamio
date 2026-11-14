/* Vista del deportista: su semana, su menú, sus carreras y su progreso. Puede registrar entrenos,
   valorar la semana y proponer carreras (se guardan en su buzón y los ve el entrenador). */
import { $, $$, esc, hoy, lunesDe, sumaDias, diaSemana, rangoSemana, fechaLarga, fechaCorta, diasEntre, uid, toast, comprimirImagen, DIAS } from "./util.js?v=202611141518";
import { htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha, htmlSesion, htmlPrevision, htmlProgreso, SENS_TXT } from "./vista.js?v=202611141518";
import { leerPublico, listarAportes, guardarAporte, borrarAporte } from "./almacen.js?v=202611141518";
import { PRUEBAS, CARGA_TXT } from "./motor.js?v=202611141518";
import { calcProgreso, mezclarProgreso } from "./progreso.js?v=202611141518";

let P = null, v = "hoy", lunes = lunesDe(hoy()), token = "", aportes = [];
const semanas = () => Object.keys(P.semanas || {}).sort();
const regsDe = l => Object.fromEntries(aportes.filter(x => x.tipo === "sesion" && x.lunes === l).map(x => [x.sesId, x]));

async function init() {
  token = new URLSearchParams(location.search).get("d") || "";
  if (!token) return fallo("Este enlace no está completo. Pídele a tu entrenador que te lo vuelva a mandar.");
  try { P = await leerPublico(token); }
  catch (e) { return fallo(e.message === "sin-nube" ? "La app de tu entrenador todavía no está conectada. Prueba más tarde." : "No se ha podido cargar tu plan. Revisa la conexión y vuelve a abrir el enlace."); }
  if (!P) return fallo("Este enlace ya no existe. Pídele a tu entrenador uno nuevo.");
  try { aportes = await listarAportes(token); } catch (e) { aportes = []; }
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
    if (prox) { const d = diasEntre(h, prox.fecha); html += `<button class="cuenta-atras" data-acc="ir-carreras"><b>${d === 0 ? "¡HOY!" : d}</b><span>${d === 0 ? "" : d === 1 ? "día para" : "días para"} <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b>${prox.prev && !prox.prev.falta ? ` · previsión ${esc(fmtT(prox.prev.total))}` : ""}</span></button>`; }
    if (!sh) html += `<div class="panel vacio"><p>Tu entrenador todavía no ha preparado esta semana.</p></div>`;
    else {
      const i = diaSemana(h), d = sh.dias[i], regs = regsDe(l0);
      html += `<h2 class="hoy-t">${fechaLarga(h)}</h2>`;
      html += `<article class="dia hoy"><div class="dia-cab"><h3>Entreno</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
        ${d.ses.length ? d.ses.map(s => htmlSesion(s, false, { regs, registrar: true })).join("") : `<div class="ses descanso"><div class="ses-cab"><h4>😴 Hoy toca descansar</h4></div><div class="nota">Duerme bien, hidrátate y, si apetece, un paseo suave.</div></div>`}</article>`;
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
    m.innerHTML = navSemana() + (snap ? htmlCabSemana(snap) + snap.dias.map((_, i) => htmlDia(snap, i, false, { regs, registrar: editable && sumaDias(lunes, i) <= hoy() })).join("") + (editable ? htmlValorar(lunes) : "") : `<div class="panel vacio"><p>Sin plan para esta semana.</p></div>`);
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
    const propio = calcProgreso({ semanas: P.semanas, aportes });
    m.innerHTML = htmlProgreso(mezclarProgreso(P.progreso || [], propio));
  }
}
const fmtT = s => { s = Math.round(s); const h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`; };

/* ---------------- Acciones ---------------- */
let regSes = null, fotoNueva;
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
  if (acc === "registrar") {
    const r = buscarSesion(b.dataset.id); if (!r) return;
    regSes = r; fotoNueva = undefined;
    const prev = aportes.find(x => x.id === `ses-${r.l}-${r.s.id}`) || {};
    const f = $("#f-reg");
    f.reset();
    $("#reg-t").textContent = `${DIAS[r.i]} · ${r.s.t}`;
    f.elements.hecho.value = prev.hecho || "si";
    for (const k of ["rpe", "km", "tiempo", "fc", "texto"]) f.elements[k].value = prev[k] || "";
    $("#reg-foto").innerHTML = prev.img ? `<img src="${prev.img}" alt="">` : "";
    $("#reg-quitar").hidden = !prev.img;
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
  if (acc === "ver-img") { const src = b.querySelector("img")?.src; const w = window.open(); if (w && src) w.document.write(`<title>Captura</title><img src="${src}" style="max-width:100%">`); }
}

async function guardar(id, datos, ok) {
  try {
    await guardarAporte(token, id, datos);
    const i = aportes.findIndex(x => x.id === id), nuevo = { ...(aportes[i] || {}), ...datos, id, visto: false };
    if (i >= 0) aportes[i] = nuevo; else aportes.push(nuevo);
    toast(ok); pintar();
  } catch (e) { toast("No se ha podido guardar: " + (e.code || e.message)); }
}

function enlazarDialogos() {
  $("#reg-foto-in").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { fotoNueva = await comprimirImagen(f); $("#reg-foto").innerHTML = `<img src="${fotoNueva}" alt="">`; $("#reg-quitar").hidden = false; }
    catch (err) { toast(err.message); }
  });
  $("#reg-quitar").addEventListener("click", () => { fotoNueva = null; $("#reg-foto").innerHTML = ""; $("#reg-quitar").hidden = true; });
  $("#dlg-reg").addEventListener("close", async () => {
    if ($("#dlg-reg").returnValue !== "guardar" || !regSes) return;
    const f = $("#f-reg"), r = regSes;
    const d = { tipo: "sesion", lunes: r.l, dia: r.i, sesId: r.s.id, titulo: r.s.t, min: r.s.min, hecho: f.elements.hecho.value, rpe: f.elements.rpe.value, km: f.elements.km.value.trim(), tiempo: f.elements.tiempo.value.trim(), fc: f.elements.fc.value.trim(), texto: f.elements.texto.value.trim(), visto: false };
    if (fotoNueva !== undefined) d.img = fotoNueva || "";
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
