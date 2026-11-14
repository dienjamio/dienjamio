/* Vista del deportista (solo lectura, con su enlace) */
import { $, $$, esc, hoy, lunesDe, sumaDias, diaSemana, rangoSemana, fechaLarga, diasEntre } from "./util.js?v=202611141259";
import { htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha, htmlSesion } from "./vista.js?v=202611141259";
import { leerPublico } from "./almacen.js?v=202611141259";
import { PRUEBAS, CARGA_TXT } from "./motor.js?v=202611141259";

let P = null, v = "hoy", lunes = lunesDe(hoy());
const semanas = () => Object.keys(P.semanas || {}).sort();

async function init() {
  const token = new URLSearchParams(location.search).get("d");
  if (!token) return fallo("Este enlace no está completo. Pídele a tu entrenador que te lo vuelva a mandar.");
  try { P = await leerPublico(token); }
  catch (e) { return fallo(e.message === "sin-nube" ? "La app de tu entrenador todavía no está conectada. Prueba más tarde." : "No se ha podido cargar tu plan. Revisa la conexión y vuelve a abrir el enlace."); }
  if (!P) return fallo("Este enlace ya no existe. Pídele a tu entrenador uno nuevo.");
  document.title = `Plan de ${P.nombre.split(" ")[0]}`;
  $("#nombre").textContent = P.nombre;
  $("#objetivo").textContent = P.objetivo || "";
  if (!P.semanas[lunes]) lunes = semanas().filter(l => l <= lunes).pop() || semanas()[0] || lunes;
  $("#barra").hidden = false;
  $("#barra").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { v = b.dataset.v; pintar(); } });
  $("#main").addEventListener("click", e => {
    const b = e.target.closest("[data-nav]");
    if (!b) return;
    const ls = semanas(), i = ls.indexOf(lunes) + (+b.dataset.nav);
    if (ls[i]) { lunes = ls[i]; pintar(); }
  });
  pintar();
}
function fallo(t) { $("#main").innerHTML = `<div class="panel vacio"><div class="big">😕</div><p>${esc(t)}</p></div>`; }

function navSemana() {
  const ls = semanas(), i = ls.indexOf(lunes);
  return `<div class="weeknav">
    <button class="icon-btn" data-nav="-1" ${i <= 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>
    <div class="c"><b>${rangoSemana(lunes)}</b><span>${lunes === lunesDe(hoy()) ? "Esta semana" : lunes > hoy() ? "Próxima" : "Pasada"}</span></div>
    <button class="icon-btn" data-nav="1" ${i >= ls.length - 1 ? "disabled" : ""} aria-label="Semana siguiente">›</button>
  </div>`;
}

function pintar() {
  $$("#barra [data-v]").forEach(b => b.toggleAttribute("aria-current", b.dataset.v === v));
  const m = $("#main"), snap = P.semanas[lunes];
  window.scrollTo({ top: 0 });
  if (v === "hoy") {
    const h = hoy(), sh = P.semanas[lunesDe(h)];
    const prox = (P.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
    let html = "";
    if (P.mensaje) html += `<div class="mensaje">💬 ${esc(P.mensaje)}</div>`;
    if (prox) { const d = diasEntre(h, prox.fecha); html += `<div class="cuenta-atras"><b>${d === 0 ? "¡HOY!" : d}</b><span>${d === 0 ? "" : d === 1 ? "día para" : "días para"} <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b></span></div>`; }
    if (!sh) html += `<div class="panel vacio"><p>Tu entrenador todavía no ha preparado esta semana.</p></div>`;
    else {
      const i = diaSemana(h), d = sh.dias[i];
      html += `<h2 class="hoy-t">${fechaLarga(h)}</h2>`;
      html += `<article class="dia hoy"><div class="dia-cab"><h3>Entreno</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
        ${d.ses.length ? d.ses.map(s => htmlSesion(s)).join("") : `<div class="ses descanso"><div class="ses-cab"><h4>😴 Hoy toca descansar</h4></div><div class="nota">Duerme bien, hidrátate y, si apetece, un paseo suave.</div></div>`}</article>`;
      html += htmlMenuDia(sh, i);
      const man = sh.dias[(i + 1) % 7];
      if (i < 6) html += `<div class="manana"><b>Mañana:</b> ${man.ses.length ? man.ses.map(s => esc(s.t)).join(" + ") : "descanso"}</div>`;
    }
    m.innerHTML = html;
  } else if (v === "semana") {
    m.innerHTML = navSemana() + (snap ? htmlCabSemana(snap) + snap.dias.map((_, i) => htmlDia(snap, i)).join("") : `<div class="panel vacio"><p>Sin plan para esta semana.</p></div>`);
  } else if (v === "menu") {
    m.innerHTML = navSemana() + (snap ? snap.dias.map((_, i) => htmlMenuDia(snap, i)).join("") + `<p class="aviso">Menú orientativo según la carga de cada día.</p>` : "");
  } else {
    const cs = (P.carreras || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    m.innerHTML = `<article class="dia"><div class="dia-cab"><h3>Mis carreras</h3></div>${cs.length ? cs.map(c => htmlCarreraFicha(c)).join("") : `<p class="muted">Sin carreras apuntadas.</p>`}</article>
      ${P.zonas ? `<article class="dia zonas">${htmlZonas(P.zonas)}</article>` : ""}
      <p class="aviso">Actualizado el ${new Date(P.actualizado).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
