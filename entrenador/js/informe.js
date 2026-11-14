/* Informe mensual de un deportista, listo para imprimir o guardar en PDF desde el móvil o el ordenador. */
import { esc, fmtHoras, fmtRitmo, sumaDias, lunesDe, fechaCorta, hoy } from "./util.js?v=202611142024";
import { puntuarBien } from "./carga.js?v=202611142024";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = m => `${MESES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}`;
export function ultimosMeses(n = 6) {
  const out = []; let [y, mo] = hoy().split("-").map(Number);
  for (let i = 0; i < n; i++) { out.push(`${y}-${String(mo).padStart(2, "0")}`); mo--; if (!mo) { mo = 12; y--; } }
  return out;
}
const finMes = m => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const num = x => parseFloat(String(x ?? "").replace(",", ".")) || 0;
const DEPN = { run: "🏃 Carrera", bike: "🚴 Bici", swim: "🏊 Natación", fuerza: "🏋️ Fuerza" };
const SENS = { muy_facil: "Muy fácil", facil: "Fácil", bien: "Bien", dura: "Dura", excesiva: "Excesiva" };
const DIST = { "5k": ["5 km", 5], "10k": ["10 km", 10], media: ["Media", 21.0975], maraton: ["Maratón", 42.195] };

/**
 * a: ficha con semanas, actividades y _aportes · mes "AAAA-MM" · carga: calcCarga (≥ 120 días) · pred: predecir
 * entrenador: nombre que firma · comentario: texto libre del entrenador.
 */
