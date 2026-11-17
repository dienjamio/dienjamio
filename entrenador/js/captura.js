/* Lee una captura de Strava, Garmin, Polar… dentro del propio navegador (sin claves ni servidores):
   reconoce el texto de la imagen y saca distancia, tiempo, ritmo, pulso, desnivel y calorías. */
const BASE = new URL("../vendor/tesseract/", import.meta.url).href;
let cargando = null, worker = null;

function cargarLector() {
  if (!cargando) cargando = new Promise((ok, mal) => {
    if (window.Tesseract) return ok();
    const s = document.createElement("script");
    s.src = BASE + "tesseract.min.js"; s.onload = () => ok(); s.onerror = () => { cargando = null; mal(new Error("No se ha podido cargar el lector de capturas.")); };
    document.head.append(s);
  });
  return cargando;
}
async function lector() {
  await cargarLector();
  if (!worker) worker = await window.Tesseract.createWorker("spa", 1, { workerPath: BASE + "worker.min.js", corePath: BASE, langPath: BASE, gzip: true });
  return worker;
}

/** Imagen (File o dataURL) → lienzo ampliado: el texto grande se reconoce mejor. */
function aLienzo(origen) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(2.5, Math.max(1, 2000 / img.width));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      ok(c);
    };
    img.onerror = () => mal(new Error("No se ha podido abrir la imagen."));
    img.src = typeof origen === "string" ? origen : URL.createObjectURL(origen);
  });
}

const num = t => parseFloat(String(t).replace(/\./g, m => m).replace(",", "."));
const seg = t => { const p = t.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

/** Saca los datos del texto reconocido. Devuelve { km, dur, ritmo, fcMed, fcMax, sube, kcal, corregido } (lo que falte, null). */
export function datosDeTexto(texto) {
  const t = texto.replace(/[|]/g, " ").replace(/\s+/g, " ");
  const r = { km: null, dur: null, ritmo: null, fcMed: null, fcMax: null, sube: null, kcal: null, corregido: false };
  const ritmo = /(\d{1,2}:\d{2})\s*\/\s*km/i.exec(t); if (ritmo) r.ritmo = seg(ritmo[1]);
  const km = /(\d{1,3}(?:[.,]\d{1,2})?)\s*km\b(?!\s*\/)/i.exec(t.replace(/\/\s*km/gi, "/k_m")); if (km) r.km = num(km[1]);
  // tiempos: todos los h:mm:ss o mm:ss que no sean el ritmo; el primero suele ser el tiempo en movimiento
  const sinRitmo = t.replace(/\d{1,2}:\d{2}\s*\/\s*km/gi, " ");
  const tiempos = [...sinRitmo.matchAll(/\b(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2})\b/g)].map(m => seg(m[1])).filter(s => s >= 120);
  if (tiempos.length) r.dur = tiempos[0];
  const fc = [...t.matchAll(/(\d{2,3})\s*(?:ppm|bpm|lpm|p\/m)/gi)].map(m => +m[1]).filter(x => x >= 40 && x <= 230);
  if (fc.length) { r.fcMed = fc[0]; if (fc.length > 1) r.fcMax = Math.max(...fc); if (r.fcMax === r.fcMed) r.fcMax = null; }
  const kcal = /(\d{2,5})\s*(?:kcal|cal\b)/i.exec(t.replace(/(\d)\.(\d{3})/g, "$1$2")); if (kcal) r.kcal = +kcal[1];
  const sube = /(\d{1,5})\s*m\b(?!\s*in)/i.exec(t.replace(/\d+[.,]?\d*\s*km/gi, " ").replace(/(\d)\.(\d{3})/g, "$1$2")); if (sube) r.sube = +sube[1];
  // comprobación cruzada: distancia = tiempo ÷ ritmo (corrige cifras mal leídas)
  if (r.dur && r.ritmo) {
    const calc = r.dur / r.ritmo;
    if (!r.km || Math.abs(r.km - calc) / calc > 0.06) {
      // ¿sobra una cifra mal leída? (p. ej. «92,50» por «9,50»): se prueba quitando cada cifra
      const txt = km ? km[1] : "", cand = [...txt].map((_, i) => num(txt.slice(0, i) + txt.slice(i + 1))).filter(x => x > 0 && Math.abs(x - calc) / calc <= 0.03);
      r.km = cand.length ? cand.sort((a, b) => Math.abs(a - calc) - Math.abs(b - calc))[0] : Math.round(calc * 100) / 100; r.corregido = true;
    }
  } else if (r.km && r.ritmo && !r.dur) r.dur = Math.round(r.km * r.ritmo);
  return r;
}

/** Lee una captura y devuelve sus datos (y el texto reconocido). */
export async function leerCaptura(origen) {
  const w = await lector();
  const { data } = await w.recognize(await aLienzo(origen));
  return { ...datosDeTexto(data.text || ""), texto: data.text || "" };
}
