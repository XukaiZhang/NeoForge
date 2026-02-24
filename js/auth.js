import { auth } from './config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Session guardian ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    const path    = window.location.pathname;
    const isLogin = path.includes('login.html') || path.includes('index.html') ||
                    path === '/' || path.endsWith('/');

    if (!user && !isLogin) { window.location.replace('login.html'); return; }
    if (user  &&  isLogin) { window.location.replace('dashboard.html'); return; }

    if (user) {
        // Fill user name/email everywhere
        const emailEl  = document.getElementById('userEmail');
        const avatarEl = document.getElementById('userAvatarInitial');
        const nameEl   = document.getElementById('userName');

        const display = user.displayName || user.email.split('@')[0];
        const initial = display.charAt(0).toUpperCase();

        if (emailEl)  emailEl.textContent  = user.email;
        if (nameEl)   nameEl.textContent   = display;
        if (avatarEl) avatarEl.textContent = initial;
    }
});

// ── Google Sign In / Register (shared handler) ────────────────────
async function googleSignIn(msgElId) {
    const msgEl = document.getElementById(msgElId);
    showAlert(msgEl, 'loading', 'Abriendo Google…');
    try {
        await signInWithPopup(auth, googleProvider);
        // onAuthStateChanged handles redirect
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

// ── Email Sign In ──────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const msgEl    = document.getElementById('status-msg-login');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) { showAlert(msgEl, 'error', 'Por favor rellena todos los campos.'); return; }

    showAlert(msgEl, 'loading', 'Autenticando…');
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Email Register ─────────────────────────────────────────────────
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
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
        // Set display name from email prefix
        await updateProfile(cred.user, { displayName: email.split('@')[0] });
        showAlert(msgEl, 'success', '¡Cuenta creada! Redirigiendo…');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Forgot password ────────────────────────────────────────────────
document.getElementById('btnSendReset')?.addEventListener('click', async () => {
    const email  = document.getElementById('forgotEmail')?.value.trim();
    const msgEl  = document.getElementById('forgotStatus');
    const btn    = document.getElementById('btnSendReset');

    if (!email) { showAlert(msgEl, 'error', 'Por favor introduce tu dirección de correo.'); return; }

    btn.disabled = true;
    showAlert(msgEl, 'loading', 'Enviando enlace de restablecimiento…');

    try {
        await sendPasswordResetEmail(auth, email);
        showAlert(msgEl, 'success', '¡Enlace enviado! Revisa tu bandeja de entrada.');
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Logout ─────────────────────────────────────────────────────────
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.replace('login.html');
});

// ── Helpers ───────────────────────────────────────────────────────
export function showAlert(el, type, text) {
    if (!el) return;
    el.style.display = 'block';
    el.textContent   = text;
    const s = {
        error:   { bg: 'var(--red-faint)',    border: 'rgba(239,68,68,0.25)',   color: 'var(--red)' },
        success: { bg: 'var(--green-faint)',  border: 'rgba(34,197,94,0.25)',   color: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', border: 'rgba(99,102,241,0.25)', color: 'var(--accent-light)' },
    }[type] || {};
    el.style.cssText += `background:${s.bg};border:1px solid ${s.border};color:${s.color};`;
}

export function getFriendlyError(code) {
    const map = {
        'auth/user-not-found':        'No se encontró ninguna cuenta con este correo.',
        'auth/wrong-password':        'Contraseña incorrecta. Por favor inténtalo de nuevo.',
        'auth/invalid-email':         'Por favor introduce un correo electrónico válido.',
        'auth/too-many-requests':     'Demasiados intentos. Por favor inténtalo más tarde.',
        'auth/email-already-in-use':  'Este correo ya está registrado. Inicia sesión.',
        'auth/weak-password':         'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-credential':    'Correo o contraseña incorrectos.',
        'auth/popup-blocked':         'El popup fue bloqueado. Permite popups e inténtalo.',
        'auth/network-request-failed':'Error de red. Comprueba tu conexión.',
        'auth/cancelled-popup-request':'Inicio de sesión cancelado.',
    };
    return map[code] ?? 'Ocurrió un error inesperado. Por favor inténtalo de nuevo.';
}