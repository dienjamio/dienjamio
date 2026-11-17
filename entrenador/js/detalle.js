/* «Paso a paso» de cada entreno para el deportista: bloques con ritmo (calle y cinta), pulso, esfuerzo y km,
   para qué sirve, claves de técnica, comida, plan B y cómo ponerlo en el reloj. */
import { esc, fmtRitmo } from "./util.js?v=202611170543";

const kmh = r => (3600 / ((r[0] + r[1]) / 2)).toFixed(1).replace(".", ",");
const med = r => (r[0] + r[1]) / 2;
const RPE = { andar: "1", trote: "2", recuperacion: "2-3", rodaje: "3-4", tirada: "3-4", maraton: "5-6", media: "6-7", umbral: "7", "10k": "8", "5k": "8-9", series: "9", cuesta: "9" };
const SENS = { andar: "paseo a buen paso", trote: "trote muy suave, puedes cantar", recuperacion: "muy fácil, conversación sin esfuerzo", rodaje: "cómodo, puedes hablar en frases largas", tirada: "cómodo y sostenible, sin agobio",
  maraton: "firme pero controlado, frases cortas", media: "exigente pero sostenible, frases cortas", umbral: "duro y controlado: solo palabras sueltas", "10k": "duro: respiración fuerte", "5k": "muy duro: casi sin poder hablar", series: "muy duro, al límite pero repetible", cuesta: "fuerte y explosivo, subiendo con técnica" };
const NOMK = { andar: "andando", trote: "trote muy suave", recuperacion: "recuperación", rodaje: "rodaje", tirada: "ritmo de tirada", maraton: "ritmo maratón", media: "ritmo media", umbral: "umbral", "10k": "ritmo 10K", "5k": "ritmo 5K", series: "ritmo de series", cuesta: "en cuesta" };
const fmtKm = k => k >= 10 ? Math.round(k) + " km" : k.toFixed(1).replace(".", ",") + " km";
const dur = m => m < 1 ? `${Math.round(m * 60)}''` : Number.isInteger(m) ? `${m}'` : `${Math.floor(m)}'${String(Math.round((m % 1) * 60)).padStart(2, "0")}''`;

/** km aproximados de un tramo (una repetición) */
function kmDe(t) {
  if (t.m) return t.m / 1000;
  if (t.k === "andar") return t.min / 12;
  if (t.k === "cuesta") return t.min * 60 / 330;
  if (!t.r) return t.min * 60 / 400;
  return t.min * 60 / med(t.r);
}
function minDe(t) { return t.min || (t.r ? t.m / 1000 * med(t.r) / 60 : t.m / 1000 * 6); }

function lineaRitmo(t) {
  if (t.k === "andar" || t.k === "cuesta" || t.k === "trote") return `<span class="pp-r">${t.k === "cuesta" ? "Subiendo fuerte (sin mirar el ritmo)" : t.k === "trote" ? "Trote muy suave" : "Andando a buen paso"}</span>`;
  return t.r ? `<span class="pp-r"><span class="c-calle">${fmtRitmo(t.r[0])}-${fmtRitmo(t.r[1])} /km</span><span class="c-cinta">${kmh(t.r)} km/h</span></span>` : "";
}
function chips(t) {
  return `<span class="pp-chips">${t.f ? `<span>❤️ ${t.f[0]}-${t.f[1]} ppm</span>` : ""}<span>💪 RPE ${RPE[t.k] || "—"}/10</span></span>`;
}

