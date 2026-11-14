/* Pintado compartido: lo usan la app del entrenador y la vista del deportista. */
import { esc, fmtMin, fmtRitmo, fmtHoras, DIAS, DIAS_C, sumaDias, fechaCorta, rangoSemana, hoy, diasEntre } from "./util.js?v=202611141518";
import { DEP, CARGA_TXT, PRUEBAS, PRIORIDAD, ZNOM, RPE, OBJ } from "./motor.js?v=202611141518";

const ORDEN = ["run", "bike", "swim", "carrera", "fuerza", "movilidad"];

const ESTADO = { si: ["✅", "Hecho"], parcial: ["◐", "A medias"], no: ["✖", "No hecho"] };
/** Lo que el deportista ha registrado de una sesión. */
export function htmlRegistro(r) {
  if (!r) return "";
  const e = ESTADO[r.hecho] || ESTADO.si;
  const datos = [r.rpe ? `esfuerzo ${r.rpe}/10` : "", r.km ? `${String(r.km).replace(".", ",")} km` : "", r.tiempo ? esc(r.tiempo) : "", r.fc ? `${r.fc} ppm` : ""].filter(Boolean).join(" · ");
  return `<div class="registro ${esc(r.hecho || "si")}">
    <div class="reg-cab"><b>${e[0]} ${e[1]}</b>${datos ? `<span>${datos}</span>` : ""}</div>
    ${r.texto ? `<p>“${esc(r.texto)}”</p>` : ""}
    ${r.img ? `<button class="miniatura" data-acc="ver-img" data-src="${esc(r.id || "")}"><img src="${r.img}" alt="Captura del entreno"></button>` : ""}
  </div>`;
}

export function htmlSesion(s, ed = false, op = {}) {
  const d = DEP[s.dep] || DEP.run;
  const reg = op.regs?.[s.id];
  const ej = s.ej && s.ej.length ? `<table class="ej">${s.ej.map(e => `<tr><td>${esc(e.n)}</td><td>${esc(e.s)}</td></tr>`).join("")}</table>` : "";
  return `<div class="ses ${esc(s.dep)}${s.tipo === "competicion" ? " comp" : ""}">
    <div class="ses-cab">
      <h4>${s.tipo === "competicion" ? "" : d.i + " "}${esc(s.t)}${s.editada ? ' <span class="mano" title="Cambiado a mano">✎</span>' : ""}</h4>
      <span class="dur">${fmtMin(s.min)}</span>
    </div>
    ${s.z ? `<div class="zona">${esc(d.n)} · ${esc(s.z)}</div>` : ""}
    ${s.p && s.p.length ? `<ol>${s.p.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${ej}
    ${s.n ? `<div class="nota">${esc(s.n)}</div>` : ""}
    ${htmlRegistro(reg)}
    ${ed ? `<div class="ses-acc"><button class="btn sec mini" data-acc="editar-ses" data-id="${s.id}">✎ Cambiar</button></div>` : ""}
    ${op.registrar ? `<div class="ses-acc"><button class="btn ${reg ? "sec" : "pri"} mini" data-acc="registrar" data-id="${s.id}">${reg ? "✎ Cambiar mi registro" : "✔ Registrar entreno"}</button></div>` : ""}
  </div>`;
}

export function htmlDia(snap, i, ed = false, op = {}) {
  const d = snap.dias[i];
  const fecha = sumaDias(snap.lunes, i);
  const esHoy = fecha === hoy();
  const ses = d.ses.length ? d.ses.map(s => htmlSesion(s, ed, op)).join("") :
    `<div class="ses descanso"><div class="ses-cab"><h4>😴 Descanso</h4></div><div class="nota">Recuperar también es entrenar: dormir bien, hidratarse y, si apetece, un paseo suave.</div></div>`;
  return `<article class="dia${esHoy ? " hoy" : ""}" id="dia-${i}">
    <div class="dia-cab"><h3>${DIAS[i]} <span class="fecha">${fechaCorta(fecha)}</span>${esHoy ? ' <span class="badge-hoy">Hoy</span>' : ""}</h3><span class="carga ${d.carga}">${CARGA_TXT[d.carga]}</span></div>
    ${ses}
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
  return `<h3>Zonas de entrenamiento</h3>
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
      ${prev && !prev.falta ? `<span class="prev-l">⏱️ Previsión: <b>${fmtHoras(prev.total)}</b> (${fmtRitmo(prev.ritmoMedio)} /km)${c.track ? ` · ${(c.track.dist / 1000).toFixed(2).replace(".", ",")} km · +${c.track.sube} m` : ""}</span>` : ""}
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
  if (p.falta) return `<p class="alerta">Para la previsión falta un ritmo: escribe un ritmo objetivo en la carrera o una marca en su ficha.</p>`;
  return `<div class="prevision">
    <div class="kpis">
      <div class="kpi"><b>${fmtHoras(p.total)}</b><span>tiempo previsto</span></div>
      <div class="kpi"><b>${fmtRitmo(p.ritmoMedio)}</b><span>ritmo medio /km</span></div>
      <div class="kpi"><b>${p.km.toFixed(2).replace(".", ",")}</b><span>km</span></div>
      <div class="kpi"><b>+${p.sube} m</b><span>desnivel</span></div>
    </div>
    ${c.track ? svgPerfil(c.track.perfil, c.track.kms) : `<small>Sin track: previsión en llano. Sube el GPX del recorrido para afinarla con las cuestas.</small>`}
    <p class="small">Calculado con ${esc(p.de)}: ${fmtRitmo(p.base)} /km en llano${c.estrategia === "negativa" ? ", estrategia de ritmo negativo (segunda mitad más rápida)" : ", ritmo por esfuerzo constante"}${p.duro ? `. El kilómetro más duro es el ${p.duro}.` : "."}</p>
    <div class="wrap"><table class="kms"><tr><th>Km</th><th>Desnivel</th><th>Ritmo</th><th>Parcial</th><th>Paso</th></tr>
    ${p.kms.map(k => `<tr class="${k.sube / k.len > 0.025 ? "sube" : k.baja / k.len > 0.025 ? "baja" : ""}"><td>${k.km}${k.len < 990 ? `<small> (${k.len} m)</small>` : ""}</td><td>${k.sube || k.baja ? `+${k.sube} / −${k.baja}` : "llano"}</td><td><b>${fmtRitmo(k.ritmo)}</b></td><td>${fmtHoras(k.tiempo)}</td><td>${fmtHoras(k.acum)}</td></tr>${k.nota ? `<tr class="nota-km"><td colspan="5">${esc(k.nota)}</td></tr>` : ""}`).join("")}
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
  const cumpl = tot("sesPlan") ? Math.round(tot("sesHechas") / tot("sesPlan") * 100) : null;
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
