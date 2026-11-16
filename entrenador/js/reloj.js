/* Pasar los entrenos al reloj: los pasos exactos (duración, ritmo objetivo, repeticiones) con el vocabulario
   de cada marca, y cómo crearlos en su app. Los menús pueden cambiar algo según el modelo y la versión. */
import { esc, fmtRitmo, DIAS, sumaDias, fechaCorta } from "./util.js?v=202611160954";

export const MARCAS = { garmin: "Garmin", polar: "Polar", coros: "Coros", suunto: "Suunto", apple: "Apple Watch", otro: "Otro" };
const V = {
  garmin: { cal: "Calentamiento", run: "Correr", rec: "Recuperación", enf: "Enfriamiento", rep: "Repetir", obj: "Objetivo: ritmo" },
  polar: { cal: "Fase: calentamiento", run: "Fase", rec: "Fase: recuperación", enf: "Fase: vuelta a la calma", rep: "Repetir fases", obj: "Intensidad: ritmo" },
  coros: { cal: "Calentamiento", run: "Entrenamiento", rec: "Descanso", enf: "Enfriamiento", rep: "Grupo · repeticiones", obj: "Objetivo: ritmo" },
  suunto: { cal: "Calentamiento", run: "Intervalo", rec: "Recuperación", enf: "Enfriamiento", rep: "Repetir", obj: "Ritmo" },
  apple: { cal: "Calentamiento", run: "Trabajo", rec: "Recuperación", enf: "Enfriamiento", rep: "Repeticiones", obj: "Alerta de ritmo" },
  otro: { cal: "Calentamiento", run: "Correr", rec: "Recuperar", enf: "Enfriamiento", rep: "Repetir", obj: "Ritmo" }
};
export const COMO = {
  garmin: ["Abre la app <b>Garmin Connect</b> → menú (≡ o «Más») → <b>Entrenamiento y planificación</b> → <b>Entrenamientos</b> → <b>Crear entrenamiento</b> → <b>Carrera</b>.",
    "Añade los pasos de abajo. En cada paso: <b>Duración</b> (tiempo o distancia) y <b>Objetivo → Ritmo</b> con el rango que te indico.",
    "Para las series pulsa <b>Añadir repetición</b> y mete dentro el paso de correr y el de recuperación.",
    "Guarda, pulsa <b>Enviar al dispositivo</b> y sincroniza. En el reloj: <b>Correr → menú → Entrenamiento → Mis entrenamientos</b>."],
  polar: ["Abre <b>Polar Flow</b> (app o flow.polar.com) → <b>Entrenamiento</b> → <b>Añadir objetivo de entrenamiento</b> → <b>Por fases</b> (deporte: carrera).",
    "Crea una fase por cada paso de abajo con su <b>duración o distancia</b> y la <b>intensidad por ritmo</b> que te indico.",
    "Para las series usa <b>Repetir</b> sobre la fase de correr y la de recuperación.",
    "Elige el día, guarda y <b>sincroniza el reloj</b>. Al empezar a entrenar te lo propondrá (o búscalo en Favoritos si lo marcas con ★)."],
  coros: ["Abre la app <b>COROS</b> → <b>Entrenamiento</b> → <b>Entrenamientos</b> → <b>＋</b> → <b>Carrera</b>.",
    "Añade Calentamiento, Entrenamiento, Descanso y Enfriamiento con su duración y <b>objetivo de ritmo</b>.",
    "Para las series crea un <b>Grupo</b> con el paso de entrenamiento y el de descanso, y pon el número de repeticiones.",
    "Guarda y pulsa <b>Sincronizar al reloj</b>. En el reloj: <b>Entrenamiento → Entrenamientos</b>."],
  suunto: ["Abre la <b>app Suunto</b> → <b>Entrenamiento</b> → crea un <b>entrenamiento estructurado</b> de carrera.",
    "Añade los pasos de abajo con su duración y el <b>ritmo objetivo</b>; las series como repeticiones.",
    "Guarda y sincroniza; en el reloj lo encontrarás al elegir el ejercicio de carrera."],
  apple: ["En el reloj abre <b>Entreno</b> → <b>Correr al aire libre</b> → <b>⋯</b> → <b>Crear entreno</b> → <b>Personalizado</b>.",
    "Añade <b>Calentamiento</b>, los bloques de <b>Trabajo/Recuperación</b> (con <b>alerta de ritmo</b>) y las <b>repeticiones</b>, y el <b>Enfriamiento</b>.",
    "También puedes crearlo desde la app Fitness/Entreno del iPhone. Necesita watchOS 9 o posterior."],
  otro: ["Si tu reloj o app permite <b>entrenos estructurados</b>, crea uno con los pasos de abajo.",
    "Si no, ponte una alarma de vuelta o guíate por la pantalla de ritmo con estos rangos."]
};

