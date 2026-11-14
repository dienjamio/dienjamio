/* Página pública de presentación del entrenador */
import { $, esc } from "./util.js?v=202611141530";
import { leerPublico } from "./almacen.js?v=202611141530";

const QUE = [
  ["📅", "Tu semana de entrenos", "Hecha a tu medida: tus días, tu tiempo de cada día y tus carreras. Sin entrenos imposibles."],
  ["⌚", "Parto de tus datos reales", "Analizo tu historial de Garmin, Strava o Polar: tu pulso, tus ritmos y lo que de verdad entrenas."],
  ["🏁", "Previsión de tus carreras", "Con el recorrido de la carrera te digo a qué ritmo ir en cada kilómetro, cuestas incluidas."],
  ["🍽️", "Menú orientativo", "Qué comer cada día según lo duro que sea el entreno, sin dietas imposibles."],
  ["💬", "Seguimiento semanal", "Me cuentas cómo te ha ido cada entreno y cada semana, y ajustamos la siguiente."],
  ["📈", "Ves tu progreso", "Horas, kilómetros y cumplimiento en gráficos, desde tu móvil y con un solo enlace."]
];

async function init() {
  let p = null;
  try { p = await leerPublico("entrenador"); } catch (e) { }
  const m = $("#pag");
  if (!p || !p.nombre) { m.innerHTML = `<div class="hero"><img class="logo-hero" src="img/logo.svg" alt=""><h1>Dienjamio Entrenador</h1><p>Página en preparación. Vuelve pronto.</p></div>`; return; }
  document.title = `${p.nombre} · Dienjamio Entrenador`;
  let tel = (p.telefono || "").replace(/\D/g, ""); if (tel.length === 9) tel = "34" + tel;
  const wa = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${p.nombre.split(" ")[0]}, he visto tu página y me gustaría entrenar contigo.`)}` : "";
  const cta = wa ? `<a class="btn pri grande" href="${wa}" target="_blank" rel="noopener">💬 Escríbeme por WhatsApp</a>` : p.email ? `<a class="btn pri grande" href="mailto:${esc(p.email)}">✉️ Escríbeme</a>` : "";
  m.innerHTML = `
  <section class="hero">
    <div class="marca-l"><img src="img/logo.svg" alt="" width="40" height="40"><span>DIENJAMIO <b>ENTRENADOR</b></span></div>
    ${p.foto ? `<img class="foto" src="${p.foto}" alt="${esc(p.nombre)}">` : ""}
    <h1>${esc(p.nombre)}</h1>
    ${p.titular ? `<p class="titular">${esc(p.titular)}</p>` : ""}
    ${p.zona ? `<p class="zona-l">📍 ${esc(p.zona)}</p>` : ""}
    ${p.deportes ? `<div class="chips-l">${p.deportes.split(",").map(x => x.trim()).filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${cta}
  </section>
  ${p.sobre ? `<section class="bloque"><h2>Sobre mí</h2>${p.sobre.split(/\n+/).map(x => `<p>${esc(x)}</p>`).join("")}</section>` : ""}
  ${p.pasos?.length ? `<section class="bloque"><h2>Cómo trabajo</h2><ol class="pasos">${p.pasos.map(x => `<li>${esc(x)}</li>`).join("")}</ol></section>` : ""}
  <section class="bloque"><h2>Lo que vas a tener</h2><div class="que">${QUE.map(([i, t, d]) => `<div><span>${i}</span><b>${t}</b><p>${d}</p></div>`).join("")}</div></section>
  ${p.servicios?.length ? `<section class="bloque"><h2>Servicios</h2><div class="servicios">${p.servicios.map(s => `<div class="serv"><b>${esc(s.n)}</b>${s.precio ? `<span class="precio">${esc(s.precio)}</span>` : ""}${s.d ? `<p>${esc(s.d)}</p>` : ""}</div>`).join("")}</div></section>` : ""}
  ${p.opiniones?.length ? `<section class="bloque"><h2>Lo que dicen</h2>${p.opiniones.map(o => `<blockquote>“${esc(o.t)}”${o.n ? `<cite>— ${esc(o.n)}</cite>` : ""}</blockquote>`).join("")}</section>` : ""}
  <section class="bloque final"><h2>¿Empezamos?</h2><p>Cuéntame tu objetivo y tu disponibilidad, y te preparo tu plan.</p>${cta}
    <p class="contacto">${p.instagram ? `<a href="https://instagram.com/${esc(p.instagram)}" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : ""}${p.instagram && p.email ? " · " : ""}${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}</p></section>`;
}
document.addEventListener("DOMContentLoaded", init);
