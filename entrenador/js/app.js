/* App del entrenador */
import { $, $$, esc, fmtMin, fmtRitmo, fmtHoras, toast, uid, DIAS, DIAS_C, hoy, lunesDe, sumaDias, rangoSemana, fechaCorta, diasEntre, parseTiempo } from "./util.js";
import { generarSemana, recalcular, calcZonas, sesionVacia, efectivo, OBJ, PRUEBAS, PRIORIDAD, DEP } from "./motor.js";
import { htmlCabSemana, htmlDia, htmlMenuDia, htmlZonas, htmlCarreraFicha } from "./vista.js";
import * as A from "./almacen.js";
import { leerArchivo, resumen, fusionar } from "./importar.js";

let atletas = [];
let actual = null;          // deportista abierto (con .semanas cargadas)
let editando = null;        // deportista en el formulario (null = nuevo)
let sub = "semana";
let lunesVista = lunesDe(hoy());
let archivos = [];

/* =========================================================
   Arranque
   ========================================================= */
async function init() {
  // Filas de disponibilidad y zonas propias
  $("#disp").innerHTML = DIAS.map((d, i) => `<div class="disp-f">
    <label class="chip dia-chip"><input type="checkbox" data-dia="${i}"> ${d}</label>
    <input type="text" class="max" data-max="${i}" placeholder="sin límite" inputmode="numeric" aria-label="Máximo el ${d.toLowerCase()}">
  </div>`).join("");
  $("#sel-descanso").innerHTML = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");
  $("#zp").innerHTML = [1, 2, 3, 4, 5].map(z => `<div class="zp-f"><span>Z${z}</span><input type="number" data-zlo="${z - 1}" placeholder="desde"><input type="number" data-zhi="${z - 1}" placeholder="hasta"></div>`).join("");
  $("#f-car").elements.prueba.innerHTML = Object.entries(PRUEBAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("#f-ses").elements.dia.innerHTML = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");

  enlazar();
  try {
    const r = await A.iniciar();
    pintarCuenta();
    if (r.modo === "nube" && !r.usuario) return pantallaEntrar();
    await cargarLista();
  } catch (e) {
    console.error(e);
    $("#lista").innerHTML = `<div class="panel vacio"><h2>No se ha podido conectar</h2><p>${esc(e.message)}</p><button class="btn pri" onclick="location.reload()">Reintentar</button></div>`;
  }
}

function pintarCuenta() {
  const c = $("#cuenta");
  if (!A.nube) { c.innerHTML = `<span class="estado-nube local" title="Los datos solo están en este navegador">● Solo en este navegador</span>`; return; }
  c.innerHTML = A.usuario
    ? `<span class="estado-nube ok">● ${esc(A.usuario.displayName || A.usuario.email)}</span> <button class="btn sec mini" id="btn-salir">Salir</button>`
    : "";
  $("#btn-salir")?.addEventListener("click", async () => { await A.salir(); location.reload(); });
}
function pantallaEntrar() {
  vista("lista");
  $("#pestanas").hidden = true;
  $("#lista").innerHTML = `<div class="panel vacio"><div class="big">🔐</div><h2>Entra con tu cuenta de Google</h2>
    <p>Tus deportistas se guardan en tu cuenta y así puedes abrirlos desde el móvil o el ordenador.</p>
    <button class="btn pri" id="btn-entrar">Entrar con Google</button></div>`;
  $("#btn-entrar").onclick = async () => {
    try { await A.entrar(); $("#pestanas").hidden = false; pintarCuenta(); await cargarLista(); }
    catch (e) { toast("No se ha podido entrar: " + (e.code || e.message)); }
  };
}

async function cargarLista() {
  atletas = await A.listar();
  if (!A.nube && !atletas.length) await migrarV1();
  if (A.nube && !atletas.length) await subirLocales();
  atletas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  $("#aviso-nube").hidden = A.nube;
  $("#aviso-nube").innerHTML = `⚠️ Todavía no está conectada a internet (Firebase): los deportistas se guardan solo en este navegador y <b>sus enlaces no funcionarán</b> hasta conectarla.`;
  pintarLista();
  const id = new URLSearchParams(location.search).get("a");
  if (id && atletas.some(x => x.id === id)) abrir(id);
}

/* Al conectar la nube: subir lo que se creó en este navegador */
async function subirLocales() {
  const loc = await A.datosLocales();
  if (!loc || !confirm(`En este navegador tienes ${loc.length} deportista${loc.length > 1 ? "s" : ""} creado${loc.length > 1 ? "s" : ""} antes de conectar la nube (${loc.map(x => x.ficha.nombre).join(", ")}). ¿Subirlos a tu cuenta?`)) return;
  for (const x of loc) {
    await A.guardarFicha(x.ficha);
    for (const s of Object.values(x.semanas)) await A.guardarSemana(x.ficha, s);
    for (const d of x.archivos) { try { await A.guardarArchivo(x.ficha, d); } catch (e) { toast(`${d.nombre}: ${e.message}`); } }
    atletas.push(x.ficha);
    try { x.ficha.semanas = x.semanas; await publicar(x.ficha); } catch (e) { }
  }
  A.olvidarLocales();
  toast("Deportistas subidos a tu cuenta");
}

/* Datos de la versión anterior (solo navegador) */
async function migrarV1() {
  let viejos = [];
  try { viejos = JSON.parse(localStorage.getItem("entrenador.atletas.v1")) || []; } catch (e) { }
  for (const v of viejos) {
    const a = nuevoAtleta({
      nombre: v.nombre, sexo: v.sexo, edad: v.edad, nivel: v.nivel, peso: v.peso, altura: v.altura,
      objetivo: v.objetivo === "perder_grasa" ? "bajar_peso" : v.objetivo, deportes: v.deportes,
      disp: DIAS.map((_, i) => ({ on: (v.dias || []).includes(i), max: 0 })), horas: v.horas, descanso: v.descanso,
      fc: { max: v.fcmax || "", rep: v.fcrep || "", umbral: "" }, marcas: { "5k": v.marca5k || "", "10k": v.marca10k || "" }, ftp: v.ftp || "",
      dieta: v.dieta, comidas: v.comidas, sinGluten: v.sinGluten, sinLactosa: v.sinLactosa, notas: v.notas || ""
    });
    await A.guardarFicha(a); atletas.push(a);
  }
}

/* =========================================================
   Navegación
   ========================================================= */
function vista(v) {
  $$(".vista").forEach(x => { x.hidden = x.id !== "v-" + v; });
  $$("#pestanas [data-vista]").forEach(b => b.setAttribute("aria-selected", b.dataset.vista === v));
  window.scrollTo({ top: 0 });
}

function pintarLista() {
  const el = $("#lista");
  if (!atletas.length) {
    el.innerHTML = `<div class="panel vacio"><div class="big">👋</div><h2>Todavía no tienes deportistas</h2><p>Crea el primero: sus datos, su disponibilidad y sus carreras. La app genera su semana de entrenos y su menú.</p><button class="btn pri" data-vista-ir="nuevo">＋ Nuevo deportista</button></div>`;
    return;
  }
  const h = hoy();
  el.innerHTML = `<div class="tarjetas">${atletas.map(a => {
    const prox = (a.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
    return `<button class="tarjeta" data-abrir="${a.id}">
      <span class="ini">${esc(a.nombre.trim().slice(0, 1).toUpperCase())}</span>
      <span class="tx"><b>${esc(a.nombre)}</b><span>${esc(OBJ[a.objetivo] || "")} · ${esc(a.nivel)}</span>
      ${prox ? `<span class="prox">🏁 ${esc(prox.nombre || PRUEBAS[prox.prueba])} · ${fechaCorta(prox.fecha)} (${diasEntre(h, prox.fecha)} días)</span>` : `<span class="prox muted">Sin carreras</span>`}</span>
      <span class="flecha">›</span>
    </button>`;
  }).join("")}</div>`;
}

/* =========================================================
   Formulario
   ========================================================= */
const DEF = () => ({
  nombre: "", sexo: "h", edad: 35, nivel: "intermedio", peso: 70, altura: 172, objetivo: "10k", lesionZona: "",
  deportes: { run: true, bike: false, swim: false, fuerza: true },
  disp: DIAS.map((_, i) => ({ on: i !== 2, max: i < 5 ? 75 : 150 })), horas: "", descanso: 2,
  fc: { max: "", rep: "", umbral: "", zonas: null }, marcas: { "5k": "", "10k": "", media: "", maraton: "" }, ftp: "", css: "",
  dieta: "omni", comidas: 5, sinGluten: false, sinLactosa: false, notas: "", mensaje: "", inicio: proximoLunes()
});
const proximoLunes = () => { const h = hoy(); return [5, 6].includes((new Date().getDay() + 6) % 7) ? sumaDias(lunesDe(h), 7) : lunesDe(h); };
const minTxt = m => !m ? "" : m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m / 60}:00`;
function leerMin(t) {
  t = String(t || "").trim().toLowerCase().replace(/\s/g, "");
  if (!t) return 0;
  let m = t.match(/^(\d+)[:h](\d{1,2})?'?$/); if (m) return +m[1] * 60 + (+m[2] || 0);
  m = t.match(/^(\d+)(min|'|m)?$/); if (m) return +m[1] <= 5 ? +m[1] * 60 : +m[1];
  return NaN;
}

function nuevoAtleta(datos) {
  return { ...DEF(), ...datos, id: uid(12), token: uid(24), seed: Math.floor(Math.random() * 1e9), creado: new Date().toISOString(), carreras: datos.carreras || [], actividades: [] };
}

function escribirForm(a) {
  const f = $("#form");
  const set = (n, v) => { f.elements[n].value = v ?? ""; };
  ["nombre", "telefono", "email", "sexo", "edad", "nivel", "peso", "altura", "objetivo", "lesionZona", "horas", "descanso", "ftp", "css", "dieta", "comidas", "notas", "mensaje", "inicio"].forEach(n => set(n, a[n]));
  set("fcmax", a.fc?.max); set("fcrep", a.fc?.rep); set("fcumbral", a.fc?.umbral);
  set("m5k", a.marcas?.["5k"]); set("m10k", a.marcas?.["10k"]); set("mmedia", a.marcas?.media); set("mmaraton", a.marcas?.maraton);
  ["run", "bike", "swim", "fuerza"].forEach(n => { f.elements[n].checked = !!a.deportes?.[n]; });
  f.elements.sinGluten.checked = !!a.sinGluten; f.elements.sinLactosa.checked = !!a.sinLactosa;
  (a.disp || []).forEach((d, i) => { $(`[data-dia="${i}"]`).checked = !!d.on; $(`[data-max="${i}"]`).value = minTxt(+d.max); });
  const zp = Array.isArray(a.fc?.zonas);
  $("#zonas-propias").checked = zp; $("#zp").hidden = !zp;
  [0, 1, 2, 3, 4].forEach(i => { $(`[data-zlo="${i}"]`).value = zp ? a.fc.zonas[i][0] : ""; $(`[data-zhi="${i}"]`).value = zp ? a.fc.zonas[i][1] : ""; });
  mostrarSegunObjetivo();
}
function mostrarSegunObjetivo() { const o = $("#form").elements.objetivo.value; $$("[data-si]").forEach(x => { x.hidden = x.dataset.si !== o; }); }

function leerForm() {
  const f = $("#form"), v = n => f.elements[n].value.trim(), num = n => { const x = parseFloat(v(n).replace(",", ".")); return isNaN(x) ? "" : x; };
  const disp = DIAS.map((_, i) => ({ on: $(`[data-dia="${i}"]`).checked, max: leerMin($(`[data-max="${i}"]`).value) }));
  const zonas = $("#zonas-propias").checked ? [0, 1, 2, 3, 4].map(i => [+$(`[data-zlo="${i}"]`).value, +$(`[data-zhi="${i}"]`).value]) : null;
  return {
    nombre: v("nombre"), telefono: v("telefono"), email: v("email"), sexo: v("sexo"), edad: num("edad"), nivel: v("nivel"), peso: num("peso"), altura: num("altura"),
    objetivo: v("objetivo"), lesionZona: v("lesionZona"),
    deportes: { run: f.elements.run.checked, bike: f.elements.bike.checked, swim: f.elements.swim.checked, fuerza: f.elements.fuerza.checked },
    inicio: v("inicio") ? lunesDe(v("inicio")) : proximoLunes(),
    disp, horas: num("horas"), descanso: +v("descanso"),
    fc: { max: num("fcmax"), rep: num("fcrep"), umbral: num("fcumbral"), zonas },
    marcas: { "5k": v("m5k"), "10k": v("m10k"), media: v("mmedia"), maraton: v("mmaraton") }, ftp: num("ftp"), css: v("css"),
    dieta: v("dieta"), comidas: +v("comidas"), sinGluten: f.elements.sinGluten.checked, sinLactosa: f.elements.sinLactosa.checked,
    notas: v("notas"), mensaje: v("mensaje")
  };
}

function validar(d) {
  if (!d.nombre) return "Falta el nombre.";
  if (!d.edad || !d.peso || !d.altura) return "Faltan edad, peso o altura (se usan para el menú).";
  if (!d.disp.some(x => x.on)) return "Marca al menos un día disponible.";
  if (d.disp.some(x => x.on && isNaN(x.max))) return "Hay un tiempo máximo que no entiendo: escríbelo como 1:15 o 75.";
  if (d.disp.some(x => x.on && x.max && x.max < 20)) return "Un día con menos de 20 minutos no da para un entreno: súbelo o desmárcalo.";
  for (const k of Object.keys(d.marcas)) if (d.marcas[k] && !parseTiempo(d.marcas[k])) return "Las marcas van como mm:ss o h:mm:ss (por ejemplo 45:30).";
  if (d.css && !parseTiempo(d.css)) return "El ritmo de natación va como m:ss (por ejemplo 1:45).";
  if (d.fc.zonas && d.fc.zonas.some(z => !(z[0] > 0 && z[1] > z[0]))) return "Revisa sus zonas propias: cada zona necesita un «desde» y un «hasta» mayor.";
  const RUN = ["5k", "10k", "media", "maraton", "lesion"];
  if (RUN.includes(d.objetivo)) d.deportes.run = true;
  if (d.objetivo === "ciclismo") d.deportes.bike = true;
  if (d.objetivo === "triatlon") d.deportes.run = d.deportes.bike = d.deportes.swim = true;
  if (d.objetivo === "musculo") d.deportes.fuerza = true;
  return "";
}

async function guardarForm(e) {
  e.preventDefault();
  const d = leerForm();
  const err = validar(d);
  if (err) return toast(err);
  const btn = $("#btn-guardar"); btn.disabled = true;
  try {
    if (!editando) {
      const a = nuevoAtleta(d);
      a.semanas = {};
      await A.guardarFicha(a);
      if (await guardarPendientes(a)) await A.guardarFicha(a);
      atletas.push(a);
      actual = a;
      await asegurarSemanas(a);
      toast(`${a.nombre} creado. Su plan ya está listo.`);
    } else {
      Object.assign(editando, d);
      await guardarPendientes(editando);
      await A.guardarFicha(editando);
      const r = await actualizarFuturas(editando);
      toast(r);
    }
    await publicar(actual);
    pintarLista();
    abrir(actual.id, true);
  } catch (err) { console.error(err); toast("No se ha podido guardar: " + err.message); }
  finally { btn.disabled = false; }
}

function formNuevo() {
  editando = null;
  escribirForm(DEF());
  $("#form-titulo").textContent = "Nuevo deportista";
  $("#btn-guardar").textContent = "Crear deportista y generar su plan";
  $("#btn-borrar").hidden = true;
  prepararSubidaForm();
  vista("nuevo");
}
function formEditar() {
  editando = actual;
  escribirForm(actual);
  $("#form-titulo").textContent = `Ficha de ${actual.nombre}`;
  $("#btn-guardar").textContent = "Guardar cambios";
  $("#btn-borrar").hidden = false;
  prepararSubidaForm();
  vista("nuevo");
  $$("#pestanas [data-vista]").forEach(b => b.setAttribute("aria-selected", b.dataset.vista === "atleta"));
}

/* =========================================================
   Semanas
   ========================================================= */
async function asegurarSemanas(a, desde = lunesDe(hoy()), n = 2) {
  for (let i = 0; i < n; i++) {
    const l = sumaDias(desde, 7 * i);
    if (!a.semanas[l]) { a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); }
  }
}
/** Rehace las semanas desde la actual que no tengan cambios a mano. */
async function actualizarFuturas(a) {
  const desde = lunesDe(hoy());
  let hechas = 0, manuales = 0;
  for (const l of Object.keys(a.semanas).filter(l => l >= desde)) {
    if (a.semanas[l].editada) { manuales++; continue; }
    a.semanas[l] = generarSemana(a, l); await A.guardarSemana(a, a.semanas[l]); hechas++;
  }
  await asegurarSemanas(a);
  return `Guardado. ${hechas ? `Plan actualizado (${hechas} semana${hechas > 1 ? "s" : ""}).` : ""}${manuales ? ` ${manuales} semana${manuales > 1 ? "s" : ""} con cambios a mano no se ha${manuales > 1 ? "n" : ""} tocado: usa «Rehacer semana» si quieres.` : ""}`;
}

/* =========================================================
   Publicación (enlace del deportista)
   ========================================================= */
const enlace = a => new URL(`ver.html?d=${a.token}`, location.href).href;
async function publicar(a) {
  if (!A.nube || !a) return;
  const desde = sumaDias(lunesDe(hoy()), -7);
  await asegurarSemanas(a);
  const semanas = {};
  Object.keys(a.semanas).filter(l => l >= desde && l <= sumaDias(desde, 35)).forEach(l => { semanas[l] = a.semanas[l]; });
  const Z = calcZonas(a);
  try {
    await A.publicar(a, {
      nombre: a.nombre, objetivo: OBJ[a.objetivo], mensaje: a.mensaje || "",
      carreras: (a.carreras || []).filter(c => c.fecha >= sumaDias(hoy(), -30)).map(({ id, nombre, fecha, prueba, prioridad, objetivo, lugar }) => ({ id, nombre, fecha, prueba, prioridad, objetivo: objetivo || "", lugar: lugar || "" })),
      zonas: { fc: Z.fc, ritmos: Z.ritmos, potencia: Z.potencia, nado: Z.nado, carrera: Z.carrera, metodo: Z.metodo },
      semanas
    });
  } catch (e) { console.error(e); toast("Guardado, pero no se ha podido actualizar su enlace: " + (e.code || e.message)); }
}

/* =========================================================
   Ficha del deportista
   ========================================================= */
async function abrir(id, mantener = false) {
  const a = atletas.find(x => x.id === id);
  if (!a) return;
  if (actual?.id !== id || !actual.semanas) { a.semanas = await A.cargarSemanas(a); archivos = []; }
  actual = a;
  if (!mantener) { sub = "semana"; lunesVista = lunesDe(hoy()); }
  await asegurarSemanas(a);
  const t = $("#tab-atleta"); t.hidden = false; t.textContent = "👤 " + a.nombre.split(" ")[0];
  history.replaceState(null, "", `?a=${a.id}`);
  vista("atleta");
  pintarAtleta();
}

function pintarAtleta() {
  const a = actual, h = hoy();
  const prox = (a.carreras || []).filter(c => c.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
  $("#atleta-cab").innerHTML = `
    <div class="ac-top">
      <div><h2>${esc(a.nombre)}</h2>
      <div class="sub">${esc(OBJ[a.objetivo])} · ${esc(a.nivel)} · ${a.edad} años · ${a.peso} kg</div>
      ${prox ? `<div class="sub">🏁 Próxima: <b>${esc(prox.nombre || PRUEBAS[prox.prueba])}</b> · ${fechaCorta(prox.fecha)} · faltan ${diasEntre(h, prox.fecha)} días</div>` : ""}</div>
      <button class="btn sec mini" data-acc="ficha">✎ Ficha</button>
    </div>
    <div class="enlace">
      <span class="lbl">Su enlace</span>
      <code>${A.nube ? esc(enlace(a)) : "Disponible al conectar Firebase"}</code>
      <div class="fila">
        <button class="btn pri mini" data-acc="copiar-enlace" ${A.nube ? "" : "disabled"}>🔗 Copiar enlace</button>
        <button class="btn sec mini" data-acc="compartir" ${A.nube ? "" : "disabled"}>${a.telefono ? "💬 Enviar por WhatsApp" : "📤 Enviar"}</button>
        <a class="btn sec mini" href="${A.nube ? esc(enlace(a)) : "#"}" target="_blank" rel="noopener" ${A.nube ? "" : 'aria-disabled="true"'}>👁️ Ver como él</a>
      </div>
    </div>`;
  $$("#subtabs [data-sub]").forEach(b => b.setAttribute("aria-selected", b.dataset.sub === sub));
  const conSemana = sub === "semana" || sub === "menu";
  $("#weeknav").hidden = !conSemana;
  if (conSemana) {
    const snap = a.semanas[lunesVista];
    $("#weeknav").innerHTML = `
      <button class="icon-btn" data-acc="sem-ant" aria-label="Semana anterior">‹</button>
      <div class="c"><b>${rangoSemana(lunesVista)}</b><span>${lunesVista === lunesDe(h) ? "Esta semana" : lunesVista > lunesDe(h) ? `Dentro de ${diasEntre(lunesDe(h), lunesVista) / 7} sem.` : "Pasada"}${snap?.editada ? " · con cambios a mano" : ""}</span></div>
      <button class="icon-btn" data-acc="sem-sig" aria-label="Semana siguiente">›</button>
      <div class="wn-acc">
        <button class="btn sec mini" data-acc="hoy">Hoy</button>
        <button class="btn sec mini" data-acc="rehacer">↻ Rehacer semana</button>
        <button class="btn sec mini" data-acc="imprimir">🖨️ PDF</button>
      </div>`;
  }
  const el = $("#sub");
  if (sub === "semana" || sub === "menu") {
    const snap = a.semanas[lunesVista];
    if (!snap) { el.innerHTML = `<div class="panel vacio"><p>Esta semana no tiene plan.</p><button class="btn pri" data-acc="generar">Generar esta semana</button></div>`; return; }
    el.innerHTML = sub === "semana"
      ? htmlCabSemana(snap) + snap.dias.map((_, i) => htmlDia(snap, i, true)).join("")
      : snap.dias.map((_, i) => htmlMenuDia(snap, i, true)).join("") + `<p class="aviso">Menú orientativo calculado según la carga de cada día. No sustituye a un dietista-nutricionista.</p>`;
  } else if (sub === "carreras") pintarCarreras();
  else if (sub === "datos") pintarDatos();
  else if (sub === "zonas") el.innerHTML = `<article class="dia zonas">${htmlZonas(calcZonas(a))}</article>`;
}

/* ---------------- Carreras ---------------- */
function pintarCarreras() {
  const cs = (actual.carreras || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
  const fut = cs.filter(c => c.fecha >= hoy()), pas = cs.filter(c => c.fecha < hoy()).reverse();
  $("#sub").innerHTML = `<article class="dia">
    <div class="dia-cab"><h3>Carreras</h3><button class="btn pri mini" data-acc="nueva-carrera">＋ Añadir carrera</button></div>
    <p class="ayuda">Al guardar una carrera, las semanas que no has cambiado a mano se rehacen solas: fases hacia la carrera A, puesta a punto y ajustes alrededor de las B y C.</p>
    ${fut.length ? fut.map(c => htmlCarreraFicha(c, true)).join("") : `<p class="muted">Sin carreras próximas.</p>`}
    ${pas.length ? `<h4 class="sep">Pasadas</h4>${pas.map(c => htmlCarreraFicha(c, true)).join("")}` : ""}
  </article>`;
}
let carEdit = null;
function abrirCarrera(id) {
  carEdit = id ? actual.carreras.find(c => c.id === id) : null;
  const f = $("#f-car");
  f.reset();
  const c = carEdit || { prueba: ["5k", "10k", "media", "maraton", "ciclismo", "triatlon"].includes(actual.objetivo) ? actual.objetivo : "10k", prioridad: (actual.carreras || []).some(x => x.prioridad === "A" && x.fecha >= hoy()) ? "B" : "A" };
  for (const k of ["nombre", "fecha", "prueba", "prioridad", "objetivo", "lugar"]) f.elements[k].value = c[k] || "";
  $("#car-borrar").hidden = !carEdit;
  $("#dlg-car").returnValue = "";
  $("#dlg-car").showModal();
}
async function cerrarCarrera(accion) {
  const f = $("#f-car");
  if (!["guardar", "borrar"].includes(accion)) return;
  if (accion === "borrar") { if (!confirm("¿Borrar esta carrera?")) return; actual.carreras = actual.carreras.filter(c => c !== carEdit); }
  else {
    const d = Object.fromEntries(["nombre", "fecha", "prueba", "prioridad", "objetivo", "lugar"].map(k => [k, f.elements[k].value.trim()]));
    if (!d.nombre || !d.fecha) return toast("La carrera necesita nombre y fecha.");
    if (carEdit) Object.assign(carEdit, d); else (actual.carreras = actual.carreras || []).push({ id: uid(8), ...d });
  }
  await A.guardarFicha(actual);
  const r = await actualizarFuturas(actual);
  await publicar(actual);
  toast(r);
  pintarAtleta();
}

/* ---------------- Datos importados ---------------- */
const PERIODOS = { 3: "3 meses", 6: "6 meses", 12: "1 año" };
let periodo = 6;
const desdePeriodo = () => sumaDias(hoy(), -Math.round(periodo * 30.5));
const AYUDA = `<details class="como"><summary>¿Cómo consigue el deportista ese ZIP?</summary>
  <p>Lo pide él desde su cuenta (le lleva 2 minutos) y te lo manda por WhatsApp o correo. Tú lo subes aquí <b>sin descomprimir</b>. Nadie tiene que darte su contraseña.</p>
  <ul>
    <li><b>Garmin</b>: en un ordenador, entra en garmin.com con su cuenta → «Gestión de datos» → «Exportar tus datos» → «Solicitar exportación». Le llega un correo con el ZIP (puede tardar de unas horas a varios días). Si corre prisa: Garmin Connect web → Actividades → «Exportar CSV» (solo el resumen de cada actividad).</li>
    <li><b>Strava</b>: strava.com → Ajustes → Mi cuenta → «Descargar o eliminar tu cuenta» → «Solicitar tu archivo». Le llega un ZIP por correo, normalmente en unas horas.</li>
    <li><b>Polar</b>: account.polar.com → «Descargar tus datos». Le llega un ZIP por correo.</li>
    <li><b>Coros, Suunto, Wahoo…</b>: en cada actividad, «Exportar» o «Compartir» como .FIT o .GPX.</li>
  </ul></details>`;
function htmlSubida(id) {
  return `<label class="soltar" id="soltar-${id}">
      <input type="file" id="f-${id}" multiple accept=".zip,.fit,.gpx,.tcx,.csv,.json,.gz,.pdf,image/*">
      <b>📂 Sube su historial</b>
      <span>El <b>ZIP</b> con sus datos de Garmin, Strava o Polar (tal cual llega), actividades sueltas .FIT, .GPX o .TCX, la lista .CSV de actividades, e informes en PDF o foto.</span>
    </label>
    <div class="periodo"><span>Usar los últimos</span>${Object.entries(PERIODOS).map(([k, v]) => `<label class="chip"><input type="radio" name="periodo-${id}" value="${k}" ${+k === periodo ? "checked" : ""}> ${v}</label>`).join("")}</div>
    ${AYUDA}`;
}
function enlazarSubida(id, fn) {
  const zona = $(`#soltar-${id}`);
  zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("sobre"); fn([...e.dataTransfer.files]); });
  $(`#f-${id}`).addEventListener("change", e => { fn([...e.target.files]); e.target.value = ""; });
  $$(`[name="periodo-${id}"]`).forEach(r => r.addEventListener("change", () => { periodo = +r.value; }));
}
const esDoc = f => /\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name) || f.type.startsWith("image/") || f.type === "application/pdf";
async function procesarArchivos(files, avisar) {
  const desde = desdePeriodo(), acts = [], docs = [], errores = [];
  for (const f of files) {
    try {
      avisar(`Leyendo ${f.name}…`);
      if (esDoc(f)) {
        const lim = A.nube ? 700 * 1024 : 10 * 1024 * 1024;
        if (f.size > lim) throw new Error(`pesa ${Math.round(f.size / 1024)} KB; el máximo es ${Math.round(lim / 1024)} KB (prueba a comprimirlo)`);
        const datos = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
        docs.push({ id: uid(10), nombre: f.name, tipo: f.type || "application/pdf", tam: f.size, fecha: hoy(), datos });
      } else acts.push(...await leerArchivo(f, { desde, progreso: t => avisar(`${f.name}: ${t}`) }));
    } catch (e) { errores.push(`${f.name}: ${e.message}`); }
  }
  return { acts, docs, errores };
}
const coma = x => String(x).replace(".", ",");
function htmlResumenCorto(H) {
  const p = [`${coma(H.horasMedia)} h/semana`];
  if (H.kmRun) p.push(`${H.kmRun} km/semana corriendo`);
  if (H.largoRun) p.push(`tirada más larga ${H.largoRun}'`);
  if (H.fcMaxObs) p.push(`FC máx ${H.fcMaxObs}`);
  if (H.lthr) p.push(`umbral ~${H.lthr} ppm`);
  for (const [k, n] of [["5k", "5 km"], ["10k", "10 km"], ["media", "media"], ["maraton", "maratón"]]) if (H.mejores[k]) p.push(`${n} ${fmtHoras(H.mejores[k].s)}`);
  if (H.ftpEst) p.push(`FTP ~${H.ftpEst} W`);
  return p.join(" · ");
}

