import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyAqkVlGR2sPiNQykEYYbX5YgyFkZkXjiww",
    authDomain:        "neoforge-d06b7.firebaseapp.com",
    projectId:         "neoforge-d06b7",
    storageBucket:     "neoforge-d06b7.firebasestorage.app",
    messagingSenderId: "762899766435",
    appId:             "1:762899766435:web:a340e0e6cdd9711d603316",
    measurementId:     "G-287XF20FL9"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── Rol del usuario ───────────────────────────────────────────────
// /usuarios/{uid} → { rol: 'agente' | 'cliente', email, nombre, creado }
export async function getUserRole(uid) {
    const cached = sessionStorage.getItem('nf_role');
    if (cached) return cached;
    try {
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, 'usuarios', uid));
        const rol  = snap.exists() ? (snap.data().rol ?? 'cliente') : 'cliente';
        sessionStorage.setItem('nf_role', rol);
        return rol;
    } catch { return 'cliente'; }
}

export function clearRoleCache() {
    sessionStorage.removeItem('nf_role');
}