/* Pintado compartido: lo usan la app del entrenador y la vista del deportista. */
import { esc, fmtMin, fmtRitmo, fmtHoras, DIAS, DIAS_C, sumaDias, fechaCorta, rangoSemana, hoy, diasEntre } from "./util.js?v=202611142019";
import { htmlDetalle } from "./detalle.js?v=202611142019";
import { infoEjercicio } from "./biblioteca.js?v=202611142019";
import { DEP, CARGA_TXT, PRUEBAS, PRIORIDAD, ZNOM, RPE, OBJ, NOMBRE_RITMO, ZONA_RITMO } from "./motor.js?v=202611142019";

const ORDEN = ["run", "bike", "swim", "carrera", "fuerza", "movilidad"];

const ESTADO = { si: ["✅", "Hecho"], parcial: ["◐", "A medias"], no: ["✖", "No hecho"] };
/** Lo que el deportista ha registrado de una sesión. */
/** Compara el ritmo y el pulso reales con el objetivo de la sesión. */
export function htmlComparativa(s, r) {
  if (!s?.obj || !r || r.hecho === "no") return "";
  const km = r.act?.km || parseFloat(String(r.km || "").replace(",", "."));
  const seg = r.act?.dur || (r.tiempo ? r.tiempo.split(":").reduce((t, x) => t * 60 + (+x || 0), 0) : 0);
  const fc = r.act?.fcMed || +r.fc || 0;
  const p = [];
  if (km > 0.5 && seg > 60 && s.obj.ritmo) {
    const real = seg / km, [rap, len] = s.obj.ritmo;
    const dif = real < rap ? Math.round(rap - real) : real > len ? Math.round(real - len) : 0;
    p.push(dif === 0 ? `✅ Ritmo ${fmtRitmo(real)} /km: dentro de Z${s.obj.zona} (${fmtRitmo(rap)}-${fmtRitmo(len)})`
      : real < rap ? `⚠️ Ritmo ${fmtRitmo(real)} /km: ${dif}" más rápido de lo previsto (${fmtRitmo(rap)}-${fmtRitmo(len)})` : `🐢 Ritmo ${fmtRitmo(real)} /km: ${dif}" más lento de lo previsto`);
  }
  if (fc && s.obj.fc) {
    const [lo, hi] = s.obj.fc;
    p.push(fc > hi ? `⚠️ Pulso ${fc}: por encima de Z${s.obj.zona} (${lo}-${hi})` : fc < lo ? `💤 Pulso ${fc}: por debajo de Z${s.obj.zona}` : `✅ Pulso ${fc}: en zona (${lo}-${hi})`);
  }
  return p.length ? `<div class="comparativa">${p.map(x => `<div>${x}</div>`).join("")}</div>` : "";
}

export function htmlRegistro(r, s = null) {
  if (!r) return "";
  const e = ESTADO[r.hecho] || ESTADO.si;
  const datos = [r.rpe ? `esfuerzo ${r.rpe}/10` : "", r.km ? `${String(r.km).replace(".", ",")} km` : "", r.tiempo ? esc(r.tiempo) : "", r.fc ? `${r.fc} ppm` : ""].filter(Boolean).join(" · ");
  return `<div class="registro ${esc(r.hecho || "si")}">
    <div class="reg-cab"><b>${e[0]} ${e[1]}</b>${datos ? `<span>${datos}</span>` : ""}</div>
    ${r.texto ? `<p>“${esc(r.texto)}”</p>` : ""}
    ${r.act ? `<div class="act-l">⌚ ${htmlDatosAct(r.act)}</div>` : ""}
    ${htmlComparativa(s, r)}
    ${(r.thumbs?.length || r.img) ? `<div class="fotos-reg">${r.img ? `<button class="miniatura" data-acc="ver-img"><img src="${r.img}" alt="Captura del entreno"></button>` : ""}${(r.thumbs || []).map((t, i) => `<button class="miniatura" data-acc="ver-foto" data-f="${esc(r.fotos?.[i] || "")}"><img src="${t}" alt="Captura ${i + 1}"></button>`).join("")}</div>` : ""}
  </div>`;
}

