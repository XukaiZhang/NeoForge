// auth-agente.js — Solo para login-agente.html (portal agentes/admin)
// Solo permite acceso si el usuario tiene rol 'agente' o 'admin' en Firestore
import { auth, db } from './config.js';
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
import {
    doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ── Guardián: si ya hay sesión de agente, redirigir ────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;
    const rol = await getRol(user.uid);
    if (rol === 'agente' || rol === 'admin') {
        window.location.replace('dashboard.html');
    } else {
        // Está logado como cliente — cerrar sesión y mostrar error
        await signOut(auth);
        const msgEl = document.getElementById('status-msg-agente');
        showAlert(msgEl, 'error', 'Esta cuenta no tiene acceso al panel de agentes.');
    }
});

// ── Login ──────────────────────────────────────────────────────────
document.getElementById('agenteLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('agenteEmail')?.value.trim();
    const password = document.getElementById('agentePassword')?.value;
    const msgEl    = document.getElementById('status-msg-agente');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) { showAlert(msgEl, 'error', 'Por favor rellena todos los campos.'); return; }

    showAlert(msgEl, 'loading', 'Verificando credenciales…');
    btn.disabled = true;

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const rol  = await getRol(cred.user.uid);

        if (rol !== 'agente' && rol !== 'admin') {
            // Usuario existe pero no es agente — crear doc si falta y denegar
            await ensureUserDoc(cred.user, 'cliente');
            await signOut(auth);
            showAlert(msgEl, 'error', 'Esta cuenta no tiene acceso al panel de agentes. Accede desde el portal de clientes.');
            btn.disabled = false;
            return;
        }
        // Es agente/admin → el guardián onAuthStateChanged redirigirá automáticamente
        showAlert(msgEl, 'success', 'Acceso concedido. Redirigiendo…');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Google Sign In ────────────────────────────────────────────────
document.getElementById('btnGoogleAgente')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('status-msg-agente');
    showAlert(msgEl, 'loading', 'Abriendo Google…');
    try {
        const cred = await signInWithPopup(auth, googleProvider);
        const rol  = await getRol(cred.user.uid);

        if (rol !== 'agente' && rol !== 'admin') {
            await ensureUserDoc(cred.user, 'cliente');
            await signOut(auth);
            showAlert(msgEl, 'error', 'Esta cuenta Google no tiene acceso al panel de agentes.');
            return;
        }
        showAlert(msgEl, 'success', 'Acceso concedido. Redirigiendo…');
        // El guardián onAuthStateChanged redirigirá automáticamente
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showAlert(msgEl, 'error', getFriendlyError(err.code));
        } else {
            msgEl.style.display = 'none';
        }
    }
});

// ── Recuperar contraseña ───────────────────────────────────────────
document.getElementById('btnSendResetAgente')?.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmailAgente')?.value.trim();
    const msgEl = document.getElementById('forgotStatusAgente');
    const btn   = document.getElementById('btnSendResetAgente');
    if (!email) { showAlert(msgEl, 'error', 'Introduce tu dirección de correo.'); return; }
    btn.disabled = true;
    showAlert(msgEl, 'loading', 'Enviando enlace…');
    try {
        await sendPasswordResetEmail(auth, email);
        showAlert(msgEl, 'success', '¡Enlace enviado! Revisa tu bandeja de entrada.');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Obtener rol desde Firestore ────────────────────────────────────
async function getRol(uid) {
    try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        return snap.exists() ? (snap.data().rol ?? 'cliente') : 'cliente';
    } catch { return 'cliente'; }
}

// ── Crear doc si no existe (usuarios legacy) ──────────────────────
async function ensureUserDoc(user, defaultRol = 'cliente') {
    try {
        const ref  = doc(db, 'usuarios', user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, {
                uid:    user.uid,
                email:  user.email,
                nombre: user.displayName || user.email.split('@')[0],
                rol:    defaultRol,
                creado: serverTimestamp(),
            });
        } else if (!snap.data().rol) {
            await setDoc(ref, { rol: defaultRol }, { merge: true });
        }
    } catch (err) {
        console.warn('ensureUserDoc:', err);
    }
}

// ── Helpers ───────────────────────────────────────────────────────
function showAlert(el, type, text) {
    if (!el) return;
    el.style.display = 'block'; el.textContent = text;
    const s = {
        error:   { bg:'var(--red-faint)',    border:'rgba(239,68,68,0.25)',   color:'var(--red)' },
        success: { bg:'var(--green-faint)',  border:'rgba(34,197,94,0.25)',   color:'var(--green)' },
        loading: { bg:'var(--accent-faint)', border:'rgba(99,102,241,0.25)', color:'var(--accent-light)' },
    }[type] || {};
    el.style.cssText += `background:${s.bg};border:1px solid ${s.border};color:${s.color};padding:10px 14px;border-radius:var(--radius-sm);font-size:0.79rem;font-family:var(--font-mono);`;
}
function getFriendlyError(code) {
    const map = {
        'auth/user-not-found':        'No hay ninguna cuenta con este correo.',
        'auth/wrong-password':        'Contraseña incorrecta.',
        'auth/invalid-credential':    'Correo o contraseña incorrectos.',
        'auth/invalid-email':         'El formato del correo no es válido.',
        'auth/too-many-requests':     'Demasiados intentos. Inténtalo más tarde.',
        'auth/network-request-failed':'Error de red. Comprueba tu conexión.',
    };
    return map[code] ?? 'Ocurrió un error inesperado.';
}