const dur = m => m < 1 ? `${Math.round(m * 60)} s` : Number.isInteger(m) ? `${m}:00 min` : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")} min`;
const ritmo = r => r ? `${fmtRitmo(r[0])}-${fmtRitmo(r[1])} /km` : "";
function una(t, v) {
  const d = t.m ? (t.m >= 1000 && t.m % 1000 === 0 ? `${t.m / 1000} km` : `${t.m} m`) : dur(t.min);
  if (t.k === "andar") return `${d} · andando (sin objetivo)`;
  if (t.k === "trote") return `${d} · trote muy suave (sin objetivo)`;
  if (t.k === "cuesta") return `${d} · subiendo fuerte en cuesta (sin objetivo de ritmo)`;
  return `${d}${t.r ? ` · ${v.obj} ${ritmo(t.r)}` : ""}`;
}
/** Pasos para el reloj de una sesión con tramos (s.tr). Devuelve [{n, txt, sub[]}]. */
export function pasosReloj(s, marca = "garmin") {
  if (!s?.tr?.length) return [];
  const v = V[marca] || V.otro, tr = s.tr, out = [];
  tr.forEach((t, i) => {
    const nombre = tr.length >= 3 && i === 0 ? v.cal : tr.length >= 3 && i === tr.length - 1 ? v.enf : v.run;
    if (!t.n) { out.push({ n: nombre, txt: una(t, v) }); return; }
    const sub = [`${v.run}: ${una(t, v)}`];
    if (t.par) sub.push(`${v.rec}: ${una(t.par, v)}`);
    else if (t.rec) sub.push(`${v.rec}: ${dur(t.rec)} · trote suave${t.rr ? ` (${ritmo(t.rr)})` : ""}`);
    out.push({ n: `${v.rep} ${t.n} veces`, txt: "", sub });
  });
  return out;
}
export const textoPasos = (s, marca) => `${s.t} (${s.min}')\n` + pasosReloj(s, marca).map((p, i) => `${i + 1}. ${p.n}${p.txt ? ": " + p.txt : ""}${p.sub ? "\n" + p.sub.map(x => "   · " + x).join("\n") : ""}`).join("\n");

/** Pantalla «Reloj»: guía de su marca y los entrenos de esta semana y la siguiente listos para meter. */
export function htmlReloj(P, marca) {
  marca = MARCAS[marca] ? marca : "garmin";
  const ses = [];
  for (const l of Object.keys(P.semanas || {}).sort()) P.semanas[l].dias.forEach((d, i) => d.ses.filter(x => x.dep === "run" && x.tr?.length).forEach(x => ses.push({ s: x, f: sumaDias(l, i), i })));
  const hoy = new Date().toISOString().slice(0, 10);
  return `<div class="card reloj-c"><div class="card-h"><span class="h2">⌚ Tu reloj</span></div>
      <div class="seg">${Object.entries(MARCAS).map(([k, n]) => `<button data-acc="marca-reloj" data-m="${k}" aria-pressed="${k === marca}">${n}</button>`).join("")}</div>
      <ol class="como">${COMO[marca].map(x => `<li>${x}</li>`).join("")}</ol>
      <p class="small muted">Los nombres de los menús pueden variar un poco según el modelo y la versión de la app.</p></div>
    ${ses.filter(x => x.f >= hoy).map(({ s, f, i }) => { const p = pasosReloj(s, marca); return `<div class="card reloj-s"><div class="card-h"><div><span class="k">${DIAS[i]} ${fechaCorta(f)}</span><b>${esc(s.t)}</b></div><button class="btn sec mini" data-acc="copiar-pasos" data-id="${s.id}">Copiar</button></div>
      <ol class="pasos-r">${p.map(x => `<li><b>${esc(x.n)}</b>${x.txt ? `<span>${esc(x.txt)}</span>` : ""}${x.sub ? `<ul>${x.sub.map(y => `<li>${esc(y)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol></div>`; }).join("") || `<p class="muted small">Esta semana no tienes entrenos de carrera con estructura para el reloj.</p>`}`;
}
