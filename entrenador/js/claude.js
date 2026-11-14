/* Análisis con Claude (opcional). La clave de la API del entrenador se guarda SOLO en este navegador;
   nunca se sube a Firebase ni la ven los deportistas. Se paga por uso en la cuenta de Anthropic del entrenador. */
const CLAVE = "entrenador.claude.clave";
const MODELO = "claude-opus-5-5";

export const claveClaude = () => { try { return localStorage.getItem(CLAVE) || ""; } catch (e) { return ""; } };
export function guardarClave(k) { try { k ? localStorage.setItem(CLAVE, k.trim()) : localStorage.removeItem(CLAVE); } catch (e) { } }

let Anthropic = null;
async function cliente() {
  if (!claveClaude()) throw new Error("Falta tu clave de Claude: ponla en Herramientas → Claude.");
  if (!Anthropic) Anthropic = (await import("../vendor/anthropic-sdk-1.2.0.mjs")).default;
  return new Anthropic({ apiKey: claveClaude(), dangerouslyAllowBrowser: true });
}

const SISTEMA = `Eres el asistente de un entrenador personal de running, ciclismo, triatlón y fuerza en España.
Analizas entrenos y semanas de sus deportistas a partir del plan, lo que registran y sus capturas (Strava, Garmin, Polar…).
Escribe en español de España, claro y cercano, sin tecnicismos innecesarios. Usa ritmos en min/km y pulso en ppm.
No inventes datos que no aparezcan en el material: si una captura no se lee bien, dilo.
Si hay dolor o molestias, recomienda prudencia y, si persisten, consultar con un fisioterapeuta o médico.`;

/**
 * Envía texto e imágenes (dataURL) a Claude y devuelve el texto de la respuesta.
 * pedido: lo que debe hacer; datos: el contexto (plan, registro, zonas…); imagenes: capturas.
 */
export async function analizar(pedido, datos, imagenes = []) {
  const client = await cliente();
  const content = [];
  for (const d of imagenes.slice(0, 8)) {
    const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(d || "");
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  content.push({ type: "text", text: `${datos}\n\n${pedido}` });
  let r;
  try {
    r = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      messages: [{ role: "user", content }]
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("La clave de Claude no es válida. Revísala en Herramientas → Claude.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("Tu cuenta de Anthropic no tiene permiso para este modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Demasiadas peticiones seguidas: espera un minuto y vuelve a probar.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("No se ha podido conectar con Claude. Revisa la conexión.");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude ha devuelto un error (${e.status || "?"}): ${e.message}`);
    throw e;
  }
  if (r.stop_reason === "refusal") throw new Error("Claude no ha querido analizar este contenido.");
  const texto = r.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!texto) throw new Error("Claude no ha devuelto texto.");
  return texto;
}

/** Prueba la clave con una petición mínima. */
export async function probarClave() {
  return analizar("Responde solo: «Conectado».", "Prueba de conexión.");
}