async function pintarDatos() {
  const a = actual;
  if (!archivos.length) { try { archivos = await A.listarArchivos(a); } catch (e) { archivos = []; } }
  const acts = (a.actividades || []).slice().sort((x, y) => y.fecha.localeCompare(x.fecha));
  const H = a.hist, ef = efectivo(a), Z = calcZonas(a);
  const usa = [], sug = [];
  if (H) {
    if (+a.horas > 0) usa.push(`Volumen fijado a mano en la ficha: <b>${coma(a.horas)} h/semana</b>. Bórralo de la ficha si prefieres que lo marquen sus datos.`);
    else if (H.horasMedia) usa.push(`<b>Volumen</b>: arranca en ${coma(Math.round(H.horasMedia * 11) / 10)} h/semana (+10 % sobre lo que hace) y sube un 5 % cada semana, sin pasar de su disponibilidad.`);
    if (H.largoRun) usa.push(`<b>Tirada larga</b>: parte de ${H.largoRun}' (la más larga de sus últimas 6 semanas) y crece unos 5' por semana.`);
    if (ef._de?.fcmax) usa.push(`<b>FC máxima</b>: ${H.fcMaxObs} ppm, la más alta registrada. Si nunca ha apretado a tope, la real será mayor: si la conoces, escríbela en la ficha.`);
    if (ef._de?.umbral) usa.push(`<b>FC de umbral</b>: ~${H.lthr} ppm, estimada con su mejor esfuerzo de 20' corriendo. Sus zonas salen de aquí.`);
    for (const [k, n] of [["5k", "5 km"], ["10k", "10 km"], ["media", "media maratón"], ["maraton", "maratón"]]) if (ef._de?.["m" + k]) usa.push(`<b>Marca de ${n}</b>: ${fmtHoras(H.mejores[k].s)} (${fechaCorta(H.mejores[k].fecha)}). De aquí salen sus ritmos.`);
    if (ef._de?.ftp) usa.push(`<b>FTP</b>: ~${H.ftpEst} W (95 % de su mejor 20').`);
    // Diferencias con lo escrito en la ficha
    if (H.fcMaxObs && +a.fc?.max && H.fcMaxObs > +a.fc.max) sug.push({ k: "fcmax", v: H.fcMaxObs, t: `En sus datos aparece una FC máx de <b>${H.fcMaxObs}</b> y la ficha dice ${a.fc.max}.` });
    for (const k of ["5k", "10k", "media", "maraton"]) if (H.mejores[k] && a.marcas?.[k] && H.mejores[k].s < parseTiempo(a.marcas[k])) sug.push({ k: "marca", d: k, v: fmtHoras(H.mejores[k].s), t: `Ha hecho <b>${fmtHoras(H.mejores[k].s)}</b> en ${k === "media" ? "media maratón" : k === "maraton" ? "maratón" : k.replace("k", " km")} y la ficha dice ${a.marcas[k]}.` });
    if (H.ftpEst && +a.ftp && Math.abs(H.ftpEst - a.ftp) > 8) sug.push({ k: "ftp", v: H.ftpEst, t: `Su FTP estimado es <b>${H.ftpEst} W</b> y la ficha dice ${a.ftp} W.` });
  }
  let intensidad = "";
  if (H?.suave) {
    const z = Z.fc.findIndex(r => H.suave.fc <= r[1]) + 1 || 5;
    intensidad = z <= 2
      ? `<p class="ok-msg">✅ Sus rodajes suaves (~${fmtRitmo(H.suave.ritmo)} /km a ${H.suave.fc} ppm) van en Z${z}: bien hechos.</p>`
      : `<p class="alerta">⚠️ Sus rodajes «suaves» van a ${H.suave.fc} ppm (~${fmtRitmo(H.suave.ritmo)} /km): eso es <b>Z${z}</b>, demasiado rápido. El plan se los pone en Z2 (${Z.fc[1][0]}-${Z.fc[1][1]} ppm), aunque tenga que ir más despacio.</p>`;
  }
  const maxH = H ? Math.max(1, ...H.semanas.map(s => s.horas)) : 1;
  $("#sub").innerHTML = `
  <article class="dia">
    <div class="dia-cab"><h3>Historial de entrenos</h3>${acts.length ? `<span class="muted small">${acts.length} actividades</span>` : ""}</div>
    ${htmlSubida("datos")}
    <div id="import-msg"></div>
  </article>
  ${H ? `<article class="dia">
    <div class="dia-cab"><h3>Cómo entrena ahora</h3><span class="muted small">últimas 4 semanas</span></div>
    <div class="kpis">
      <div class="kpi"><b>${coma(H.horasMedia)} h</b><span>por semana</span></div>
      <div class="kpi"><b>${H.kmRun || 0} km</b><span>corriendo/semana</span></div>
      <div class="kpi"><b>${coma(H.sesiones)}</b><span>sesiones/semana</span></div>
      <div class="kpi"><b>${H.largoRun ? H.largoRun + "'" : "—"}</b><span>tirada más larga</span></div>
    </div>
    ${intensidad}
    <h4 class="sep">Horas por semana</h4>
    <div class="vol">${H.semanas.map(s => `<div class="vol-c" title="${rangoSemana(s.lunes)}: ${s.horas} h"><i style="height:${s.horas / maxH * 100}%"></i><b>${coma(s.horas)}</b><span>${fechaCorta(s.lunes)}</span></div>`).join("")}</div>
  </article>
  <article class="dia">
    <div class="dia-cab"><h3>Lo que el plan saca de sus datos</h3></div>
    ${usa.length ? `<ul class="usa">${usa.map(x => `<li>${x}</li>`).join("")}</ul>` : `<p class="muted">La ficha ya tiene todos los valores escritos a mano; el plan usa los de la ficha.</p>`}
    ${sug.length ? `<h4 class="sep">No coincide con la ficha</h4><ul class="sugs">${sug.map((s, i) => `<li><span>${s.t}</span><button class="btn sec mini" data-acc="aplicar" data-i="${i}">Usar dato</button></li>`).join("")}</ul>` : ""}
    <small>Lo que escribas en la ficha manda sobre los datos. Deja un campo vacío para que lo calculen sus actividades.</small>
  </article>
  <article class="dia">
    <div class="dia-cab"><h3>Actividades</h3></div>
    <div class="wrap"><table class="acts"><tr><th>Fecha</th><th></th><th>Km</th><th>Tiempo</th><th>Ritmo</th><th>FC med/máx</th><th></th></tr>
    ${acts.slice(0, 60).map(x => `<tr><td>${fechaCorta(x.fecha)}</td><td>${DEP[x.dep]?.i || "•"}</td><td>${x.km ? coma(x.km) : "—"}</td><td>${x.dur ? fmtHoras(x.dur) : "—"}</td><td>${x.dep === "run" && x.km ? fmtRitmo(x.dur / x.km) : x.dep === "bike" && x.km ? coma(Math.round(x.km / x.dur * 36000) / 10) + " km/h" : "—"}</td><td>${x.fcMed || "—"}/${x.fcMax || "—"}</td><td><button class="quita" data-acc="quitar-act" data-id="${esc(x.id)}" aria-label="Quitar">✕</button></td></tr>`).join("")}
    </table></div>${acts.length > 60 ? `<small>Mostrando las 60 más recientes.</small>` : ""}
  </article>` : ""}
  <article class="dia">
    <div class="dia-cab"><h3>Informes y documentos</h3></div>
    ${archivos.length ? `<ul class="docs">${archivos.sort((x, y) => y.fecha.localeCompare(x.fecha)).map(x => `<li><span>${x.tipo.includes("pdf") ? "📄" : "🖼️"} <b>${esc(x.nombre)}</b> <span class="muted small">${fechaCorta(x.fecha)} · ${Math.max(1, Math.round(x.tam / 1024))} KB</span></span>
      <span class="fila"><button class="btn sec mini" data-acc="ver-doc" data-id="${x.id}">Abrir</button><button class="quita" data-acc="quitar-doc" data-id="${x.id}" aria-label="Borrar">✕</button></span></li>`).join("")}</ul>`
      : `<p class="muted">Pruebas de esfuerzo, analíticas, informes del fisio… Súbelos arriba y quedan guardados en su ficha.</p>`}
  </article>`;
  pintarDatos.sug = sug;
  enlazarSubida("datos", importar);
}