function paso(t, nombre, icono, extra = "") {
  const km = kmDe(t);
  if (!t.n) return `<li class="pp"><div class="pp-cab"><b>${icono} ${nombre}</b><span>${dur(minDe(t))} · ~${fmtKm(km)}</span></div>
    <div class="pp-cuerpo">${NOMK[t.k] ? `<span class="pp-k">${NOMK[t.k]}</span>` : ""}${lineaRitmo(t)}${chips(t)}<p class="pp-s">${SENS[t.k] || ""}</p>${extra}</div></li>`;
  const una = t.m ? (t.m >= 1000 && t.m % 1000 === 0 ? `${t.m / 1000} km` : `${t.m} m`) : dur(t.min);
  const total = (km * t.n + (t.par ? kmDe(t.par) * t.n : 0) + (t.rec && t.rr ? t.rec * 60 / med(t.rr) * (t.n - 1) : 0));
  const enMetros = !t.m && t.r && t.min >= 1 ? ` <small>(≈ ${Math.round(km * 1000 / 10) * 10} m cada una)</small>` : "";
  const tiempoRep = t.m && t.r ? ` <small>(≈ ${dur(Math.round(minDe(t) * 60) / 60)} cada una)</small>` : "";
  return `<li class="pp pp-main"><div class="pp-cab"><b>${icono} ${nombre}</b><span>${t.n} × ${una} · ~${fmtKm(total)}</span></div>
    <div class="pp-cuerpo">
      <div class="pp-rep"><b>${t.n} × ${una}${t.par ? ` + ${dur(t.par.min)} ${t.par.k === "andar" ? "andando" : "suave"}` : ""}</b>${enMetros}${tiempoRep}</div>
      ${NOMK[t.k] ? `<span class="pp-k">${NOMK[t.k]}</span>` : ""}${lineaRitmo(t)}${chips(t)}<p class="pp-s">${SENS[t.k] || ""}</p>
      ${t.rec ? `<div class="pp-rec">↩️ Recuperación: <b>${dur(t.rec)}</b> ${t.k === "cuesta" ? "bajando al trote" : "trotando muy suave"}${t.rr ? ` <span class="c-calle">(${fmtRitmo(t.rr[0])}-${fmtRitmo(t.rr[1])} /km)</span><span class="c-cinta">(${kmh(t.rr)} km/h)</span>` : ""}. No te pares del todo.</div>` : ""}
      ${extra}
    </div></li>`;
}

