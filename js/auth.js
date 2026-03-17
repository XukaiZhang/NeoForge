import { auth, db } from './config.js';
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
import {
    doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Páginas exclusivas de agentes (cliente NO puede acceder)
const AGENT_PAGES = [
    'dashboard.html', 'agentes.html', 'informes.html',
    'perfil.html'
];
const ADMIN_PAGES = ['admin.html'];
// Páginas exclusivas de clientes
const CLIENT_PAGES = ['mis-tickets.html', 'new-ticket.html'];

// ── Session guardian ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    const path    = window.location.pathname;
    const page    = path.split('/').pop() || 'index.html';
    const isLogin = page === 'login.html' || page === 'login-agente.html' || page === 'index.html' || page === '';

    // No autenticado → login según tipo de página
    if (!user && !isLogin) {
        const isAgentPage = AGENT_PAGES.some(p => page.endsWith(p)) || ADMIN_PAGES.some(p => page.endsWith(p));
        window.location.replace(isAgentPage ? 'login-agente.html' : 'login.html');
        return;
    }

    // Autenticado en login → redirigir según rol
    if (user && isLogin) {
        const rol = await getUserRole(user.uid);
        window.location.replace(rol === 'agente' || rol === 'admin' ? 'dashboard.html' : 'mis-tickets.html');
        return;
    }

    if (!user) return;

    // Obtener rol
    const rol = await getUserRole(user.uid);

    // Cliente intentando acceder a página de agente → redirigir
    if (rol === 'cliente' && AGENT_PAGES.some(p => page.endsWith(p))) {
        window.location.replace('mis-tickets.html');
        return;
    }

    // Agente en página exclusiva de cliente → redirigir al dashboard
    if (rol !== 'cliente' && CLIENT_PAGES.some(p => page.endsWith(p))) {
        window.location.replace('dashboard.html');
        return;
    }

    // No-admin intentando acceder a admin.html → redirigir
    if (rol !== 'admin' && ADMIN_PAGES.some(p => page.endsWith(p))) {
        window.location.replace('dashboard.html');
        return;
    }

    // Mostrar enlace Admin en sidebar si el usuario es admin
    if (rol === 'admin') {
        const nav = document.querySelector('.sidebar-nav');
        if (nav && !document.querySelector('.nav-item-admin')) {
            const adminLink = document.createElement('a');
            adminLink.href      = 'admin.html';
            adminLink.className = 'nav-item nav-item-admin' +
                (page.endsWith('admin.html') ? ' active' : '');
            adminLink.innerHTML = '<i class="bi bi-shield-lock-fill"></i><span>Admin</span>';
            nav.appendChild(adminLink);
        }
    }

    // Rellenar UI con datos del usuario
    const display = user.displayName || user.email.split('@')[0];
    const initial = display.charAt(0).toUpperCase();
    const emailEl  = document.getElementById('userEmail');
    const avatarEl = document.getElementById('userAvatarInitial');
    const nameEl   = document.getElementById('userName');
    const roleEl   = document.getElementById('userRole');
    if (emailEl)  emailEl.textContent  = user.email;
    if (nameEl)   nameEl.textContent   = display;
    if (avatarEl) avatarEl.textContent = initial;
    if (roleEl)   roleEl.textContent   = rol === 'agente' ? 'Agente de soporte' :
                                         rol === 'admin'  ? 'Administrador'     : 'Cliente';
});

// ── Google Sign In / Register ─────────────────────────────────────
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
        await updateProfile(cred.user, { displayName: email.split('@')[0] });
        await ensureUserDoc(cred.user, 'cliente');
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
    sessionStorage.removeItem('nf_role');
    await signOut(auth);
    window.location.replace('login-agente.html');
});

// ── Create Firestore user doc if missing ───────────────────────────
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
    } catch (err) {
        console.warn('ensureUserDoc:', err);
    }
}

// ── Role lookup with cache ─────────────────────────────────────────
export async function getUserRole(uid) {
    const cached = sessionStorage.getItem('nf_role');
    if (cached) return cached;
    try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        const rol  = snap.exists() ? (snap.data().rol ?? 'cliente') : 'cliente';
        sessionStorage.setItem('nf_role', rol);
        return rol;
    } catch { return 'cliente'; }
}

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
    el.style.cssText += `background:${s.bg};border:1px solid ${s.border};color:${s.color};padding:10px 14px;border-radius:var(--radius-sm);font-size:0.79rem;font-family:var(--font-mono);`;
}

export function getFriendlyError(code) {
    const map = {
        'auth/user-not-found':         'No se encontró ninguna cuenta con este correo.',
        'auth/wrong-password':         'Contraseña incorrecta. Por favor inténtalo de nuevo.',
        'auth/invalid-email':          'Por favor introduce un correo electrónico válido.',
        'auth/too-many-requests':      'Demasiados intentos. Por favor inténtalo más tarde.',
        'auth/email-already-in-use':   'Este correo ya está registrado. Inicia sesión.',
        'auth/weak-password':          'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-credential':     'Correo o contraseña incorrectos.',
        'auth/popup-blocked':          'El popup fue bloqueado. Permite popups e inténtalo.',
        'auth/network-request-failed': 'Error de red. Comprueba tu conexión.',
        'auth/cancelled-popup-request':'Inicio de sesión cancelado.',
        'auth/requires-recent-login':  'Por seguridad, cierra sesión y vuelve a entrar.',
    };
    return map[code] ?? 'Ocurrió un error inesperado. Por favor inténtalo de nuevo.';
}