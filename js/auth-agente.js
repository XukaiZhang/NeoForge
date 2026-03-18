// auth-agente.js — Portal agentes/admin (login-agente.html)
// REGLA: solo agentes y admins. Empleados son rechazados.

import { auth, db } from './config.js';
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let _procesando = false;

// ── Obtener rol desde Firestore ────────────────────────────────────
async function getRol(uid) {
    try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        return snap.exists() ? (snap.data().rol ?? 'cliente') : 'cliente';
    } catch { return 'cliente'; }
}

// ── Guardián: si ya hay sesión activa ─────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user || _procesando) return;
    const rol = await getRol(user.uid);
    if (rol === 'agente' || rol === 'admin') {
        window.location.replace('dashboard.html');
    } else {
        // Tiene sesión de empleado abierta — cerrarla y mostrar error
        await signOut(auth);
        showAlert('status-msg-agente', 'error', 'Acceso denegado. Esta cuenta es de empleado. Usa el portal de empleados.');
    }
});

// ── Login con email ────────────────────────────────────────────────
document.getElementById('agenteLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('agenteEmail')?.value.trim();
    const password = document.getElementById('agentePassword')?.value;
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) { showAlert('status-msg-agente', 'error', 'Rellena todos los campos.'); return; }

    showAlert('status-msg-agente', 'loading', 'Verificando credenciales…');
    btn.disabled = true;
    _procesando  = true;

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const rol  = await getRol(cred.user.uid);

        if (rol !== 'agente' && rol !== 'admin') {
            await signOut(auth);
            _procesando  = false;
            btn.disabled = false;
            showAlert('status-msg-agente', 'error', 'Acceso denegado. Esta cuenta es de empleado. Usa el portal de empleados.');
            return;
        }

        showAlert('status-msg-agente', 'success', 'Acceso concedido. Redirigiendo…');
        _procesando = false;
        window.location.replace('dashboard.html');
    } catch (err) {
        _procesando  = false;
        btn.disabled = false;
        showAlert('status-msg-agente', 'error', getFriendlyError(err.code));
    }
});

// ── Google ─────────────────────────────────────────────────────────
document.getElementById('btnGoogleAgente')?.addEventListener('click', async () => {
    showAlert('status-msg-agente', 'loading', 'Abriendo Google…');
    _procesando = true;
    try {
        const cred = await signInWithPopup(auth, googleProvider);
        const rol  = await getRol(cred.user.uid);

        if (rol !== 'agente' && rol !== 'admin') {
            await signOut(auth);
            _procesando = false;
            showAlert('status-msg-agente', 'error', 'Acceso denegado. Esta cuenta es de empleado. Usa el portal de empleados.');
            return;
        }

        showAlert('status-msg-agente', 'success', 'Acceso concedido. Redirigiendo…');
        _procesando = false;
        window.location.replace('dashboard.html');
    } catch (err) {
        _procesando = false;
        if (err.code !== 'auth/popup-closed-by-user') {
            showAlert('status-msg-agente', 'error', getFriendlyError(err.code));
        } else {
            document.getElementById('status-msg-agente').style.display = 'none';
        }
    }
});

// ── Recuperar contraseña ───────────────────────────────────────────
document.getElementById('btnSendResetAgente')?.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmailAgente')?.value.trim();
    const btn   = document.getElementById('btnSendResetAgente');
    if (!email) { showAlert('forgotStatusAgente', 'error', 'Introduce tu correo.'); return; }
    btn.disabled = true;
    showAlert('forgotStatusAgente', 'loading', 'Enviando enlace…');
    try {
        await sendPasswordResetEmail(auth, email);
        showAlert('forgotStatusAgente', 'success', '¡Enlace enviado! Revisa tu bandeja.');
    } catch (err) {
        showAlert('forgotStatusAgente', 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Helpers ───────────────────────────────────────────────────────
function showAlert(elOrId, type, text) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    const s = {
        error:   { bg: 'var(--red-faint)',    border: 'rgba(239,68,68,0.25)',   color: 'var(--red)' },
        success: { bg: 'var(--green-faint)',  border: 'rgba(34,197,94,0.25)',   color: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', border: 'rgba(99,102,241,0.25)', color: 'var(--accent-light)' },
    }[type] || {};
    el.style.display = 'block';
    el.textContent   = text;
    el.style.cssText += `background:${s.bg};border:1px solid ${s.border};color:${s.color};padding:10px 14px;border-radius:var(--radius-sm);font-size:0.79rem;font-family:var(--font-mono);`;
}
function getFriendlyError(code) {
    return ({
        'auth/user-not-found':        'No hay ninguna cuenta con este correo.',
        'auth/wrong-password':        'Contraseña incorrecta.',
        'auth/invalid-credential':    'Correo o contraseña incorrectos.',
        'auth/invalid-email':         'Formato de correo no válido.',
        'auth/too-many-requests':     'Demasiados intentos. Inténtalo más tarde.',
        'auth/network-request-failed':'Error de red. Comprueba tu conexión.',
    })[code] ?? 'Ocurrió un error inesperado.';
}