/* ---------- Textos por tipo de sesión ---------- */
function clave(s) {
  const t = (s.t || "").toLowerCase();
  if (s.dep === "fuerza") return "fuerza";
  if (s.dep === "bike") return s.tipo === "largo" ? "bike-largo" : s.tipo === "calidad" ? "bike-calidad" : "bike-suave";
  if (s.dep === "swim") return "swim";
  if (s.dep === "movilidad") return "movilidad";
  if (s.tipo === "calidad") return /cuesta/.test(t) ? "cuestas" : /fartlek/.test(t) ? "fartlek" : /hiit/.test(t) ? "hiit" : /vo2/.test(t) ? "vo2" : /umbral/.test(t) ? "umbral" : /competici/.test(t) ? "ritmo" : "toque";
  return s.tipo;
}
const TXT = {
  suave: { para: "Construir tu base aeróbica: el corazón bombea más sangre por latido, los músculos aprovechan mejor el oxígeno y los tendones se adaptan al impacto. Es el 70-80 % de tu entrenamiento y lo que permite que las series funcionen.",
    claves: ["Si dudas, más lento: lo fácil tiene que ser fácil para que lo duro pueda ser duro.", "Pasos cortos y rápidos (unos 165-180 por minuto), sin «frenar» con el talón por delante.", "Hombros sueltos, brazos a 90° hacia delante y atrás, mirada al frente."],
    planb: "Si vas cansado o el pulso sube más de la cuenta, baja el ritmo o camina 1' y sigue. Acortar 10-15' no pasa nada." },
  recuperacion: { para: "Recuperar del entreno duro de ayer: mover la sangre por las piernas sin añadir fatiga.",
    claves: ["Tan suave que te dé hasta un poco de vergüenza.", "Superficie blanda si puedes (tierra, césped).", "Al terminar, 10' de movilidad de cadera y tobillo."],
    planb: "Si tienes las piernas muy cargadas, cámbialo por 30' de bici suave, paseo o descanso." },
  largo: { para: "Resistencia: que aguantes más tiempo, que tu cuerpo aprenda a usar la grasa como combustible y ahorre glucógeno. También fortalece tendones, huesos y la cabeza.",
    claves: ["Empieza más lento de lo que te pide el cuerpo: los primeros 15' son de calentamiento.", "Mantén el ritmo constante; en cuestas mantén el esfuerzo, no el ritmo.", "Si hay bloque final más rápido, que sea progresivo y controlado, sin terminar vacío.", "Practica lo que vas a comer y beber en carrera."],
    planb: "Si a mitad de tirada vas muy justo, quita el bloque rápido y termina suave. Mejor acabar con sensación de poder seguir." },
  vo2: { para: "Subir tu techo aeróbico (VO2máx): la cantidad máxima de oxígeno que puedes usar. Es lo que te da «motor» para 5K y 10K.",
    claves: ["Todas las repeticiones al mismo ritmo: la primera NO más rápida.", "Respira profundo y rítmico; relaja la cara y las manos.", "Zancada algo más amplia que en rodaje, pero sin estirar la pierna por delante.", "En la recuperación trota, no te pares: así llegas mejor a la siguiente."],
    planb: "Si la última repetición sale 5 s/km más lenta que las primeras o no puedes mantener el ritmo, para ahí: el trabajo útil ya está hecho." },
  umbral: { para: "Subir el ritmo que aguantas sin que el lactato se dispare (umbral). Es la clave para mejorar en 10K, media y maratón.",
    claves: ["Es un esfuerzo «cómodamente duro»: controlado, nunca a tope.", "Mejor quedarse 2-3 s/km lento que ir rápido: pasarse convierte el umbral en series y cansa sin dar más.", "Respiración profunda y regular; si jadeas, frena un poco."],
    planb: "Si hace calor, viento o vas cansado, guíate por el pulso y no por el ritmo. Si tampoco llegas, haz un bloque menos." },
  fartlek: { para: "Juego de ritmos: acostumbrar al cuerpo a cambiar de ritmo y mejorar la base aeróbica sin el estrés de unas series.",
    claves: ["Los cambios, alegres pero no a tope.", "En las partes suaves, trote de verdad suave para recuperar.", "Puedes hacerlo por sensaciones: no hace falta clavar el ritmo."],
    planb: "Si vas justo, haz menos cambios o hazlos más suaves." },
  cuestas: { para: "Fuerza específica para correr: más potencia, mejor técnica (rodilla alta, empuje del tobillo) y menos riesgo de lesión que las series en llano.",
    claves: ["Busca una cuesta del 5-8 % (que cueste, pero que se pueda correr).", "Tronco algo inclinado desde el tobillo (no desde la cintura), mirada 10 m por delante.", "Brazos enérgicos marcando el ritmo; pasos cortos y rápidos.", "Baja trotando muy suave: la bajada es la recuperación."],
    planb: "Si notas el gemelo o el Aquiles cargado, haz las cuestas más suaves o cámbialas por rodaje con rectas." },
  hiit: { para: "Mejorar tu capacidad cardiovascular en poco tiempo con esfuerzos muy cortos e intensos.",
    claves: ["Los 30'' fuertes, de verdad fuertes; las recuperaciones, de verdad suaves.", "Mejor en llano y con buen suelo."],
    planb: "Si no recuperas entre esfuerzos, alarga la recuperación o haz menos repeticiones." },
  ritmo: { para: "Que el ritmo de tu carrera te salga automático y económico, físicamente y de cabeza.",
    claves: ["Clava el ritmo: ni más rápido ni más lento.", "Practica el material, la ropa y lo que comerás en carrera.", "Piensa en sensaciones: así tiene que sentirse el día de la carrera."],
    planb: "Si el ritmo no sale, mantenlo un poco más lento pero constante. No fuerces." },
  toque: { para: "Mantener la chispa y el ritmo de competición sin cansarte antes de la carrera.",
    claves: ["Corto y sin apretar de más: solo recordar el ritmo.", "Mucha soltura y buena técnica."],
    planb: "Si estás cansado, haz solo los progresivos." },
  test: { para: "Medir tu forma: con este tiempo se recalculan todos tus ritmos de entrenamiento.",
    claves: ["Hazlo descansado y en un circuito llano que conozcas (o pista).", "Sal un poco por debajo de lo que crees y acelera en el último km.", "Graba con el reloj y súbelo o apunta el tiempo exacto."],
    planb: "Si hace mal tiempo o no estás bien, aplázalo a otro día de la semana y haz rodaje suave." },
  iniciacion: { para: "Empezar a correr sin lesionarte: el corazón se adapta en pocas semanas, pero huesos y tendones necesitan más tiempo. Por eso alternamos correr y andar.",
    claves: ["Trota TAN suave que puedas hablar. Si te ahogas, vas rápido.", "Pasos cortos, sin «botar».", "Andando, a buen paso: es parte del entreno, no descanso."],
    planb: "Si una semana se te hace dura, repítela antes de pasar a la siguiente. Es lo normal." },
  readapt: { para: "Volver a correr después de una lesión dando tiempo a que el tejido se adapte.",
    claves: ["Regla del dolor: hasta 3 sobre 10 durante, vale. Si al día siguiente duele más, repite la semana anterior.", "Superficie regular y blanda; nada de cuestas ni cambios de ritmo."],
    planb: "Si aparece dolor que te hace cambiar la forma de correr, para, anda y avisa a tu entrenador." },
  activacion: { para: "Llegar a la carrera con las piernas despiertas: poco volumen y unos toques de ritmo.",
    claves: ["Muy corto y suave; los toques, a ritmo de carrera y relajados.", "Prepara la ropa, el dorsal y el desayuno de mañana."], planb: "Si estás nervioso o cansado, quédate solo con el rodaje suave." },
  competicion: { para: "¡Tu día! Todo el trabajo ya está hecho.",
    claves: ["Desayuna 2,5-3 h antes lo de siempre (nada nuevo).", "Calienta 10-15' suave + 3 progresivos; llega a la salida 15' antes.", "Los primeros 2 km algo más lentos que tu ritmo objetivo: la carrera empieza en la segunda mitad.", "Bebe en los avituallamientos aunque no tengas sed."],
    planb: "Si hace calor o viento, olvida el ritmo y corre por sensaciones: ajusta el objetivo." },
  "bike-suave": { para: "Base aeróbica sin impacto: entrenas el corazón y descansas articulaciones.", claves: ["Cadencia fluida: 85-95 pedaladas por minuto.", "Desarrollos ligeros; en subidas, sentado y suave."], planb: "Si vas cansado, acorta. Mejor salir que no salir." },
  "bike-largo": { para: "Resistencia: muchas horas a esfuerzo cómodo para mejorar la base y practicar la comida en movimiento.", claves: ["Come algo cada 30-40' y bebe cada 15-20'.", "En subidas, mantén el esfuerzo, no la velocidad.", "Revisa la bici, lleva cámara, móvil y luces."], planb: "Si se tuerce el tiempo, mejor rodillo 60-90' en Z2." },
  "bike-calidad": { para: "Subir tu potencia en el umbral y por encima, que es lo que te hace ir más rápido en llano y en subida.", claves: ["Calienta bien antes de los bloques.", "Cadencia 85-95 en los bloques; mantén la potencia o el pulso estable."], planb: "Si las piernas no responden, cambia a rodaje en Z2." },
  swim: { para: "Técnica y resistencia en el agua.", claves: ["Respira cada 3 brazadas si puedes (bilateral).", "Alarga la brazada: menos brazadas por largo es mejor técnica."], planb: "Si te cuesta, haz más técnica y menos metros." },
  fuerza: { para: "Músculos y tendones más fuertes: corres más eficiente, rindes más al final de las carreras y te lesionas menos.",
    claves: ["Técnica antes que peso: si la forma se rompe, baja el peso.", "Termina cada serie con 2 repeticiones «en la recámara» (RIR 2): duro pero sin fallo.", "Ritmo controlado: 2'' bajando, 1'' parado, sube con intención.", "Descanso: 60-90'' entre series de ejercicios grandes, 30-45'' en core.", "Pulsa ⓘ en cada ejercicio para ver cómo se hace."],
    planb: "Si estás muy cargado del día anterior, haz solo el core y la movilidad." },
  movilidad: { para: "Mantener el cuerpo móvil y el core fuerte, y recuperar.", claves: ["Sin dolor, respirando lento.", "Mejor 15' bien hechos que 40' con prisa."], planb: "Si hay mucho cansancio, descanso total." }
};

