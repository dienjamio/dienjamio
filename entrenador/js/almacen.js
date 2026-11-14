/* Almacenamiento: Firebase (si está configurado) o el propio navegador.
   Estructura en Firestore:
     entrenadores/{uid}/deportistas/{id}            ficha del deportista
     entrenadores/{uid}/deportistas/{id}/semanas/{lunes}   plan de cada semana
     entrenadores/{uid}/deportistas/{id}/archivos/{fid}    PDF e informes (hasta ~700 KB)
     publico/{token}                                 lo que ve el deportista con su enlace */
import { firebaseConfig } from "./firebase-config.js?v=202611141518";

const V = "10.12.2";
const SDK = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;
let fb = null;      // módulos de Firebase cargados
let db = null, auth = null;
export let usuario = null;
export const nube = !!firebaseConfig;

async function cargarFirebase() {
  if (fb) return fb;
  const [app, fa, fs] = await Promise.all([import(SDK("app")), import(SDK("auth")), import(SDK("firestore"))]);
  const a = app.initializeApp(firebaseConfig);
  auth = fa.getAuth(a);
  db = fs.getFirestore(a);
  fb = { ...fa, ...fs };
  return fb;
}

/** Arranca y devuelve el usuario (o null si hay que iniciar sesión). */
export async function iniciar() {
  if (!nube) return { modo: "local" };
  await cargarFirebase();
  usuario = await new Promise(res => { const off = fb.onAuthStateChanged(auth, u => { off(); res(u); }); });
  return { modo: "nube", usuario };
}
export async function entrar() {
  await cargarFirebase();
  const r = await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
  usuario = r.user;
  return usuario;
}
export async function salir() { if (auth) await fb.signOut(auth); usuario = null; }

/* ---------------- Local (navegador) ---------------- */
const KEY = "entrenador.v2.deportistas";
const KEY_S = id => `entrenador.v2.semanas.${id}`;
const lget = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const lset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("entrenador", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("archivos", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbOp(modo, fn) {
  const d = await idb();
  return new Promise((res, rej) => { const tx = d.transaction("archivos", modo); const r = fn(tx.objectStore("archivos")); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); });
}

/* ---------------- API ---------------- */
const ref = (...p) => fb.doc(db, "entrenadores", usuario.uid, "deportistas", ...p);
const col = (...p) => fb.collection(db, "entrenadores", usuario.uid, "deportistas", ...p);
/* Firestore no admite undefined ni listas dentro de listas (p. ej. las zonas [[120,135],…]).
   Al guardar, cada lista interior se envuelve como {_l:[…]} y al leer se deshace. */
const envolver = v => Array.isArray(v) ? v.map(x => Array.isArray(x) ? { _l: envolver(x) } : envolver(x))
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, envolver(x)])) : v;
const desenvolver = v => Array.isArray(v) ? v.map(desenvolver)
  : (v && typeof v === "object") ? (Array.isArray(v._l) && Object.keys(v).length === 1 ? desenvolver(v._l) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, desenvolver(x)]))) : v;
export const limpio = o => envolver(JSON.parse(JSON.stringify(o)));
/* Fichas, semanas y enlaces se guardan como un único texto JSON: Firestore no tiene que indexar
   miles de campos (límite de 40.000 por documento) y no hay problemas con listas anidadas. */
const aDoc = (o, extra = {}) => ({ ...extra, json: JSON.stringify(o) });
export const leer = d => d && typeof d.json === "string" ? JSON.parse(d.json) : desenvolver(d);

