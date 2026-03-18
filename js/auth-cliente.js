// auth-cliente.js — Portal empleados (login.html)
// REGLA: solo empleados (rol 'cliente'). Agentes y admins son rechazados.

import { auth, db } from './config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Bloquea la redirección automática mientras se procesa un login/registro
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
        // Tiene sesión de agente abierta — cerrarla y mostrar error
        await signOut(auth);
        showAlert('status-msg-login', 'error', 'Acceso denegado. Esta cuenta es de agente. Usa el portal de agentes.');
    } else {
        window.location.replace('mis-tickets.html');
    }
});

// ── Login con email ────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) { showAlert('status-msg-login', 'error', 'Rellena todos los campos.'); return; }

    showAlert('status-msg-login', 'loading', 'Autenticando…');
    btn.disabled = true;
    _procesando  = true;

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const rol  = await getRol(cred.user.uid);

        if (rol === 'agente' || rol === 'admin') {
            await signOut(auth);
            _procesando  = false;
            btn.disabled = false;
            showAlert('status-msg-login', 'error', 'Acceso denegado. Esta cuenta es de agente. Usa el portal de agentes.');
            return;
        }

        await ensureUserDoc(cred.user, 'cliente');
        _procesando = false;
        window.location.replace('mis-tickets.html');
    } catch (err) {
        _procesando  = false;
        btn.disabled = false;
        showAlert('status-msg-login', 'error', getFriendlyError(err.code));
    }
});

// ── Registro con email ─────────────────────────────────────────────
document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value;
    const confirm  = document.getElementById('registerConfirm')?.value;
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password || !confirm) { showAlert('status-msg-register', 'error', 'Rellena todos los campos.'); return; }
    if (password !== confirm)            { showAlert('status-msg-register', 'error', 'Las contraseñas no coinciden.'); return; }
    if (password.length < 6)            { showAlert('status-msg-register', 'error', 'Mínimo 6 caracteres.'); return; }

    showAlert('status-msg-register', 'loading', 'Creando tu cuenta…');
    btn.disabled = true;
    _procesando  = true;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: email.split('@')[0] });
        showAlert('status-msg-register', 'loading', 'Guardando datos…');
        await ensureUserDoc(cred.user, 'cliente');
        _procesando = false;
        showAlert('status-msg-register', 'success', '¡Cuenta creada! Redirigiendo…');
        setTimeout(() => window.location.replace('mis-tickets.html'), 1200);
    } catch (err) {
        _procesando  = false;
        btn.disabled = false;
        showAlert('status-msg-register', 'error', getFriendlyError(err.code));
    }
});

// ── Google ─────────────────────────────────────────────────────────
async function googleSignIn(msgId) {
    showAlert(msgId, 'loading', 'Abriendo Google…');
    _procesando = true;
    try {
        const cred = await signInWithPopup(auth, googleProvider);
        const rol  = await getRol(cred.user.uid);

        if (rol === 'agente' || rol === 'admin') {
            await signOut(auth);
            _procesando = false;
            showAlert(msgId, 'error', 'Acceso denegado. Esta cuenta es de agente. Usa el portal de agentes.');
            return;
        }

        await ensureUserDoc(cred.user, 'cliente');
        _procesando = false;
        window.location.replace('mis-tickets.html');
    } catch (err) {
        _procesando = false;
        if (err.code !== 'auth/popup-closed-by-user') {
            showAlert(msgId, 'error', getFriendlyError(err.code));
        } else {
            document.getElementById(msgId).style.display = 'none';
        }
    }
}
document.getElementById('btnGoogleLogin')?.addEventListener('click',    () => googleSignIn('status-msg-login'));
document.getElementById('btnGoogleRegister')?.addEventListener('click', () => googleSignIn('status-msg-register'));

// ── Recuperar contraseña ───────────────────────────────────────────
document.getElementById('btnSendReset')?.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail')?.value.trim();
    const btn   = document.getElementById('btnSendReset');
    if (!email) { showAlert('forgotStatus', 'error', 'Introduce tu correo.'); return; }
    btn.disabled = true;
    showAlert('forgotStatus', 'loading', 'Enviando enlace…');
    try {
        await sendPasswordResetEmail(auth, email);
        showAlert('forgotStatus', 'success', '¡Enlace enviado! Revisa tu bandeja.');
    } catch (err) {
        showAlert('forgotStatus', 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Crear doc en Firestore (3 reintentos) ──────────────────────────
async function ensureUserDoc(user, defaultRol = 'cliente') {
    const ref = doc(db, 'usuarios', user.uid);
    for (let i = 1; i <= 3; i++) {
        try {
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
            return;
        } catch (err) {
            console.error(`ensureUserDoc intento ${i}/3:`, err.code, err.message);
            if (i < 3) await new Promise(r => setTimeout(r, 800 * i));
        }
    }
}

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
        'auth/email-already-in-use':  'Este correo ya está registrado.',
        'auth/weak-password':         'La contraseña debe tener al menos 6 caracteres.',
        'auth/network-request-failed':'Error de red. Comprueba tu conexión.',
    })[code] ?? 'Ocurrió un error inesperado.';
}