function comida(s) {
  const dura = ["calidad", "test", "competicion", "largo"].includes(s.tipo) || s.dep === "bike" && s.tipo === "largo";
  const largo = (+s.min || 0) >= 75;
  if (s.dep === "movilidad") return "";
  const antes = dura ? "Comida 2-3 h antes (pasta, arroz, pan, tostada con plátano…) o un tentempié de 30-60 g de hidratos 45-60' antes. Nada nuevo." : (+s.min || 0) >= 50 ? "Algo ligero 1-2 h antes (fruta, tostada, yogur). En ayunas solo si es suave y corto." : "Puedes hacerlo en ayunas o tras algo ligero (fruta).";
  const durante = largo ? "Agua cada 15-20' y 30-60 g de hidratos por hora a partir de los 60' (gel, dátiles, bebida isotónica)." : "Con calor, lleva agua.";
  const despues = s.dep === "fuerza" ? "En la siguiente hora, 20-30 g de proteína (yogur griego, huevos, batido, leche…) y algo de hidratos." : dura ? "En los 30-60' siguientes: hidratos + 20-25 g de proteína (bocadillo, arroz con pollo, batido de leche con plátano) y bebe bien." : "Tu comida normal; bebe agua.";
  return `<div class="pp-sec"><h5>🍌 Comida y bebida</h5><ul><li><b>Antes:</b> ${antes}</li><li><b>Durante:</b> ${durante}</li><li><b>Después:</b> ${despues}</li></ul></div>`;
}

