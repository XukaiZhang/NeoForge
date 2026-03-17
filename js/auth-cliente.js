// auth-cliente.js — Solo para login.html (portal clientes)
// Los usuarios que entran aquí siempre son 'cliente'
import { auth, db } from './config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Guardián: si ya hay sesión, redirigir ──────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;
    // Ya autenticado → ir a mis-tickets (cliente)
    window.location.replace('mis-tickets.html');
});

// ── Google ─────────────────────────────────────────────────────────
async function googleSignIn(msgElId) {
    const msgEl = document.getElementById(msgElId);
    showAlert(msgEl, 'loading', 'Abriendo Google…');
    try {
        const cred = await signInWithPopup(auth, googleProvider);
        await ensureUserDoc(cred.user, 'cliente');
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showAlert(msgEl, 'error', getFriendlyError(err.code));
        } else {
            if (msgEl) msgEl.style.display = 'none';
        }
    }
}
document.getElementById('btnGoogleLogin')?.addEventListener('click',    () => googleSignIn('status-msg-login'));
document.getElementById('btnGoogleRegister')?.addEventListener('click', () => googleSignIn('status-msg-register'));

// ── Email login ────────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const msgEl    = document.getElementById('status-msg-login');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) { showAlert(msgEl, 'error', 'Por favor rellena todos los campos.'); return; }
    showAlert(msgEl, 'loading', 'Autenticando…');
    btn.disabled = true;

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // Crear documento si no existe (para usuarios que existían antes del sistema de roles)
        await ensureUserDoc(cred.user, 'cliente');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Email register ─────────────────────────────────────────────────
document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value;
    const confirm  = document.getElementById('registerConfirm')?.value;
    const msgEl    = document.getElementById('status-msg-register');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password || !confirm) { showAlert(msgEl, 'error', 'Por favor rellena todos los campos.'); return; }
    if (password !== confirm)            { showAlert(msgEl, 'error', 'Las contraseñas no coinciden.'); return; }
    if (password.length < 6)            { showAlert(msgEl, 'error', 'La contraseña debe tener al menos 6 caracteres.'); return; }

    showAlert(msgEl, 'loading', 'Creando tu cuenta…');
    btn.disabled = true;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: email.split('@')[0] });
        await ensureUserDoc(cred.user, 'cliente');
        showAlert(msgEl, 'success', '¡Cuenta creada! Redirigiendo…');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Recuperar contraseña ───────────────────────────────────────────
document.getElementById('btnSendReset')?.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail')?.value.trim();
    const msgEl = document.getElementById('forgotStatus');
    const btn   = document.getElementById('btnSendReset');
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

// ── Crear doc en Firestore si no existe ───────────────────────────
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
        }
        // Si existe pero no tiene rol, asignar cliente
        else if (!snap.data().rol) {
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
        'auth/user-not-found':       'No hay ninguna cuenta con este correo.',
        'auth/wrong-password':       'Contraseña incorrecta.',
        'auth/invalid-credential':   'Correo o contraseña incorrectos.',
        'auth/invalid-email':        'El formato del correo no es válido.',
        'auth/too-many-requests':    'Demasiados intentos. Inténtalo más tarde.',
        'auth/email-already-in-use': 'Este correo ya está registrado. Inicia sesión.',
        'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
        'auth/network-request-failed':'Error de red. Comprueba tu conexión.',
    };
    return map[code] ?? 'Ocurrió un error inesperado.';
}