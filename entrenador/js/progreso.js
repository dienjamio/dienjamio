/* Progreso semana a semana: lo planificado frente a lo hecho (registros del deportista y actividades subidas). */
import { hoy, lunesDe, sumaDias } from "./util.js?v=202611141530";

/**
 * semanas: { lunes: instantánea } · aportes: buzón del deportista · actividades: las importadas.
 * Devuelve las últimas `n` semanas hasta la actual.
 */
export function calcProgreso({ semanas = {}, aportes = [], actividades = [], n = 12 }) {
  const h = hoy(), actual = lunesDe(h);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const l = sumaDias(actual, -7 * i), fin = sumaDias(l, 6);
    const snap = semanas[l];
    let planMin = 0, sesPlan = 0, hechoMin = 0, sesHechas = 0;
    const regs = aportes.filter(x => x.tipo === "sesion" && x.lunes === l);
    if (snap) snap.dias.forEach((d, di) => {
      const pasado = sumaDias(l, di) <= h;
      for (const s of d.ses) {
        if (s.dep === "movilidad") continue;
        planMin += +s.min || 0;
        if (pasado) sesPlan++;
        const r = regs.find(x => x.sesId === s.id);
        if (r && r.hecho !== "no") { sesHechas++; hechoMin += (+s.min || 0) * (r.hecho === "parcial" ? 0.5 : 1); }
      }
    });
    const acts = actividades.filter(a => a.fecha >= l && a.fecha <= fin);
    if (!regs.length && acts.length) { hechoMin = acts.reduce((t, a) => t + (a.dur || 0) / 60, 0); sesHechas = acts.length; }
    let km = acts.filter(a => a.dep === "run").reduce((t, a) => t + (a.km || 0), 0);
    if (!km) km = regs.reduce((t, r) => t + (+String(r.km || 0).replace(",", ".") || 0), 0);
    const val = aportes.find(x => x.tipo === "semana" && x.lunes === l);
    out.push({ lunes: l, planMin: Math.round(planMin), hechoMin: Math.round(hechoMin), sesPlan, sesHechas, km: Math.round(km * 10) / 10, sensacion: val?.sensacion || null });
  }
  return out;
}

/** Junta el progreso publicado por el entrenador con lo que el deportista acaba de registrar. */
export function mezclarProgreso(publicado = [], propio = []) {
  const m = new Map(publicado.map(s => [s.lunes, { ...s }]));
  for (const s of propio) {
    const p = m.get(s.lunes);
    if (!p) { m.set(s.lunes, s); continue; }
    if (s.sesHechas > p.sesHechas) { p.sesHechas = s.sesHechas; p.hechoMin = Math.max(p.hechoMin, s.hechoMin); }
    if (s.sensacion) p.sensacion = s.sensacion;
    if (!p.km && s.km) p.km = s.km;
    if (!p.planMin && s.planMin) { p.planMin = s.planMin; p.sesPlan = s.sesPlan; }
  }
  return [...m.values()].sort((a, b) => a.lunes.localeCompare(b.lunes)).slice(-12);
}
