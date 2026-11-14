/* Almacenamiento: Firebase (si está configurado) o el propio navegador.
   Estructura en Firestore:
     entrenadores/{uid}/deportistas/{id}            ficha del deportista
     entrenadores/{uid}/deportistas/{id}/semanas/{lunes}   plan de cada semana
     entrenadores/{uid}/deportistas/{id}/archivos/{fid}    PDF e informes (hasta ~700 KB)
     publico/{token}                                 lo que ve el deportista con su enlace */
import { firebaseConfig } from "./firebase-config.js";

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
const limpio = o => JSON.parse(JSON.stringify(o)); // Firestore no admite undefined

export async function listar() {
  if (!nube) return lget(KEY, []);
  const q = await fb.getDocs(fb.collection(db, "entrenadores", usuario.uid, "deportistas"));
  return q.docs.map(d => d.data());
}
export async function guardarFicha(a) {
  const { semanas, ...ficha } = a;
  if (!nube) {
    const l = lget(KEY, []); const i = l.findIndex(x => x.id === a.id);
    if (i >= 0) l[i] = ficha; else l.push(ficha);
    if (!lset(KEY, l)) throw new Error("No queda espacio en el navegador");
    return;
  }
  await fb.setDoc(ref(a.id), limpio(ficha));
}
export async function cargarSemanas(a) {
  if (!nube) return lget(KEY_S(a.id), {});
  const q = await fb.getDocs(col(a.id, "semanas"));
  const out = {}; q.docs.forEach(d => { out[d.id] = d.data(); });
  return out;
}
export async function guardarSemana(a, snap) {
  if (!nube) { const s = lget(KEY_S(a.id), {}); s[snap.lunes] = snap; if (!lset(KEY_S(a.id), s)) throw new Error("No queda espacio en el navegador"); return; }
  await fb.setDoc(ref(a.id, "semanas", snap.lunes), limpio(snap));
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

/* Publicación para el deportista */
export async function publicar(a, datos) {
  if (!nube || !usuario) return false;
  await fb.setDoc(fb.doc(db, "publico", a.token), limpio({ ...datos, owner: usuario.uid, actualizado: new Date().toISOString() }));
  return true;
}
export async function leerPublico(token) {
  if (!nube) throw new Error("sin-nube");
  await cargarFirebase();
  const d = await fb.getDoc(fb.doc(db, "publico", token));
  return d.exists() ? d.data() : null;
}
