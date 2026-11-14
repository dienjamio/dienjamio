/* Utilidades compartidas */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const r5 = x => Math.max(5, Math.round(x / 5) * 5);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtMin = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r}'` : `${h} h`) : `${r}'`; };
export const fmtRitmo = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
export const fmtHoras = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
export const parseTiempo = t => {
  if (!t) return 0;
  const p = String(t).trim().replace(",", ".").split(":").map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
};
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const uid = (n = 20) => {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map(x => abc[x % abc.length]).join("");
};

/* ---------- Fechas (siempre en hora local, formato AAAA-MM-DD) ---------- */
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_C = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const deIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const hoy = () => iso(new Date());
export const sumaDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const diaSemana = s => (deIso(s).getDay() + 6) % 7; // 0 = lunes
export const lunesDe = s => sumaDias(s, -diaSemana(s));
export const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);
export const fechaCorta = s => { const d = deIso(s); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
export const fechaLarga = s => { const d = deIso(s); return `${DIAS[diaSemana(s)].toLowerCase()} ${d.getDate()} de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][d.getMonth()]}`; };
export const rangoSemana = lunes => { const a = deIso(lunes), b = deIso(sumaDias(lunes, 6)); return a.getMonth() === b.getMonth() ? `${a.getDate()}-${b.getDate()} ${MESES[b.getMonth()]}` : `${a.getDate()} ${MESES[a.getMonth()]} - ${b.getDate()} ${MESES[b.getMonth()]}`; };

export function toast(t) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.append(el); }
  el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

/** Reduce una foto o captura (máx. 1100 px, JPEG) para guardarla ligera. Devuelve un dataURL. */
export async function comprimirImagen(file, max = 1100, calidad = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se puede leer la imagen")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let q = calidad, d = c.toDataURL("image/jpeg", q);
    while (d.length > 850000 && q > 0.3) { q -= 0.1; d = c.toDataURL("image/jpeg", q); }
    return d;
  } finally { URL.revokeObjectURL(url); }
}