export function htmlInforme({ a, mes, carga, pred, entrenador = "", comentario = "", logo = "img/logo.svg" }) {
  const ini = `${mes}-01`, fin = finMes(mes), h = hoy(), hasta = fin < h ? fin : h;
  const en = f => f >= ini && f <= fin;
  const ap = a._aportes || [], acts = (a.actividades || []).filter(x => en(x.fecha) && DEPN[x.dep]);
  // plan frente a hecho
  let plan = 0, hechas = 0, minPlan = 0, minHecho = 0;
  const semanas = {};
  for (let l = lunesDe(ini); l <= fin; l = sumaDias(l, 7)) {
    const snap = a.semanas?.[l]; if (!snap) continue;
    snap.dias.forEach((d, i) => {
      const f = sumaDias(l, i); if (!en(f) || f > hasta) return;
      for (const s of d.ses) {
        if (s.dep === "movilidad") continue;
        plan++; minPlan += +s.min || 0;
        const r = ap.find(x => x.tipo === "sesion" && x.sesId === s.id && x.hecho !== "no");
        const act = acts.find(x => x.fecha === f && x.dep === s.dep);
        if (r || act) { hechas++; const m = act ? act.dur / 60 : (+s.min || 0) * (r.hecho === "parcial" ? 0.5 : 1); minHecho += m; (semanas[l] = semanas[l] || { p: 0, h: 0 }).h += m; }
        (semanas[l] = semanas[l] || { p: 0, h: 0 }).p += +s.min || 0;
      }
    });
  }
  const regsSinAct = ap.filter(x => x.tipo === "sesion" && x.hecho !== "no" && x.lunes && en(sumaDias(x.lunes, x.dia || 0)) && !x.act);
  const km = acts.filter(x => x.dep === "run").reduce((t, x) => t + (x.km || 0), 0) + (acts.some(x => x.dep === "run") ? 0 : regsSinAct.reduce((t, r) => t + num(r.km), 0));
  const horas = (acts.reduce((t, x) => t + (x.dur || 0), 0) / 3600) || minHecho / 60;
  const sube = acts.reduce((t, x) => t + (x.sube || 0), 0);
  const porDep = {}; acts.forEach(x => { porDep[x.dep] = (porDep[x.dep] || 0) + x.dur / 60; });
  const mejores = {};
  for (const x of acts) for (const [k, s] of Object.entries(x.mejores || {})) if (DIST[k] && (!mejores[k] || s < mejores[k].s)) mejores[k] = { s, f: x.fecha };
  const bien = ap.filter(x => x.tipo === "bienestar" && en(x.fecha)).map(puntuarBien).filter(x => x != null);
  const dolores = ap.filter(x => x.tipo === "bienestar" && en(x.fecha) && x.dolor).map(x => x.dolorTxt).filter(Boolean);
  const vals = ap.filter(x => x.tipo === "semana" && x.lunes && en(sumaDias(x.lunes, 6)));
  const carrerasMes = (a.carreras || []).filter(c => en(c.fecha));
  const prox = (a.carreras || []).filter(c => c.fecha > fin && c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
  const cIni = carga?.serie.find(s => s.f >= ini), cFin = carga?.serie.filter(s => s.f <= fin).pop();
  if (!Object.keys(semanas).length) for (const x of acts) { const l = lunesDe(x.fecha); (semanas[l] = semanas[l] || { p: 0, h: 0 }).h += x.dur / 60; } // sin plan: lo que hizo
  // barras por semana
  const ls = Object.keys(semanas).sort(), mx = Math.max(60, ...ls.map(l => Math.max(semanas[l].p, semanas[l].h)));
  const barras = ls.length ? `<svg viewBox="0 0 ${ls.length * 90} 150" class="inf-barras" role="img" aria-label="Minutos planificados y hechos por semana">
    ${ls.map((l, i) => { const p = semanas[l].p / mx * 110, hh = semanas[l].h / mx * 110; return `<rect x="${i * 90 + 14}" y="${120 - p}" width="28" height="${p}" class="pl"/><rect x="${i * 90 + 46}" y="${120 - hh}" width="28" height="${hh}" class="he"/>
      <text x="${i * 90 + 45}" y="${115 - Math.max(p, hh)}" class="v">${String(Math.round(semanas[l].h / 60 * 10) / 10).replace(".", ",")} h</text><text x="${i * 90 + 45}" y="140" class="ax">${fechaCorta(l)}</text>`; }).join("")}</svg>
    <div class="inf-ley"><span class="pl">Planificado</span><span class="he">Hecho</span></div>` : "";
  const pct = plan ? Math.round(hechas / plan * 100) : null;
  const kpi = (v, t) => `<div class="inf-kpi"><b>${v}</b><span>${t}</span></div>`;
  return `<div class="inf-pag">
    <header class="inf-cab"><img src="${logo}" alt="" class="inf-logo"><div><h1>Informe de ${nombreMes(mes)}</h1><p><b>${esc(a.nombre)}</b> · ${esc(a._objetivoTxt || "")}${entrenador ? ` · Entrenador: ${esc(entrenador)}` : ""}</p></div></header>
    <section class="inf-kpis">
      ${pct != null ? kpi(pct + " %", `cumplimiento (${hechas} de ${plan} sesiones)`) : ""}
      ${kpi(String(Math.round(horas * 10) / 10).replace(".", ",") + " h", "de entreno")}
      ${kpi(Math.round(km) + " km", "corriendo")}
      ${sube ? kpi(Math.round(sube) + " m", "de desnivel positivo") : ""}
      ${bien.length ? kpi(Math.round(bien.reduce((t, x) => t + x, 0) / bien.length) + "/100", `bienestar medio (${bien.length} días)`) : ""}
      ${cIni && cFin ? kpi(`${Math.round(cIni.ctl)} → ${Math.round(cFin.ctl)}`, `forma (${cFin.ctl >= cIni.ctl ? "▲" : "▼"} ${Math.abs(Math.round(cFin.ctl - cIni.ctl))})`) : ""}
    </section>
    ${barras ? `<section><h2>Semana a semana</h2>${barras}</section>` : ""}
    ${Object.keys(porDep).length ? `<section><h2>Reparto</h2><p>${Object.entries(porDep).map(([d, m]) => `${DEPN[d]}: <b>${m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`}</b>`).join(" · ")}</p></section>` : ""}
    ${Object.keys(mejores).length || carrerasMes.length ? `<section><h2>Mejores marcas y carreras</h2><ul>
      ${Object.entries(mejores).map(([k, m]) => `<li>Mejor ${DIST[k][0]}: <b>${fmtHoras(m.s)}</b> (${fmtRitmo(m.s / DIST[k][1])} /km) · ${fechaCorta(m.f)}</li>`).join("")}
      ${carrerasMes.map(c => { const ses = (a.semanas?.[lunesDe(c.fecha)]?.dias || []).flatMap(d => d.ses).find(s => s.carrera?.id === c.id); const r = ses && ap.find(x => x.tipo === "sesion" && x.sesId === ses.id); return `<li>🏁 ${esc(c.nombre)} · ${fechaCorta(c.fecha)}${c.objetivo ? ` · objetivo ${esc(c.objetivo)}` : ""}${r?.tiempo ? ` · <b>${esc(r.tiempo)}</b>` : ""}</li>`; }).join("")}
    </ul></section>` : ""}
    ${pred ? `<section><h2>Tiempos previstos</h2><p>${Object.entries(DIST).map(([k, [n]]) => `${n}: <b>${fmtHoras(pred.tiempos[k])}</b>`).join(" · ")}</p><p class="inf-nota">VDOT ${String(pred.vdot).replace(".", ",")}, calculado con ${esc(pred.fuente)}.${pred.senal ? " " + esc(pred.senal) : ""}</p></section>` : ""}
    ${vals.length || dolores.length ? `<section><h2>Sensaciones</h2>${vals.length ? `<p>Semanas: ${vals.sort((x, y) => x.lunes.localeCompare(y.lunes)).map(v => `${fechaCorta(v.lunes)} <b>${SENS[v.sensacion] || "—"}</b>`).join(" · ")}</p>` : ""}${dolores.length ? `<p>Molestias anotadas: ${[...new Set(dolores)].map(esc).join(", ")}</p>` : ""}</section>` : ""}
    ${comentario ? `<section class="inf-com"><h2>Valoración del entrenador</h2><p>${esc(comentario).replace(/\n/g, "<br>")}</p></section>` : ""}
    ${prox ? `<section><h2>Próximo objetivo</h2><p>🏁 <b>${esc(prox.nombre)}</b> · ${fechaCorta(prox.fecha)}${prox.objetivo ? ` · objetivo ${esc(prox.objetivo)}` : ""}${pred && DIST[prox.prueba] ? ` · previsión hoy ${fmtHoras(pred.tiempos[prox.prueba])}` : ""}</p></section>` : ""}
    <footer class="inf-pie">Generado el ${fechaCorta(h)} con Dienjamio Entrenador</footer>
  </div>`;
}
