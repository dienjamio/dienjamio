/* Asistente del entrenador: le pides cambios en lenguaje normal («Adrián esta semana solo puede lunes y martes:
   métele carrera esos dos días y quítale la fuerza») y propone acciones concretas que tú apruebas con un botón. */
import { esc, hoy, lunesDe, sumaDias, DIAS, fmtRitmo, uid } from "./util.js?v=202611161051";
import { asistente } from "./claude.js?v=202611161051";

export const HERRAMIENTAS = [{
  name: "proponer_cambios",
  description: "Propone cambios concretos en el plan, los ritmos, el menú o la ficha del deportista. El entrenador los revisa y los aplica con un botón. Usa solo ids de sesión que aparezcan en el contexto.",
  input_schema: {
    type: "object",
    properties: {
      resumen: { type: "string", description: "Qué vas a cambiar, en una o dos frases para el entrenador." },
      acciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["disponibilidad_semana", "quitar_sesiones", "cambiar_sesion", "anadir_sesion", "volumen_semana", "ajuste_ritmos", "rehacer_semana", "menu", "usa_cinta", "mensaje_deportista"] },
            semana: { type: "string", description: "«actual», «siguiente» o la fecha del lunes AAAA-MM-DD" },
            dias: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 }, description: "0 = lunes … 6 = domingo" },
            dia: { type: "integer", minimum: 0, maximum: 6 },
            sesion_id: { type: "string" },
            deporte: { type: "string", enum: ["run", "bike", "swim", "fuerza", "movilidad"] },
            minutos: { type: "integer", minimum: 5, maximum: 600 },
            titulo: { type: "string" },
            pasos: { type: "array", items: { type: "string" } },
            nota: { type: "string" },
            factor: { type: "number", minimum: 0.3, maximum: 1.5, description: "volumen de la semana: 0,8 = −20 %" },
            segundos: { type: "integer", minimum: -30, maximum: 30, description: "ajuste fino de TODOS sus ritmos en s/km (+ más lento)" },
            dieta: { type: "string", enum: ["omni", "veg", "vegan"] },
            comidas: { type: "integer", minimum: 3, maximum: 5 },
            sin_gluten: { type: "boolean" },
            sin_lactosa: { type: "boolean" },
            nuevo_menu: { type: "boolean", description: "cambiar los platos de esos días por otros" },
            valor: { type: "boolean" },
            texto: { type: "string" }
          },
          required: ["tipo"]
        }
      }
    },
    required: ["resumen", "acciones"]
  }
}];