/* ---------- Actividades reales (del reloj / Strava) ---------- */
const ICO = { run: "🏃", bike: "🚴", swim: "🏊", fuerza: "🏋️", andar: "🚶", otro: "•" };
export function htmlDatosAct(a) {
  const p = [];
  if (a.km) p.push(`<b>${String(a.km).replace(".", ",")} km</b>`);
  if (a.dur) p.push(fmtHoras(a.dur));
  if (a.dep === "run" && a.km && a.dur) p.push(`${fmtRitmo(a.dur / a.km)} /km`);
  if (a.dep === "bike" && a.km && a.dur) p.push(`${String(Math.round(a.km / a.dur * 36000) / 10).replace(".", ",")} km/h`);
  if (a.dep === "swim" && a.km && a.dur) p.push(`${fmtRitmo(a.dur / (a.km * 10))} /100 m`);
  if (a.fcMed) p.push(`❤️ ${a.fcMed}${a.fcMax ? `/${a.fcMax}` : ""} ppm`);
  if (a.potMed) p.push(`⚡ ${a.potMed} W`);
  return p.join(" · ");
}
export function htmlActividades(acts, titulo = "Actividades") {
  if (!acts?.length) return "";
  const porSemana = {};
  for (const a of acts) { const l = sumaDias(a.fecha, -((new Date(a.fecha + "T12:00").getDay() + 6) % 7)); (porSemana[l] = porSemana[l] || []).push(a); }
  return `<article class="dia actividades"><div class="dia-cab"><h3>⌚ ${esc(titulo)}</h3><span class="muted small">${acts.length}</span></div>
    ${Object.keys(porSemana).sort().reverse().map(l => {
      const w = porSemana[l].sort((x, y) => y.fecha.localeCompare(x.fecha));
      const km = w.filter(x => x.dep === "run").reduce((t, x) => t + (x.km || 0), 0), h = w.reduce((t, x) => t + (x.dur || 0), 0);
      return `<details class="sem-act" ${l === Object.keys(porSemana).sort().reverse()[0] ? "open" : ""}><summary><b>${rangoSemana(l)}</b><span>${w.length} actividad${w.length > 1 ? "es" : ""} · ${fmtHoras(h)}${km ? ` · ${String(Math.round(km * 10) / 10).replace(".", ",")} km corriendo` : ""}</span></summary>
        ${w.map(a => `<button class="act" data-acc="ver-act" data-k="${registrarAct(a)}"><span class="ic">${ICO[a.dep] || "•"}</span><span class="act-tx"><b>${DIAS[(new Date(a.fecha + "T12:00").getDay() + 6) % 7]} ${fechaCorta(a.fecha)}</b>${a.titulo ? ` · ${esc(a.titulo)}` : ""}<span class="small">${htmlDatosAct(a)}</span></span><span class="flecha">${a.det ? "📈" : ""}›</span></button>`).join("")}
      </details>`;
    }).join("")}</article>`;
}

/* ---------- Calle / cinta ---------- */
const MODO = "entrenador.modoRitmo";
const modoCinta = () => { try { return localStorage.getItem(MODO) === "cinta"; } catch (e) { return false; } };
if (typeof document !== "undefined") {
  const aplicar = () => document.body && document.body.classList.toggle("cinta", modoCinta());
  if (document.body) aplicar(); else document.addEventListener("DOMContentLoaded", aplicar);
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-modo]");
    if (!b) return;
    try { localStorage.setItem(MODO, b.dataset.modo); } catch (er) { }
    document.body.classList.toggle("cinta", b.dataset.modo === "cinta");
  });
}
const NIV_TXT = ["andando", "muy suave", "suave", "ritmo", "umbral", "fuerte"];
export function htmlEstructura(s) {
  if (!s.est?.length && !s.c) return "";
  const tot = s.est ? s.est.reduce((t, x) => t + x[0], 0) : 0;
  const barras = s.est?.length > 1 ? `<div class="barras" role="img" aria-label="Estructura de la sesión">${s.est.map(([m, n]) => `<i class="n${n}" style="flex-grow:${m};height:${18 + n * 14}%" title="${fmtMin(Math.round(m)) || Math.round(m * 60) + "''"} ${NIV_TXT[n]}"></i>`).join("")}</div>` : "";
  const corto = s.c ? `<div class="corto">
      <div class="modos"><button type="button" class="m-calle" data-modo="calle">🛣️ Calle</button><button type="button" class="m-cinta" data-modo="cinta">🏃 Cinta</button></div>
      <p class="c-calle">${esc(s.c.calle)}<small> min/km</small></p>
      <p class="c-cinta">${esc(s.c.cinta)}<small> · cinta con 1-2 % de inclinación</small></p>
    </div>` : "";
  return `<div class="estr">${barras}${corto}</div>`;
}