/** Añade actividades al deportista y recalcula lo que se deduce de ellas. */
function anadirActividades(a, nuevas) {
  const { lista, anadidas } = fusionar(a.actividades || [], nuevas);
  a.actividades = lista.slice(0, 1500);
  a.hist = a.actividades.length ? resumen(a.actividades) : null;
  return anadidas;
}

async function importar(files) {
  const msg = $("#import-msg");
  const a = actual;
  const r = await procesarArchivos(files, t => { msg.innerHTML = `<p class="cargando">⏳ ${esc(t)}</p>`; });
  for (const d of r.docs) { try { await A.guardarArchivo(a, d); } catch (e) { r.errores.push(`${d.nombre}: ${e.message}`); } }
  const nuevas = anadirActividades(a, r.acts);
  let rehecho = "";
  try {
    await A.guardarFicha(a);
    if (nuevas) { await actualizarFuturas(a); rehecho = " El plan de las próximas semanas se ha rehecho con sus datos."; }
    await publicar(a);
  } catch (e) { r.errores.push("No se ha podido guardar: " + e.message); }
  archivos = [];
  await pintarDatos();
  $("#import-msg").innerHTML = `<p class="ok-msg">✅ ${nuevas} actividad${nuevas === 1 ? "" : "es"} nueva${nuevas === 1 ? "" : "s"}${r.acts.length !== nuevas ? ` (${r.acts.length - nuevas} ya estaban)` : ""}${r.docs.length ? ` y ${r.docs.length} documento${r.docs.length > 1 ? "s" : ""}` : ""}.${rehecho}</p>${r.errores.length ? `<ul class="errores">${r.errores.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
}

async function aplicarSug(lista) {
  const a = actual;
  for (const s of lista) {
    if (s.k === "fcmax") a.fc = { ...a.fc, max: s.v };
    if (s.k === "marca") a.marcas = { ...a.marcas, [s.d]: s.v };
    if (s.k === "ftp") a.ftp = s.v;
  }
  await A.guardarFicha(a);
  const r = await actualizarFuturas(a);
  await publicar(a);
  toast(r);
  pintarAtleta();
}

/* ---------------- Historial en el formulario ---------------- */
let pendientes = { acts: [], docs: [] };
function prepararSubidaForm() {
  pendientes = { acts: [], docs: [] };
  $("#subida-form").innerHTML = htmlSubida("form");
  $("#form-hist-msg").innerHTML = editando?.hist ? `<p class="muted small">Ya tiene ${editando.actividades.length} actividades: ${htmlResumenCorto(editando.hist)}</p>` : "";
  enlazarSubida("form", async files => {
    const msg = $("#form-hist-msg");
    const r = await procesarArchivos(files, t => { msg.innerHTML = `<p class="cargando">⏳ ${esc(t)}</p>`; });
    pendientes.acts.push(...r.acts); pendientes.docs.push(...r.docs);
    const { lista } = fusionar(editando?.actividades || [], pendientes.acts);
    const H = lista.length ? resumen(lista) : null;
    msg.innerHTML = `${H ? `<p class="ok-msg">✅ ${lista.length} actividades leídas</p><p class="small">${htmlResumenCorto(H)}</p><p class="muted small">Se usarán al guardar para los campos que dejes vacíos (pulso, marcas, FTP, horas).</p>` : ""}
      ${pendientes.docs.length ? `<p class="small">📄 ${pendientes.docs.length} documento${pendientes.docs.length > 1 ? "s" : ""} listo${pendientes.docs.length > 1 ? "s" : ""} para guardar.</p>` : ""}
      ${r.errores.length ? `<ul class="errores">${r.errores.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
  });
}
async function guardarPendientes(a) {
  if (pendientes.acts.length) anadirActividades(a, pendientes.acts);
  for (const d of pendientes.docs) { try { await A.guardarArchivo(a, d); } catch (e) { toast(`${d.nombre}: ${e.message}`); } }
  const habia = pendientes.acts.length > 0;
  pendientes = { acts: [], docs: [] };
  archivos = [];
  return habia;
}

/* ---------------- Editor de sesión ---------------- */
let sesEdit = null; // { dia, id }
function abrirSesion(dia, id) {
  const snap = actual.semanas[lunesVista];
  const s = id ? snap.dias[dia].ses.find(x => x.id === id) : sesionVacia();
  sesEdit = { dia, id: id || null, nueva: !id, s };
  const f = $("#f-ses");
  f.elements.dia.value = dia; f.elements.dep.value = ["run", "bike", "swim", "fuerza", "movilidad"].includes(s.dep) ? s.dep : "run";
  f.elements.t.value = s.t; f.elements.min.value = s.min; f.elements.z.value = s.z || "";
  f.elements.p.value = (s.p || []).join("\n"); f.elements.n.value = s.n || "";
  f.elements.ej.value = (s.ej || []).map(e => `${e.n} | ${e.s}`).join("\n");
  $("#ses-borrar").hidden = !id;
  $("#dlg-ses").querySelector("h3").textContent = id ? "Cambiar sesión" : `Nueva sesión · ${DIAS[dia]}`;
  $("#dlg-ses").returnValue = "";
  $("#dlg-ses").showModal();
}
async function cerrarSesion(accion) {
  if (!["guardar", "borrar"].includes(accion) || !sesEdit) return;
  const snap = actual.semanas[lunesVista];
  const { dia, id } = sesEdit;
  const f = $("#f-ses");
  const lista = snap.dias[dia].ses;
  const i = id ? lista.findIndex(x => x.id === id) : -1;
  if (accion === "borrar") { if (i >= 0) lista.splice(i, 1); }
  else {
    const min = parseInt(f.elements.min.value, 10);
    if (!f.elements.t.value.trim() || !(min > 0)) return toast("La sesión necesita título y duración.");
    const s = { ...sesEdit.s, dep: f.elements.dep.value, t: f.elements.t.value.trim(), min, z: f.elements.z.value.trim(),
      p: f.elements.p.value.split("\n").map(x => x.trim()).filter(Boolean), n: f.elements.n.value.trim(),
      ej: f.elements.ej.value.split("\n").map(x => x.trim()).filter(Boolean).map(x => { const [n, s_] = x.split("|"); return { n: n.trim(), s: (s_ || "").trim() }; }),
      editada: true };
    if (!s.ej.length) s.ej = null;
    if (s.tipo === "manual") s.tipo = s.dep === "fuerza" ? "fuerza" : s.min >= 90 ? "largo" : "suave";
    const nuevoDia = +f.elements.dia.value;
    if (i >= 0) lista.splice(i, 1);
    snap.dias[nuevoDia].ses.push(s);
    snap.dias[nuevoDia].ses.sort((x, y) => (x.dep === "fuerza") - (y.dep === "fuerza"));
  }
  snap.editada = true;
  recalcular(actual, snap);
  await A.guardarSemana(actual, snap);
  await publicar(actual);
  toast("Sesión guardada");
  pintarAtleta();
}

/* =========================================================
   Eventos
   ========================================================= */
function enlazar() {
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-vista],[data-vista-ir],[data-abrir],[data-sub],[data-acc]");
    if (!t) return;
    if (t.dataset.vista || t.dataset.vistaIr) {
      const v = t.dataset.vista || t.dataset.vistaIr;
      if (v === "nuevo") return formNuevo();
      if (v === "atleta") { vista("atleta"); return pintarAtleta(); }
      history.replaceState(null, "", location.pathname);
      return vista(v);
    }
    if (t.dataset.abrir) return abrir(t.dataset.abrir);
    if (t.dataset.sub) { sub = t.dataset.sub; return pintarAtleta(); }
    const acc = t.dataset.acc, a = actual;
    if (acc === "ficha") return formEditar();
    if (acc === "sem-ant" || acc === "sem-sig") { lunesVista = sumaDias(lunesVista, acc === "sem-ant" ? -7 : 7); if (lunesVista >= lunesDe(hoy()) && !a.semanas[lunesVista]) { a.semanas[lunesVista] = generarSemana(a, lunesVista); await A.guardarSemana(a, a.semanas[lunesVista]); await publicar(a); } return pintarAtleta(); }
    if (acc === "hoy") { lunesVista = lunesDe(hoy()); return pintarAtleta(); }
    if (acc === "generar" || acc === "rehacer") {
      if (acc === "rehacer" && a.semanas[lunesVista]?.editada && !confirm("Esta semana tiene cambios a mano. ¿Rehacerla desde cero?")) return;
      a.semanas[lunesVista] = generarSemana(a, lunesVista);
      await A.guardarSemana(a, a.semanas[lunesVista]); await publicar(a);
      toast("Semana generada"); return pintarAtleta();
    }
    if (acc === "imprimir") return window.print();
    if (acc === "editar-ses") { const snap = a.semanas[lunesVista]; const dia = snap.dias.findIndex(d => d.ses.some(s => s.id === t.dataset.id)); return abrirSesion(dia, t.dataset.id); }
    if (acc === "add-ses") return abrirSesion(+t.dataset.dia, null);
    if (acc === "otro-menu") {
      const snap = a.semanas[lunesVista], i = +t.dataset.dia;
      snap.dias[i].menuVar = (snap.dias[i].menuVar || 0) + 1;
      recalcular(a, snap, i); await A.guardarSemana(a, snap); await publicar(a); return pintarAtleta();
    }
    if (acc === "nueva-carrera") return abrirCarrera(null);
    if (acc === "editar-carrera") return abrirCarrera(t.dataset.id);
    if (acc === "copiar-enlace") { try { await navigator.clipboard.writeText(enlace(a)); toast("Enlace copiado. Mándaselo una vez: siempre verá lo último."); } catch (e) { prompt("Copia el enlace:", enlace(a)); } return; }
    if (acc === "compartir" && a.telefono) {
      let tel = a.telefono.replace(/\D/g, ""); if (tel.length === 9) tel = "34" + tel;
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${a.nombre.split(" ")[0]}, aquí tienes tus entrenos y tu menú. Guárdalo: se actualiza solo.\n${enlace(a)}`)}`, "_blank");
      return;
    }
    if (acc === "compartir") {
      if (navigator.share) { try { await navigator.share({ title: `Plan de ${a.nombre}`, text: `Hola ${a.nombre.split(" ")[0]}, aquí tienes tus entrenos y tu menú. Guárdalo: se actualiza solo.`, url: enlace(a) }); } catch (e) { } }
      else { await navigator.clipboard.writeText(enlace(a)).catch(() => {}); toast("Enlace copiado"); }
      return;
    }
    if (acc === "aplicar") return aplicarSug([pintarDatos.sug[+t.dataset.i]]);
    if (acc === "quitar-act") { a.actividades = a.actividades.filter(x => x.id !== t.dataset.id); a.hist = a.actividades.length ? resumen(a.actividades) : null; await A.guardarFicha(a); return pintarDatos(); }
    if (acc === "ver-doc") {
      const d = await A.leerArchivoGuardado(a, t.dataset.id);
      if (!d) return toast("No encuentro el archivo");
      const w = window.open();
      if (w) w.document.write(d.tipo.includes("pdf") ? `<title>${esc(d.nombre)}</title><iframe src="${d.datos}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>` : `<title>${esc(d.nombre)}</title><img src="${d.datos}" style="max-width:100%">`);
      return;
    }
    if (acc === "quitar-doc") { if (!confirm("¿Borrar este documento?")) return; await A.borrarArchivo(a, t.dataset.id); archivos = []; return pintarDatos(); }
  });

  $("#form").addEventListener("submit", guardarForm);
  $("#form").elements.objetivo.addEventListener("change", mostrarSegunObjetivo);
  $("#zonas-propias").addEventListener("change", e => { $("#zp").hidden = !e.target.checked; });
  $("#r-aplicar").addEventListener("click", () => {
    const lv = leerMin($("#r-lv").value), sd = leerMin($("#r-sd").value);
    if (isNaN(lv) || isNaN(sd)) return toast("Escribe el tiempo como 1:15 o 75");
    DIAS.forEach((_, i) => { const v = i < 5 ? lv : sd; if (v || $(`#r-${i < 5 ? "lv" : "sd"}`).value.trim()) $(`[data-max="${i}"]`).value = minTxt(v); });
  });
  $("#btn-borrar").addEventListener("click", async () => {
    if (!editando || !confirm(`¿Borrar a ${editando.nombre} y todo su plan? Su enlace dejará de funcionar.`)) return;
    await A.borrar(editando);
    atletas = atletas.filter(x => x !== editando); actual = null; editando = null;
    $("#tab-atleta").hidden = true; history.replaceState(null, "", location.pathname);
    pintarLista(); vista("lista"); toast("Deportista borrado");
  });
  $("#dlg-ses").addEventListener("close", () => cerrarSesion($("#dlg-ses").returnValue));
  $("#dlg-car").addEventListener("close", () => cerrarCarrera($("#dlg-car").returnValue));
}

document.addEventListener("DOMContentLoaded", init);
