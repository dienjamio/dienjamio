/* Pintado compartido: lo usan la app del entrenador y la vista del deportista. */
import { esc, fmtMin, fmtRitmo, fmtHoras, DIAS, DIAS_C, sumaDias, fechaCorta, rangoSemana, hoy, diasEntre } from "./util.js?v=202611140943";
import { DEP, CARGA_TXT, PRUEBAS, PRIORIDAD, ZNOM, RPE, OBJ } from "./motor.js?v=202611140943";

const ORDEN = ["run", "bike", "swim", "carrera", "fuerza", "movilidad"];

export function htmlSesion(s, ed = false) {
  const d = DEP[s.dep] || DEP.run;
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
    ${ed ? `<div class="ses-acc"><button class="btn sec mini" data-acc="editar-ses" data-id="${s.id}">✎ Cambiar</button></div>` : ""}
  </div>`;
}

export function htmlDia(snap, i, ed = false) {
  const d = snap.dias[i];
  const fecha = sumaDias(snap.lunes, i);
  const esHoy = fecha === hoy();
  const ses = d.ses.length ? d.ses.map(s => htmlSesion(s, ed)).join("") :
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
    <div class="macros">
      <span><b>${m.kcal.toLocaleString("es-ES")}</b> kcal</span><span>Hidratos <b>${m.C} g</b></span><span>Proteína <b>${m.P} g</b></span><span>Grasa <b>${m.G} g</b></span>
    </div>
    ${m.comidas.map(c => `<div class="comida">
      <div class="comida-cab"><span class="t">${esc(c.nombre)}</span><span class="k">~${c.kcal} kcal</span></div>
      <div class="n">${esc(c.plato)}</div>
      <ul>${c.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>`).join("")}
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

export function htmlCarreraFicha(c, ed = false) {
  const dias = diasEntre(hoy(), c.fecha);
  const cuando = dias < 0 ? "Ya pasó" : dias === 0 ? "¡Hoy!" : dias === 1 ? "Mañana" : `Faltan ${dias} días`;
  const [y, m, d] = c.fecha.split("-");
  return `<div class="carrera-f prio-${c.prioridad}${dias < 0 ? " pasada" : ""}">
    <div class="cf-fecha"><b>${+d}</b><span>${fechaCorta(c.fecha).split(" ")[1]} ${y.slice(2)}</span></div>
    <div class="cf-t">
      <b>${esc(c.nombre || PRUEBAS[c.prueba])}</b>
      <span>${PRUEBAS[c.prueba] || ""} · ${c.prioridad} · ${PRIORIDAD[c.prioridad]}${c.lugar ? " · " + esc(c.lugar) : ""}</span>
      <span>${cuando}${c.objetivo ? " · objetivo " + esc(c.objetivo) : ""}</span>
    </div>
    ${ed ? `<div class="cf-acc"><button class="icon-btn" data-acc="editar-carrera" data-id="${c.id}" aria-label="Editar">✎</button></div>` : ""}
  </div>`;
}

export function objetivoTxt(o) { return OBJ[o] || o; }