function reloj(s) {
  if (s.dep !== "run" || !s.tr) return "";
  const series = s.tr.some(t => t.n);
  return `<div class="pp-sec"><h5>⌚ En el reloj</h5><ul>${series ? "<li>Usa el botón de vuelta al empezar y acabar cada repetición (o crea el entreno en el reloj).</li>" : "<li>Vuelta automática cada km para ver el ritmo de cada uno.</li>"}<li>Pantalla con <b>ritmo de vuelta</b>, <b>pulso</b> y tiempo.</li><li>Al terminar, súbelo o regístralo con ✅ para que tu entrenador lo vea.</li></ul></div>`;
}

/** Bloques numerados a partir de s.tr */
function pasos(s) {
  const tr = s.tr || [];
  if (!tr.length) return "";
  const calidad = ["calidad", "test"].includes(s.tipo);
  const movimiento = `<p class="pp-x">Últimos 5': 2 × (20 m de skipping + 20 m de talones al glúteo + 20 m de zancada exagerada) y 3 progresivos de 80-100 m, de suave a casi rápido.</p>`;
  const items = tr.map((t, i) => {
    const ult = i === tr.length - 1, prim = i === 0;
    if (tr.length >= 3 && prim) return paso(t, t.k === "andar" ? "Calentamiento andando" : "Calentamiento", "🔥", calidad ? movimiento : "");
    if (tr.length >= 3 && ult) return paso(t, t.k === "andar" ? "Para terminar" : "Vuelta a la calma", "🧊", `<p class="pp-x">Después: 5-8' de estiramientos suaves de gemelo, sóleo, isquios, cuádriceps y glúteo (20-30'' cada uno, sin rebotes).</p>`);
    if (t.n) return paso(t, "Parte principal", "⚡", t.k === "cuesta" ? `<p class="pp-x">Sube con rodilla alta y brazos enérgicos; arriba, gira y baja trotando.</p>` : "");
    if (tr.length === 1) return paso(t, s.tipo === "largo" ? "Tirada continua" : "Carrera continua", "🏃", s.tipo === "largo" ? `<p class="pp-x">Divídela en tres: primer tercio suelto, segundo cómodo, último constante. Bebe cada 20'.</p>` : "");
    return paso(t, prim ? "Primera parte" : "Bloque final", prim ? "🏃" : "🚀", !prim && t.k !== "tirada" ? `<p class="pp-x">Cambia de ritmo de forma progresiva; si no lo mantienes, vuelve a ritmo cómodo.</p>` : "");
  });
  const km = tr.reduce((x, t) => x + (t.n ? kmDe(t) * t.n + (t.par ? kmDe(t.par) * t.n : 0) + (t.rec && t.rr ? t.rec * 60 / med(t.rr) * (t.n - 1) : 0) : kmDe(t)), 0);
  return { html: `<ol class="pasos">${items.join("")}</ol>`, km };
}

/** HTML del detalle completo. abierto: true para que salga desplegado. */
export function htmlDetalle(s, abierto = false) {
  if (!s || s.tipo === "manual" && !s.tr) return "";
  const T = TXT[clave(s)];
  const P = pasos(s);
  if (!T && !P) return "";
  const inten = ["calidad", "test", "competicion"].includes(s.tipo) ? "Alta" : s.tipo === "largo" ? "Media (por duración)" : s.dep === "fuerza" ? "Media" : "Baja";
  return `<details class="det-ses"${abierto ? " open" : ""}><summary>📋 Ver el entreno paso a paso</summary>
    <div class="det-tot"><span>⏱️ ${s.min}'</span>${P?.km ? `<span>📏 ~${fmtKm(P.km)}</span>` : ""}<span>🔥 Intensidad ${inten.toLowerCase()}</span></div>
    ${T ? `<div class="pp-sec pp-para"><h5>🎯 Para qué sirve</h5><p>${T.para}</p></div>` : ""}
    ${P ? P.html : ""}
    ${T?.claves ? `<div class="pp-sec"><h5>✅ Claves</h5><ul>${T.claves.map(c => `<li>${c}</li>`).join("")}</ul></div>` : ""}
    ${T?.planb ? `<div class="pp-sec pp-b"><h5>🔁 Si no vas bien</h5><p>${T.planb}</p></div>` : ""}
    ${comida(s)}
    ${reloj(s)}
  </details>`;
}