export async function listar() {
  if (!nube) return lget(KEY, []);
  const q = await fb.getDocs(fb.collection(db, "entrenadores", usuario.uid, "deportistas"));
  return q.docs.map(d => leer(d.data()));
}
export async function guardarFicha(a) {
  const { semanas, ...ficha } = a;
  if (!nube) {
    const l = lget(KEY, []); const i = l.findIndex(x => x.id === a.id);
    if (i >= 0) l[i] = ficha; else l.push(ficha);
    if (!lset(KEY, l)) throw new Error("No queda espacio en el navegador");
    return;
  }
  await fb.setDoc(ref(a.id), aDoc(ficha));
}
export async function cargarSemanas(a) {
  if (!nube) return lget(KEY_S(a.id), {});
  const q = await fb.getDocs(col(a.id, "semanas"));
  const out = {}; q.docs.forEach(d => { out[d.id] = leer(d.data()); });
  return out;
}
export async function guardarSemana(a, snap) {
  if (!nube) { const s = lget(KEY_S(a.id), {}); s[snap.lunes] = snap; if (!lset(KEY_S(a.id), s)) throw new Error("No queda espacio en el navegador"); return; }
  await fb.setDoc(ref(a.id, "semanas", snap.lunes), aDoc(snap));
}
export async function borrarSemana(a, lunes) {
  if (!nube) { const s = lget(KEY_S(a.id), {}); delete s[lunes]; lset(KEY_S(a.id), s); return; }
  await fb.deleteDoc(ref(a.id, "semanas", lunes));
}
export async function borrar(a) {
  if (!nube) { lset(KEY, lget(KEY, []).filter(x => x.id !== a.id)); localStorage.removeItem(KEY_S(a.id)); return; }
  for (const sub of ["semanas", "archivos"]) { const q = await fb.getDocs(col(a.id, sub)); await Promise.all(q.docs.map(d => fb.deleteDoc(d.ref))); }
  await fb.deleteDoc(ref(a.id));
  if (a.token) await fb.deleteDoc(fb.doc(db, "publico", a.token)).catch(() => {});
}

/* Archivos (PDF, imágenes) */
export async function guardarArchivo(a, arch) {
  if (!nube) return idbOp("readwrite", s => s.put({ ...arch, aid: a.id }));
  await fb.setDoc(ref(a.id, "archivos", arch.id), limpio(arch));
}
export async function listarArchivos(a) {
  if (!nube) { const todos = await idbOp("readonly", s => s.getAll()); return (todos || []).filter(x => x.aid === a.id).map(({ datos, ...m }) => m); }
  const q = await fb.getDocs(col(a.id, "archivos"));
  return q.docs.map(d => { const { datos, ...m } = d.data(); return m; });
}
export async function leerArchivoGuardado(a, id) {
  if (!nube) return idbOp("readonly", s => s.get(id));
  return (await fb.getDoc(ref(a.id, "archivos", id))).data();
}
export async function borrarArchivo(a, id) {
  if (!nube) return idbOp("readwrite", s => s.delete(id));
  await fb.deleteDoc(ref(a.id, "archivos", id));
}

/* Buzón del deportista: lo que él registra con su enlace (entrenos hechos, valoraciones, carreras propuestas).
   Vive en publico/{token}/aportes y puede escribirlo quien tenga el enlace. */
const sinAnidar = o => JSON.parse(JSON.stringify(o));
export async function listarAportes(token) {
  if (!nube || !token) return [];
  await cargarFirebase();
  const q = await fb.getDocs(fb.collection(db, "publico", token, "aportes"));
  return q.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function guardarAporte(token, id, datos) {
  await cargarFirebase();
  await fb.setDoc(fb.doc(db, "publico", token, "aportes", id), sinAnidar({ ...datos, cuando: new Date().toISOString() }), { merge: true });
}
export async function marcarAporte(token, id, cambios) {
  await cargarFirebase();
  await fb.setDoc(fb.doc(db, "publico", token, "aportes", id), sinAnidar(cambios), { merge: true });
}
export async function borrarAporte(token, id) {
  await cargarFirebase();
  await fb.deleteDoc(fb.doc(db, "publico", token, "aportes", id));
}

/* Lo guardado en este navegador antes de conectar la nube */
export async function datosLocales() {
  const atletas = lget(KEY, []);
  if (!atletas.length) return null;
  let docs = [];
  try { docs = (await idbOp("readonly", s => s.getAll())) || []; } catch (e) { }
  return atletas.map(a => ({ ficha: a, semanas: lget(KEY_S(a.id), {}), archivos: docs.filter(d => d.aid === a.id).map(({ aid, ...d }) => d) }));
}
export function olvidarLocales() { const l = lget(KEY, []); l.forEach(a => localStorage.removeItem(KEY_S(a.id))); localStorage.removeItem(KEY); }

/* Publicación para el deportista */
export async function publicar(a, datos) {
  if (!nube || !usuario) return false;
  const actualizado = new Date().toISOString();
  await fb.setDoc(fb.doc(db, "publico", a.token), aDoc({ ...datos, actualizado }, { owner: usuario.uid, actualizado }));
  return true;
}
export async function leerPublico(token) {
  if (!nube) throw new Error("sin-nube");
  await cargarFirebase();
  const d = await fb.getDoc(fb.doc(db, "publico", token));
  if (!d.exists()) return null;
  const { json, owner, ...resto } = d.data();
  return json ? { ...JSON.parse(json) } : desenvolver(resto);
}
