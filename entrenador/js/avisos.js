/* Avisos al móvil con ntfy (https://ntfy.sh): gratis, sin cuenta ni servidor propio.
   Cada persona instala la app ntfy y se suscribe a su «canal» secreto (un nombre largo y aleatorio).
   La app publica en ese canal con una petición web y ntfy hace llegar la notificación al móvil. */
import { esc } from "./util.js?v=202611170543";

export const NTFY = "https://ntfy.sh";
const LETRAS = "abcdefghijkmnpqrstuvwxyz23456789";
export const nuevoCanal = pref => pref + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => LETRAS[b % 32]).join("");

/**
 * Envía un aviso. en: Date (o ms) para programarlo (hasta 3 días). Devuelve true si ntfy lo ha aceptado.
 * prioridad: 1 mínima … 3 normal … 5 urgente.
 */
export async function avisar(canal, { titulo, texto, click = "", tags = [], prioridad = 3, en = null }) {
  if (!canal) return false;
  const cuerpo = { topic: canal, title: titulo, message: texto, tags, priority: prioridad };
  if (click) cuerpo.click = click;
  if (en) cuerpo.delay = String(Math.floor(+en / 1000));
  try {
    const r = await fetch(NTFY + "/", { method: "POST", body: JSON.stringify(cuerpo) });
    return r.ok;
  } catch (e) { return false; }
}

const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const esAndroid = () => /Android/i.test(navigator.userAgent);
export const tiendaNtfy = () => esIOS() ? "https://apps.apple.com/app/ntfy/id1625396347" : "https://play.google.com/store/apps/details?id=io.heckel.ntfy";

/** Bloque con los pasos para suscribirse a un canal. */
export function htmlSuscribir(canal, quien = "tú") {
  return `<ol class="pasos-ntfy">
    <li><b>Instala la app gratuita ntfy</b> (una sola vez). <a class="btn sec mini" href="${tiendaNtfy()}" target="_blank" rel="noopener">⬇️ Instalar ntfy</a></li>
    <li><b>Suscríbete a tu canal</b>: ${esAndroid() ? `pulsa <a class="btn pri mini" href="ntfy://ntfy.sh/${esc(canal)}">🔔 Abrir en ntfy</a> o` : ""} en ntfy pulsa <b>＋</b> y pega este nombre:
      <div class="canal"><code>${esc(canal)}</code><button class="btn sec mini" data-acc="copiar-canal" data-c="${esc(canal)}">Copiar</button></div>
      <small>Deja el servidor por defecto (ntfy.sh). El nombre es secreto: no lo compartas.</small></li>
    <li><b>Prueba</b> que ${quien === "tú" ? "te" : "le"} llega: <button class="btn sec mini" data-acc="probar-aviso" data-c="${esc(canal)}">🔔 Enviar aviso de prueba</button></li>
    ${esIOS() ? `<li><small>En iPhone, al abrir ntfy por primera vez acepta «Permitir notificaciones».</small></li>` : ""}
  </ol>`;
}
