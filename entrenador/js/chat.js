/* Chat entrenador ↔ deportista. Cada mensaje es un aporte { tipo: "mensaje", de, texto, t, ref? }.
   - visto: el entrenador ha leído un mensaje del deportista · leido: el deportista ha leído uno del entrenador. */
import { esc, fechaCorta, hoy } from "./util.js?v=202611142019";

export const mensajes = aportes => (aportes || []).filter(x => x.tipo === "mensaje").sort((a, b) => (a.t || a.cuando || "").localeCompare(b.t || b.cuando || ""));
export const sinLeerDep = aportes => mensajes(aportes).filter(m => m.de === "entrenador" && !m.leido);
export const sinLeerEnt = aportes => mensajes(aportes).filter(m => m.de === "deportista" && !m.visto);
export const idMensaje = () => `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const hora = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); };
const dia = iso => { const f = (iso || "").slice(0, 10); return f === hoy() ? "Hoy" : f ? fechaCorta(f) : ""; };

/** yo: "entrenador" o "deportista" (mis mensajes van a la derecha). */
export function htmlHilo(aportes, yo, nombreOtro = "") {
  const ms = mensajes(aportes);
  if (!ms.length) return `<div class="chat-vacio">${yo === "deportista" ? "Escríbele a tu entrenador: dudas, molestias, cómo te ha ido…" : `Aún no hay mensajes con ${esc(nombreOtro)}.`}</div>`;
  let ultimoDia = "";
  return ms.map(m => {
    const d = dia(m.t || m.cuando), sep = d !== ultimoDia ? `<div class="chat-dia">${d}</div>` : "";
    ultimoDia = d;
    const mio = m.de === yo;
    const leido = mio ? (m.de === "entrenador" ? m.leido : m.visto) : false;
    return `${sep}<div class="burbuja ${mio ? "mia" : "suya"}">
      ${m.ref ? `<div class="b-ref">🏃 ${esc(m.ref)}</div>` : ""}
      <div class="b-txt">${esc(m.texto).replace(/\n/g, "<br>")}</div>
      <div class="b-h">${hora(m.t || m.cuando)}${mio ? (leido ? " · ✓✓" : " · ✓") : ""}</div>
    </div>`;
  }).join("");
}

export function htmlCaja(ref = "") {
  return `<div class="chat-caja">
    ${ref ? `<div class="chat-ref">Sobre: <b>${esc(ref)}</b> <button class="link" data-acc="chat-sin-ref">quitar</button></div>` : ""}
    <div class="chat-fila"><textarea id="chat-txt" rows="2" placeholder="Escribe un mensaje…" maxlength="2000"></textarea><button class="btn pri" data-acc="chat-enviar" aria-label="Enviar">➤</button></div>
  </div>`;
}