export function htmlSesion(s, ed = false, op = {}) {
  const d = DEP[s.dep] || DEP.run;
  const reg = op.regs?.[s.id];
  const ej = s.ej && s.ej.length ? `<table class="ej">${s.ej.map(e => `<tr><td><button class="ej-n" data-acc="ejercicio" data-n="${esc(e.n)}">${esc(e.n)} <span aria-hidden="true">ⓘ</span></button></td><td>${esc(e.s)}</td></tr>`).join("")}</table>` : "";
  return `<div class="ses ${esc(s.dep)}${s.tipo === "competicion" ? " comp" : ""}">
    <div class="ses-cab">
      <h4>${s.tipo === "competicion" ? "" : d.i + " "}${esc(s.t)}${s.editada ? ' <span class="mano" title="Cambiado a mano">✎</span>' : ""}</h4>
      <span class="dur">${fmtMin(s.min)}</span>
    </div>
    ${s.z ? `<div class="zona">${esc(d.n)} · ${esc(s.z)}</div>` : ""}
    ${htmlEstructura(s)}
    ${s.p && s.p.length ? `<ol>${s.p.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${ej}
    ${s.n ? `<div class="nota">${esc(s.n)}</div>` : ""}
    ${htmlDetalle(s, op.abierto)}
    ${htmlRegistro(reg, s)}
    ${op.registrar && reg?.visto ? `<div class="visto-ent">👀 Tu entrenador ha revisado este entreno</div>` : ""}
    ${s.coment ? `<div class="coment">💬 <b>Tu entrenador:</b> ${esc(s.coment)}</div>` : ""}
    ${ed && reg ? `<div class="ses-acc"><button class="btn sec mini" data-acc="comentar" data-id="${s.id}">💬 ${s.coment ? "Cambiar comentario" : "Comentar"}</button></div>` : ""}
    ${ed ? `<div class="ses-acc"><button class="btn sec mini" data-acc="editar-ses" data-id="${s.id}">✎ Cambiar</button></div>` : ""}
    ${op.registrar ? `<div class="ses-acc">${reg ? `<button class="btn sec mini" data-acc="registrar" data-id="${s.id}">✎ Cambiar mi registro</button>` : `<button class="btn pri mini" data-acc="hecho-rapido" data-id="${s.id}">✅ Hecho</button><button class="btn sec mini" data-acc="registrar" data-id="${s.id}">📝 Con detalles</button>`}<button class="btn sec mini" data-acc="chat-ses" data-id="${s.id}" aria-label="Preguntar a tu entrenador sobre este entreno">💬</button></div>` : ""}
  </div>`;
}

export function htmlDia(snap, i, ed = false, op = {}) {
  const d = snap.dias[i];
  const fecha = sumaDias(snap.lunes, i);
  const hechas = (op.acts || []).filter(a => a.fecha === fecha && ["run", "bike", "swim", "fuerza"].includes(a.dep));
  const esHoy = fecha === hoy();
  const ses = d.ses.length ? d.ses.map(s => htmlSesion(s, ed, op)).join("") :
    `<div class="ses descanso"><div class="ses-cab"><h4>😴 Descanso</h4></div><div class="nota">Recuperar también es entrenar: dormir bien, hidratarse y, si apetece, un paseo suave.</div></div>`;
  return `<article class="dia${esHoy ? " hoy" : ""}" id="dia-${i}">
    <div class="dia-cab"><h3>${DIAS[i]} <span class="fecha">${fechaCorta(fecha)}</span>${esHoy ? ' <span class="badge-hoy">Hoy</span>' : ""}</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
    ${ses}
    ${hechas.length ? `<div class="reloj">${hechas.map(a => `<button class="reloj-b" data-acc="ver-act" data-k="${registrarAct(a)}">⌚ <b>Hecho:</b> ${ICO[a.dep] || ""} ${htmlDatosAct(a)} <span class="mas">Ver detalle ›</span></button>`).join("")}</div>` : ""}
    ${ed ? `<button class="btn add mini" data-acc="add-ses" data-dia="${i}">＋ Añadir sesión</button>` : ""}
  </article>`;
}

export function htmlCabSemana(snap) {
  const total = snap.total || 0;
  const nSes = snap.dias.flatMap(d => d.ses).filter(s => s.dep !== "movilidad").length;
  const nDesc = snap.dias.filter(d => d.carga === "descanso").length;
  const kcal = Math.round(snap.dias.reduce((t, d) => t + (d.menu?.kcal || 0), 0) / 7);
  const barra = ORDEN.filter(k => snap.porDep?.[k]).map(k => `<i style="width:${snap.porDep[k] / total * 100}%;background:var(--${k})"></i>`).join("");
  const ley = ORDEN.filter(k => snap.porDep?.[k]).map(k => `<span style="--c:var(--${k})">${DEP[k].n} ${fmtMin(snap.porDep[k])}</span>`).join("");
  const tira = snap.dias.map((d, i) => {
    const ic = d.ses.length ? d.ses.map(s => DEP[s.dep]?.i || "").join("") : "😴";
    const m = d.ses.reduce((t, s) => t + (+s.min || 0), 0);
    const f = sumaDias(snap.lunes, i);
    return `<a href="#dia-${i}" class="${d.carga === "descanso" ? "rest" : ""}${f === hoy() ? " hoy" : ""}"><div class="d">${DIAS_C[i]}</div><div class="ic">${ic}</div><div class="m">${m ? fmtMin(m) : "—"}</div></a>`;
  }).join("");
  const A = snap.A ? `<div class="sub">🎯 ${esc(snap.A.nombre || PRUEBAS[snap.A.prueba])} · ${fechaCorta(snap.A.fecha)} · ${snap.semanas === 1 ? "¡esta semana!" : `faltan ${snap.semanas} semanas`}</div>` : "";
  return `<section class="cab">
    <div class="cab-top">
      <div><h2>Semana ${snap.semanaNum} · ${rangoSemana(snap.lunes)}</h2>${A}</div>
      <span class="badge ${snap.fase.clave === "descarga" ? "desc" : "fase"}">${esc(snap.fase.n)}</span>
    </div>
    <p class="fase-txt">${esc(snap.fase.d)}</p>
    ${snap.comentSemana ? `<div class="coment">💬 <b>Tu entrenador:</b> ${esc(snap.comentSemana)}</div>` : ""}
    <div class="kpis">
      <div class="kpi"><b>${fmtMin(total)}</b><span>Tiempo total</span></div>
      <div class="kpi"><b>${nSes}</b><span>Sesiones</span></div>
      <div class="kpi"><b>${nDesc}</b><span>Descansos</span></div>
      <div class="kpi"><b>${kcal.toLocaleString("es-ES")}</b><span>kcal/día</span></div>
    </div>
    <div class="barra">${barra}</div>
    <div class="leyenda">${ley}</div>
    <div class="tira">${tira}</div>
  </section>`;
}

export function htmlMenuDia(snap, i, ed = false) {
  const d = snap.dias[i], m = d.menu;
  if (!m) return "";
  const fecha = sumaDias(snap.lunes, i);
  return `<article class="dia menu-dia${fecha === hoy() ? " hoy" : ""}">
    <div class="dia-cab"><h3>${DIAS[i]} <span class="fecha">${fechaCorta(fecha)}</span></h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
    ${m.racion ? `<div class="macros"><span>Hidratos: ración <b>${esc(m.racion)}</b></span><span>Orientativo: ~${m.kcal.toLocaleString("es-ES")} kcal</span></div>` : `<div class="macros"><span><b>${m.kcal.toLocaleString("es-ES")}</b> kcal</span><span>Hidratos <b>${m.C} g</b></span><span>Proteína <b>${m.P} g</b></span><span>Grasa <b>${m.G} g</b></span></div>`}
    ${m.comidas.map(c => c.lineas ? `<div class="comida"><div class="comida-cab"><span class="t">${esc(c.nombre)}</span></div>${c.lineas.map(l => `<div class="linea">${esc(l)}</div>`).join("")}</div>`
      : `<div class="comida"><div class="comida-cab"><span class="t">${esc(c.nombre)}</span><span class="k">~${c.kcal} kcal</span></div><div class="n">${esc(c.plato)}</div><ul>${c.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
    <div class="tip">${m.tips.map(esc).join("<br>")}</div>
    ${ed ? `<button class="btn sec mini" data-acc="otro-menu" data-dia="${i}">🎲 Otros platos este día</button>` : ""}
  </article>`;
}

export function htmlZonas(Z) {
  const fila = i => `<tr><td>${ZNOM[i]}</td><td>${Z.fc[i][0]}-${Z.fc[i][1]}</td>${Z.ritmos ? `<td>${fmtRitmo(Z.ritmos[i][0])}-${fmtRitmo(Z.ritmos[i][1])}</td>` : ""}${Z.potencia ? `<td>${i === 0 ? "<" + Z.potencia[0][1] : Z.potencia[i][0] + "-" + Z.potencia[i][1]}</td>` : ""}${Z.nado ? `<td>${fmtRitmo(Z.nado[i][0])}-${fmtRitmo(Z.nado[i][1])}</td>` : ""}<td>${RPE[i]}</td></tr>`;
  const car = Z.carrera ? `<h3>Ritmos y tiempos estimados</h3><div class="wrap"><table><tr><th>Prueba</th><th>Ritmo</th><th>Tiempo</th></tr>
    ${[["5k", "5 km"], ["10k", "10 km"], ["media", "Media maratón"], ["maraton", "Maratón"]].map(([k, n]) => `<tr><td>${n}</td><td>${fmtRitmo(Z.carrera[k].p)} /km</td><td>${fmtHoras(Z.carrera[k].t)}</td></tr>`).join("")}
    </table></div>` : "";
  const kmh = r => (3600 / ((r[0] + r[1]) / 2)).toFixed(1).replace(".", ",");
  const tipos = Z.tipos ? `<h3>Tus ritmos${Z.vdot && !Z.ritmosPropios ? ` <small>(VDOT ${String(Z.vdot).replace(".", ",")}${Z.ritmoEstimado ? ", estimado" : ""})</small>` : ""}</h3><div class="wrap"><table class="ritmos-t"><tr><th>Ritmo</th><th>Calle /km</th><th>Cinta</th><th>Pulso</th></tr>
    ${Object.entries(Z.tipos).map(([k, r]) => { const zi = ZONA_RITMO[k] - 1; return `<tr><td>${NOMBRE_RITMO[k]}</td><td>${fmtRitmo(r[0])}-${fmtRitmo(r[1])}</td><td>${kmh(r)} km/h</td><td>${Z.fc[zi][0]}-${Z.fc[zi][1]}</td></tr>`; }).join("")}
    </table></div><small>Cinta: pon un 1-2 % de inclinación para que cueste lo mismo que en la calle. Con calor, viento o cuestas, manda el pulso y la sensación, no el ritmo.</small>` : "";
  return `${tipos}<h3>Zonas de entrenamiento</h3>
    <div class="wrap"><table><tr><th>Zona</th><th>Pulso</th>${Z.ritmos ? "<th>Ritmo /km</th>" : ""}${Z.potencia ? "<th>Vatios</th>" : ""}${Z.nado ? "<th>Nado /100 m</th>" : ""}<th>Sensación</th></tr>
    ${[0, 1, 2, 3, 4].map(fila).join("")}</table></div>
    <small>Pulso calculado con: ${esc(Z.metodo)}.</small>${car}`;
}

export function htmlCarreraFicha(c, ed = false, prev = null) {
  const dias = diasEntre(hoy(), c.fecha);
  const cuando = dias < 0 ? "Ya pasó" : dias === 0 ? "¡Hoy!" : dias === 1 ? "Mañana" : `Faltan ${dias} días`;
  const [y, m, d] = c.fecha.split("-");
  return `<div class="carrera-f prio-${c.prioridad}${dias < 0 ? " pasada" : ""}">
    <div class="cf-fecha"><b>${+d}</b><span>${fechaCorta(c.fecha).split(" ")[1]} ${y.slice(2)}</span></div>
    <div class="cf-t">
      <b>${esc(c.nombre || PRUEBAS[c.prueba])}</b>
      <span>${PRUEBAS[c.prueba] || ""} · ${c.prioridad} · ${PRIORIDAD[c.prioridad]}${c.lugar ? " · " + esc(c.lugar) : ""}</span>
      <span>${cuando}${c.objetivo ? " · objetivo " + esc(c.objetivo) : ""}</span>
      ${prev && !prev.falta ? `<span class="prev-l">${prev.real ? `⏱️ Previsión: <b>${fmtHoras(prev.total)}</b> (${fmtRitmo(prev.ritmoMedio)} /km)` : `🎯 Objetivo: <b>${fmtHoras(prev.obj)}</b>`}${prev.real && prev.obj ? (prev.total <= prev.obj ? " · ✅ objetivo a su alcance" : ` · le faltan ${fmtHoras(prev.total - prev.obj)}`) : ""}${c.track ? ` · ${(c.track.dist / 1000).toFixed(2).replace(".", ",")} km · +${prev.sube} m` : ""}</span>` : ""}
    </div>
    ${ed ? `<div class="cf-acc"><button class="icon-btn" data-acc="editar-carrera" data-id="${c.id}" aria-label="Editar">✎</button></div>` : ""}
  </div>`;
}

export function objetivoTxt(o) { return OBJ[o] || o; }

/* ---------- Previsión de carrera ---------- */
function svgPerfil(perfil, kms) {
  if (!perfil || perfil.length < 2) return "";
  const W = 600, H = 140, dmax = perfil[perfil.length - 1][0] || 1;
  const es = perfil.map(p => p[1]), emin = Math.min(...es), emax = Math.max(...es), rango = Math.max(20, emax - emin);
  const x = d => (d / dmax * W).toFixed(1), y = e => (H - 18 - (e - emin) / rango * (H - 34)).toFixed(1);
  const linea = perfil.map(p => `${x(p[0])},${y(p[1])}`).join(" ");
  const marcas = kms.map((k, i) => { const d = kms.slice(0, i + 1).reduce((t, q) => t + q.len, 0); return d < dmax - 200 ? `<line x1="${x(d)}" x2="${x(d)}" y1="${H - 16}" y2="${H - 10}" class="tick"/><text x="${x(d)}" y="${H - 1}" class="ax">${i + 1}</text>` : ""; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="perfil" role="img" aria-label="Perfil de la carrera: de ${Math.round(emin)} a ${Math.round(emax)} m">
    <polygon points="0,${H - 18} ${linea} ${W},${H - 18}" class="area"/><polyline points="${linea}" class="lin"/>
    <text x="4" y="12" class="ax">${Math.round(emax)} m</text><text x="4" y="${H - 22}" class="ax">${Math.round(emin)} m</text>${marcas}</svg>`;
}
export function htmlPrevision(c, p) {
  if (!p) return "";
  if (p.falta) return `<p class="alerta">Para la previsión falta un dato: escribe un tiempo objetivo en la carrera o una marca en su ficha.</p>`;
  const dif = p.real && p.obj ? p.total - p.obj : null;
  const veredicto = dif == null ? "" : dif <= 0
    ? `<div class="veredicto ok">✅ <b>Objetivo a su alcance:</b> su forma actual da ${fmtHoras(-dif)} de margen.</div>`
    : dif / p.km <= 4 ? `<div class="veredicto ojo">🟡 <b>Objetivo ambicioso pero posible:</b> le faltan ${fmtHoras(dif)} (${Math.round(dif / p.km)} s/km). Con un buen día, buen tiempo y una salida controlada, se puede.</div>`
    : `<div class="veredicto mal">🔴 <b>Objetivo muy exigente ahora mismo:</b> le faltan ${fmtHoras(dif)} (${Math.round(dif / p.km)} s/km). Mejor salir al ritmo de la previsión y apretar en la segunda mitad si va bien.</div>`;
  const expl = `<details class="expl"><summary>¿De dónde sale este tiempo?</summary><ul>
    ${p.real ? `<li><b>Ritmo en llano: ${fmtRitmo(p.base)} /km</b>, calculado con ${esc(p.de)}.</li>` : ""}
    ${p.costeDesnivel > 1 ? `<li><b>Perfil (+${p.sube} m / −${p.baja} m): ${p.costeDesnivel >= 0 ? "+" : "−"}${fmtHoras(Math.abs(p.costeDesnivel))}</b>. Cada 1 % de subida cuesta ~3,3 % más; la bajada devuelve menos de lo que quita la subida.</li>` : c.track ? `<li>Perfil prácticamente llano: no añade tiempo.</li>` : `<li>Sin track: calculado en llano. Sube el GPX del recorrido para afinarlo con las cuestas.</li>`}
    ${p.costeSalida > 0.5 ? `<li><b>Salida controlada: +${Math.round(p.costeSalida)} s</b> en el primer km (se recuperan con creces al no quemarse).</li>` : ""}
    ${p.obj ? `<li><b>Objetivo ${fmtHoras(p.obj)}</b> = ${fmtRitmo(p.ritmoObjMedio)} /km de media. Los parciales de abajo están ajustados a cada km del perfil y suman exactamente el objetivo.</li>` : ""}
  </ul></details>`;
  return `<div class="prevision">
    <div class="kpis">
      ${p.real ? `<div class="kpi"><b>${fmtHoras(p.total)}</b><span>previsión con su forma</span></div>` : ""}
      ${p.obj ? `<div class="kpi obj"><b>${fmtHoras(p.obj)}</b><span>objetivo · ${fmtRitmo(p.ritmoObjMedio)} /km</span></div>` : ""}
      <div class="kpi"><b>${p.km.toFixed(2).replace(".", ",")}</b><span>km</span></div>
      <div class="kpi"><b>+${p.sube} m</b><span>desnivel</span></div>
    </div>
    ${veredicto}${expl}
    ${c.track ? svgPerfil(c.track.perfil, c.track.kms) : ""}
    ${p.duro ? `<p class="small">El kilómetro más duro es el ${p.duro}.${c.estrategia === "negativa" ? " Estrategia: segunda mitad más rápida." : " Estrategia: esfuerzo constante."}</p>` : ""}
    <div class="wrap"><table class="kms"><tr><th>Km</th><th>Desnivel</th>${p.real ? "<th>Previsión</th>" : ""}${p.obj ? "<th>Para el objetivo</th><th>Paso</th>" : "<th>Paso</th>"}</tr>
    ${p.kms.map(k => `<tr class="${k.sube / k.len > 0.025 ? "sube" : k.baja / k.len > 0.025 ? "baja" : ""}"><td>${k.km}${k.len < 990 ? `<small> (${k.len} m)</small>` : ""}</td><td>${k.sube || k.baja ? `+${k.sube} / −${k.baja}` : "llano"}</td>${p.real ? `<td>${fmtRitmo(k.ritmo)}</td>` : ""}${p.obj ? `<td><b>${fmtRitmo(k.ritmoObj)}</b></td><td>${fmtHoras(k.acumObj)}</td>` : `<td>${fmtHoras(k.acum)}</td>`}</tr>${k.nota ? `<tr class="nota-km"><td colspan="5">${esc(k.nota)}</td></tr>` : ""}`).join("")}
    </table></div></div>`;
}

/* ---------- Progreso ---------- */
const SENS = { muy_facil: "😴", facil: "🙂", bien: "💪", dura: "😮‍💨", excesiva: "🥵" };
export const SENS_TXT = { muy_facil: "Muy fácil", facil: "Fácil", bien: "Bien", dura: "Dura", excesiva: "Excesiva" };
function barras(series, claves, colores, fmt, alto = 150) {
  const W = 600, H = alto, n = series.length, max = Math.max(1, ...series.flatMap(s => claves.map(k => s[k] || 0)));
  const bw = W / n, g = bw * 0.14, w = (bw - g * 2) / claves.length;
  const barrasSvg = series.map((s, i) => claves.map((k, j) => {
    const v = s[k] || 0, h = v / max * (H - 34);
    return `<rect x="${(i * bw + g + j * w).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${(w - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:${colores[j]}"><title>${fechaCorta(s.lunes)}: ${fmt(v)}</title></rect>`;
  }).join("") + `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 3}" class="ax" text-anchor="middle">${fechaCorta(s.lunes).split(" ")[0]}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img"><line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}" class="base"/>${barrasSvg}<text x="${W}" y="11" class="ax" text-anchor="end">máx ${fmt(max)}</text></svg>`;
}
export function htmlProgreso(series) {
  if (!series || !series.length) return `<div class="panel vacio"><p>Todavía no hay semanas para mostrar el progreso.</p></div>`;
  const conDatos = series.filter(s => s.planMin || s.hechoMin || s.km);
  const tot = k => series.reduce((t, s) => t + (s[k] || 0), 0);
  // cumplimiento: solo semanas con plan, y sin pasar del 100 % en cada una
  const conPlan = series.filter(s => s.sesPlan > 0);
  const planT = conPlan.reduce((t, s) => t + s.sesPlan, 0);
  const cumpl = planT ? Math.round(conPlan.reduce((t, s) => t + Math.min(s.sesHechas, s.sesPlan), 0) / planT * 100) : null;
  const h = m => (Math.round(m / 6) / 10).toString().replace(".", ",") + " h";
  return `<article class="dia progreso">
    <div class="dia-cab"><h3>Progreso</h3><span class="muted small">últimas ${series.length} semanas</span></div>
    <div class="kpis">
      <div class="kpi"><b>${h(tot("hechoMin"))}</b><span>entrenadas</span></div>
      <div class="kpi"><b>${Math.round(tot("km"))} km</b><span>corriendo</span></div>
      <div class="kpi"><b>${tot("sesHechas")}</b><span>sesiones hechas</span></div>
      <div class="kpi"><b>${cumpl != null ? cumpl + " %" : "—"}</b><span>cumplimiento</span></div>
    </div>
    <h4 class="sep">Horas por semana: plan <i class="lg pl"></i> y hecho <i class="lg he"></i></h4>
    ${barras(series, ["planMin", "hechoMin"], ["var(--ink3)", "var(--accent)"], h)}
    <h4 class="sep">Kilómetros corriendo</h4>
    ${barras(series, ["km"], ["var(--run)"], v => Math.round(v) + " km", 120)}
    <h4 class="sep">Cómo se notó cada semana</h4>
    <div class="sens">${series.map(s => `<div title="${s.sensacion ? SENS_TXT[s.sensacion] : "Sin valorar"}"><span>${s.sensacion ? SENS[s.sensacion] : "·"}</span><small>${fechaCorta(s.lunes).split(" ")[0]}</small></div>`).join("")}</div>
    ${conDatos.length ? "" : `<p class="muted small">Cuando registre entrenos o subas sus actividades, aquí se irá viendo su evolución.</p>`}
  </article>`;
}

/* ---------- Ficha de un ejercicio (biblioteca) ---------- */
export function mostrarEjercicio(nombre, videos = {}) {
  const i = infoEjercicio(nombre, videos);
  let d = document.getElementById("dlg-ej");
  if (!d) { d = document.createElement("dialog"); d.id = "dlg-ej"; d.className = "hoja"; document.body.append(d); d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-cerrar]")) d.close(); }); }
  d.innerHTML = `<h3>🏋️ ${esc(i.n)}</h3>
    ${i.como ? `<p><b>Cómo se hace:</b> ${esc(i.como)}</p>` : ""}
    ${i.ojo ? `<p class="txt-alerta"><b>Ojo:</b> ${esc(i.ojo)}</p>` : ""}
    <div class="acciones fila"><a class="btn pri mini" href="${esc(i.video)}" target="_blank" rel="noopener">▶ ${i.propio ? "Ver el vídeo de tu entrenador" : "Ver vídeos de la técnica"}</a><span class="sp"></span><button class="btn sec mini" data-cerrar>Cerrar</button></div>`;
  d.showModal();
}

/* ---------- Detalle de una actividad ---------- */
const VISTAS = [];
/** Guarda la actividad para poder abrir su detalle desde un botón (data-k). */
export function registrarAct(a) { VISTAS.push(a); return VISTAS.length - 1; }
export const actPorClave = k => VISTAS[+k];
const NOM_DEP = { run: "Carrera", bike: "Bici", swim: "Natación", fuerza: "Fuerza", andar: "Caminata", otro: "Actividad" };
const NOM_MARCA = { "1k": "1 km", "5k": "5 km", "10k": "10 km", media: "Media maratón", maraton: "Maratón" };
function lineaSvg(serie, idx, alto, color, invertir = false) {
  const pts = serie.map(p => [p[0], p[idx]]).filter(p => p[1] != null);
  if (pts.length < 4) return "";
  const W = 600, dmax = serie[serie.length - 1][0] || 1;
  let v = pts.map(p => p[1]).sort((a, b) => a - b);
  const lo = v[Math.floor(v.length * 0.03)], hi = v[Math.ceil(v.length * 0.97) - 1], r = Math.max(1, hi - lo);
  const y = x => { const k = (Math.min(hi, Math.max(lo, x)) - lo) / r; return (invertir ? k : 1 - k) * (alto - 14) + 7; };
  const linea = pts.map(p => `${(p[0] / dmax * W).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return { svg: `<polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`, lo, hi };
}
function graficas(det, dep) {
  const s = det?.serie; if (!s || s.length < 4) return "";
  const km = (s[s.length - 1][0] / 1000).toFixed(1).replace(".", ",");
  const bloque = (titulo, g, alto, etiqueta) => g ? `<h4 class="sep">${titulo}</h4><svg viewBox="0 0 600 ${alto}" class="graf-act" role="img" aria-label="${titulo}">${g.svg}<text x="4" y="11" class="ax">${etiqueta(g.hi)}</text><text x="4" y="${alto - 2}" class="ax">${etiqueta(g.lo)}</text><text x="596" y="${alto - 2}" class="ax" text-anchor="end">${km} km</text></svg>` : "";
  return bloque("Pulso", lineaSvg(s, 1, 110, "var(--alta)"), 110, v => `${v} ppm`)
    + (dep === "run" ? bloque("Ritmo", lineaSvg(s, 2, 110, "var(--run)", true), 110, v => `${fmtRitmo(v)} /km`) : "")
    + bloque("Altitud", lineaSvg(s, 3, 90, "var(--accent)"), 90, v => `${Math.round(v)} m`);
}
function mapa(ruta) {
  if (!ruta || ruta.length < 5) return "";
  const lat = ruta.map(p => p[0]), lon = ruta.map(p => p[1]);
  const la0 = Math.min(...lat), la1 = Math.max(...lat), lo0 = Math.min(...lon), lo1 = Math.max(...lon);
  const k = Math.cos((la0 + la1) / 2 * Math.PI / 180), ancho = (lo1 - lo0) * k || 1e-6, alto = la1 - la0 || 1e-6;
  const W = 600, H = Math.min(360, Math.max(140, W * alto / ancho)), esc_ = Math.min((W - 20) / ancho, (H - 20) / alto);
  const xy = p => [10 + ((p[1] - lo0) * k) * esc_, H - 10 - (p[0] - la0) * esc_];
  const linea = ruta.map(p => xy(p).map(v => v.toFixed(1)).join(",")).join(" ");
  const [ix, iy] = xy(ruta[0]), [fx, fy] = xy(ruta[ruta.length - 1]);
  return `<h4 class="sep">Recorrido</h4><svg viewBox="0 0 ${W} ${H.toFixed(0)}" class="mapa-act" role="img" aria-label="Recorrido"><polyline points="${linea}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="6" fill="var(--baja)"/><circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="6" fill="var(--alta)"/></svg><small>🟢 salida · 🔴 llegada</small>`;
}
function parciales(det, dep) {
  const p = det?.parc; if (!p?.length) return "";
  const ritmos = p.map(x => x[1] / (x[0] / 1000)), mn = Math.min(...ritmos), mx = Math.max(...ritmos);
  const ud = dep === "bike" ? "5 km" : dep === "swim" ? "100 m" : "km";
  return `<h4 class="sep">Parciales (cada ${ud})</h4><div class="wrap"><table class="kms parc"><tr><th>${dep === "bike" ? "Tramo" : "Km"}</th><th>${dep === "bike" ? "Velocidad" : "Ritmo"}</th><th></th><th>Pulso</th><th>Desn.</th></tr>
    ${p.map((x, i) => { const r = ritmos[i], ancho = mx > mn ? 30 + 70 * (mx - r) / (mx - mn) : 100;
      return `<tr><td>${i + 1}${x[0] < (dep === "bike" ? 4900 : dep === "swim" ? 95 : 980) ? `<small> (${x[0]} m)</small>` : ""}</td><td><b>${dep === "bike" ? `${(x[0] / x[1] * 3.6).toFixed(1).replace(".", ",")} km/h` : dep === "swim" ? `${fmtRitmo(x[1] / (x[0] / 100))} /100` : fmtRitmo(r)}</b></td><td class="barra-p"><i style="width:${ancho.toFixed(0)}%"></i></td><td>${x[2] ?? "—"}</td><td>${x[3] == null ? "—" : (x[3] > 0 ? "+" : "") + x[3] + " m"}</td></tr>`; }).join("")}
  </table></div>`;
}
/** Abre la ficha completa de una actividad. extra: HTML adicional (p. ej. lo planificado ese día). */
export function mostrarActividad(a, extra = "") {
  if (!a) return;
  const kpi = (v, t) => v ? `<div class="kpi"><b>${v}</b><span>${t}</span></div>` : "";
  const ritmo = a.dep === "run" && a.km && a.dur ? `${fmtRitmo(a.dur / a.km)} /km` : a.dep === "bike" && a.km && a.dur ? `${(a.km / a.dur * 3600).toFixed(1).replace(".", ",")} km/h` : a.dep === "swim" && a.km && a.dur ? `${fmtRitmo(a.dur / (a.km * 10))} /100 m` : "";
  const mejores = Object.entries(a.mejores || {}).filter(([k]) => NOM_MARCA[k]);
  let d = document.getElementById("dlg-act");
  if (!d) { d = document.createElement("dialog"); d.id = "dlg-act"; d.className = "hoja ancha"; document.body.append(d); d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-cerrar]")) d.close(); }); }
  d.innerHTML = `<div class="act-cab"><span class="ic-g">${ICO[a.dep] || "•"}</span><div><h3>${esc(a.titulo || NOM_DEP[a.dep] || "Actividad")}</h3><span class="small">${DIAS[(new Date(a.fecha + "T12:00").getDay() + 6) % 7]} ${fechaCorta(a.fecha)} · ${NOM_DEP[a.dep] || ""}${a.fuente ? " · " + esc(a.fuente) : ""}</span></div><button class="icon-btn" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="kpis">
      ${kpi(a.km ? `${String(a.km).replace(".", ",")} km` : "", "distancia")}
      ${kpi(a.dur ? fmtHoras(a.dur) : "", a.mov ? `tiempo (${fmtHoras(a.mov)} en movimiento)` : "tiempo")}
      ${kpi(ritmo, a.dep === "bike" ? "velocidad media" : "ritmo medio")}
      ${kpi(a.fcMed ? `${a.fcMed} ppm` : "", "pulso medio")}
      ${kpi(a.fcMax ? `${a.fcMax} ppm` : "", "pulso máximo")}
      ${kpi(a.sube != null && a.sube > 0 ? `+${a.sube} m` : "", "desnivel")}
      ${kpi(a.cad ? `${a.cad}` : "", a.dep === "bike" ? "cadencia (rpm)" : "cadencia (pasos/min)")}
      ${kpi(a.potMed ? `${a.potMed} W` : "", "potencia media")}
      ${kpi(a.kcal ? `${a.kcal}` : "", "kcal")}
    </div>
    ${mejores.length ? `<h4 class="sep">Mejores marcas en esta actividad</h4><div class="chips-m">${mejores.map(([k, v]) => `<span>${NOM_MARCA[k]} <b>${fmtHoras(v)}</b></span>`).join("")}</div>` : ""}
    ${extra}
    ${parciales(a.det, a.dep)}
    ${graficas(a.det, a.dep)}
    ${mapa(a.det?.ruta)}
    ${a.det ? "" : `<p class="muted small">Para ver parciales por km, gráficas de pulso y ritmo y el recorrido, hace falta el archivo completo de la actividad (.fit, .gpx o .tcx): viene en el ZIP de Strava o Garmin, o se sube al registrar el entreno.</p>`}`;
  d.showModal();
}