const NOMBRE_ACC = {
  disponibilidad_semana: a => `📅 ${semTxt(a.semana)}: solo ${(a.dias || []).map(d => DIAS[d]).join(", ") || "—"}${a.minutos ? ` (máx. ${a.minutos}' al día)` : ""} y rehacer la semana`,
  quitar_sesiones: a => `🗑️ ${semTxt(a.semana)}: quitar ${a.sesion_id ? "la sesión " + a.sesion_id : `${a.deporte ? DEPN[a.deporte] : "sesiones"}${a.dias?.length ? " del " + a.dias.map(d => DIAS[d]).join(", ") : ""}`}`,
  cambiar_sesion: a => `✎ ${semTxt(a.semana)}: cambiar ${a.sesion_id}${a.titulo ? ` → «${a.titulo}»` : ""}${a.minutos ? ` · ${a.minutos}'` : ""}${a.dia != null ? ` · al ${DIAS[a.dia]}` : ""}`,
  anadir_sesion: a => `＋ ${semTxt(a.semana)}: añadir ${DEPN[a.deporte] || "sesión"} el ${DIAS[a.dia ?? 0]} · «${a.titulo || ""}» ${a.minutos || 45}'`,
  volumen_semana: a => `📊 ${semTxt(a.semana)}: volumen ${a.factor >= 1 ? "+" : "−"}${Math.round(Math.abs(a.factor - 1) * 100)} % y rehacer`,
  ajuste_ritmos: a => `⏱️ Todos sus ritmos ${a.segundos > 0 ? `${a.segundos}" más lentos` : `${-a.segundos}" más rápidos`} por km`,
  rehacer_semana: a => `↻ Rehacer ${semTxt(a.semana)}`,
  menu: a => `🍽️ Menú: ${[a.dieta && { omni: "omnívora", veg: "vegetariana", vegan: "vegana" }[a.dieta], a.comidas && a.comidas + " comidas", a.sin_gluten != null && (a.sin_gluten ? "sin gluten" : "con gluten"), a.sin_lactosa != null && (a.sin_lactosa ? "sin lactosa" : "con lactosa"), a.nuevo_menu && "platos nuevos"].filter(Boolean).join(", ")}${a.dias?.length ? " (" + a.dias.map(d => DIAS[d]).join(", ") + ")" : ""}`,
  usa_cinta: a => `🏃 ${a.valor ? "Mostrarle ritmos de cinta" : "Sin cinta: solo min/km"}`,
  mensaje_deportista: a => `💬 Mensaje: «${a.texto || ""}»`
};
const DEPN = { run: "carrera", bike: "bici", swim: "natación", fuerza: "fuerza", movilidad: "movilidad" };
const semTxt = s => !s || s === "actual" ? "esta semana" : s === "siguiente" ? "la semana que viene" : `semana del ${s}`;
export const lunesDeSemana = s => !s || s === "actual" ? lunesDe(hoy()) : s === "siguiente" ? sumaDias(lunesDe(hoy()), 7) : lunesDe(s);

/** Lo que el asistente sabe del deportista. */
export function contexto(a, Z) {
  const l0 = lunesDe(hoy()), regs = (a._aportes || []).filter(x => x.tipo === "sesion");
  const sem = l => { const s = a.semanas?.[l]; if (!s) return "  (sin generar)";
    return s.dias.map((d, i) => `  ${DIAS[i]} ${sumaDias(l, i)}: ${d.ses.length ? d.ses.map(x => `[${x.id}] ${x.dep} ${x.tipo} «${x.t}» ${x.min}'${regs.some(r => r.sesId === x.id) ? " (YA REGISTRADA)" : ""}${x.editada ? " (cambiada a mano)" : ""}`).join(" | ") : "descanso"}`).join("\n"); };
  const T = Z?.tipos ? Object.entries(Z.tipos).map(([k, r]) => `${k} ${fmtRitmo(r[0])}-${fmtRitmo(r[1])}`).join(", ") : "sin ritmos";
  return `Hoy es ${hoy()}.
DEPORTISTA: ${a.nombre}, ${a.edad} años, nivel ${a.nivel}, objetivo ${a.objetivo}. Marcas: ${Object.entries(a.marcas || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ") || "ninguna"}. Ajuste de ritmos actual: ${a.ajusteRitmos || 0} s/km. Usa cinta: ${a.usaCinta !== false ? "sí" : "no"}.
Disponibilidad habitual: ${(a.disp || []).map((d, i) => `${DIAS[i]} ${d.on ? `${d.max || "sin límite"}'` : "no"}`).join(", ")}.
Menú: dieta ${a.dieta}, ${a.comidas} comidas${a.sinGluten ? ", sin gluten" : ""}${a.sinLactosa ? ", sin lactosa" : ""}.
Ritmos de entreno (min/km): ${T}.
Carreras: ${(a.carreras || []).filter(c => c.fecha >= hoy()).map(c => `${c.nombre} ${c.fecha} (${c.prueba}, ${c.prioridad}${c.objetivo ? ", objetivo " + c.objetivo : ""})`).join("; ") || "ninguna"}.
Notas de la ficha: ${a.notas || "—"}

SEMANA ACTUAL (lunes ${l0}):
${sem(l0)}

SEMANA SIGUIENTE (lunes ${sumaDias(l0, 7)}):
${sem(sumaDias(l0, 7))}`;
}

const SISTEMA = `Eres el asistente de un entrenador personal de running y triatlón en España, dentro de su app.
El entrenador te pide cambios para un deportista concreto. Tu trabajo:
1) Entender lo que quiere y proponer los cambios con la herramienta «proponer_cambios» (una sola llamada con todas las acciones).
2) Explicar en 1-3 frases, en español de España, qué vas a cambiar y por qué tiene sentido como entrenador.
Reglas:
- Días: 0 = lunes … 6 = domingo. Semanas: «actual», «siguiente» o la fecha del lunes.
- Para «solo puede entrenar X días» usa «disponibilidad_semana» (rehace la semana con esos días) y, si pide quitar algo (p. ej. la fuerza), añade «quitar_sesiones» con deporte.
- Para cambiar una sesión concreta usa su id exacto del contexto. Nunca inventes ids.
- Sé realista: no subas el volumen más de un 10 % por semana; tras días sin entrenar, vuelve suave.
- Si la petición es ambigua o arriesgada (dolor, lesión), pregunta antes en vez de proponer.
- Las semanas con sesiones YA REGISTRADAS: avisa de que rehacerla puede descolgar lo registrado.`;

/** Envía la conversación y devuelve { texto, propuesta } (propuesta = input de la herramienta o null). */
export async function preguntar(historial, ctx) {
  const msgs = historial.map(m => ({ role: m.role, content: m.content }));
  msgs[msgs.length - 1] = { role: "user", content: `${ctx}\n\nPETICIÓN DEL ENTRENADOR: ${msgs[msgs.length - 1].content}` };
  const r = await asistente(SISTEMA, msgs, HERRAMIENTAS);
  const texto = r.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const tool = r.content.find(b => b.type === "tool_use" && b.name === "proponer_cambios");
  return { texto, propuesta: tool ? tool.input : null };
}

export function htmlPropuesta(p, i, aplicada = false) {
  return `<div class="prop-c${aplicada ? " hecha" : ""}"><b>${esc(p.resumen || "Cambios propuestos")}</b>
    <ul>${(p.acciones || []).map(x => `<li>${esc((NOMBRE_ACC[x.tipo] || (() => x.tipo))(x))}</li>`).join("")}</ul>
    ${aplicada ? `<span class="chip ok">✅ Aplicado</span>` : `<div class="fila"><button class="btn pri mini" data-acc="aplicar-prop" data-i="${i}">Aplicar</button><button class="btn sec mini" data-acc="descartar-prop" data-i="${i}">Descartar</button></div>`}</div>`;
}
export const nuevoId = () => uid(8);
