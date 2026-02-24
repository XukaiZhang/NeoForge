import { auth } from './config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ── Session Guardian ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    const isLogin = window.location.pathname.includes('login.html') ||
                    window.location.pathname === '/' ||
                    window.location.pathname === '';

    if (!user && !isLogin) {
        window.location.href = 'login.html';
        return;
    }
    if (user && isLogin) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (user) {
        const emailEl = document.getElementById('userEmail');
        if (emailEl) emailEl.textContent = user.email;
    }
});

// ── Sign In ────────────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const msgEl    = document.getElementById('status-msg-login');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password) {
        showAlert(msgEl, 'error', 'Please fill in all fields.');
        return;
    }

    showAlert(msgEl, 'loading', 'Authenticating…');
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged handles redirect
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Register ───────────────────────────────────────────────────────
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value;
    const confirm  = document.getElementById('registerConfirm')?.value;
    const msgEl    = document.getElementById('status-msg-register');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!email || !password || !confirm) {
        showAlert(msgEl, 'error', 'Please fill in all fields.');
        return;
    }

    if (password !== confirm) {
        showAlert(msgEl, 'error', 'Passwords do not match.');
        return;
    }

    if (password.length < 6) {
        showAlert(msgEl, 'error', 'Password must be at least 6 characters.');
        return;
    }

    showAlert(msgEl, 'loading', 'Creating your account…');
    btn.disabled = true;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showAlert(msgEl, 'success', 'Account created! Redirecting…');
        // onAuthStateChanged handles redirect
    } catch (err) {
        showAlert(msgEl, 'error', getFriendlyError(err.code));
        btn.disabled = false;
    }
});

// ── Logout ─────────────────────────────────────────────────────────
document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));

// ── Helpers ────────────────────────────────────────────────────────
function showAlert(el, type, text) {
    if (!el) return;
    el.style.display = 'block';
    el.textContent = text;

    const styles = {
        error:   { bg: 'var(--red-faint)',    border: 'rgba(239,68,68,0.25)',   color: 'var(--red)' },
        success: { bg: 'var(--green-faint)',   border: 'rgba(34,197,94,0.25)',   color: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', border: 'rgba(99,102,241,0.25)', color: 'var(--accent-light)' },
    };

    const s = styles[type] || styles.error;
    el.style.background   = s.bg;
    el.style.borderColor  = s.border;
    el.style.color        = s.color;
    el.style.border       = `1px solid ${s.border}`;
}

function getFriendlyError(code) {
    const map = {
        'auth/user-not-found':        'No account found with this email address.',
        'auth/wrong-password':         'Incorrect password. Please try again.',
        'auth/invalid-email':          'Please enter a valid email address.',
        'auth/too-many-requests':      'Too many failed attempts. Please try again later.',
        'auth/email-already-in-use':   'This email is already registered. Sign in instead.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/invalid-credential':     'Invalid email or password. Please try again.',
        'auth/network-request-failed': 'Network error. Check your internet connection.',
    };
    return map[code] ?? 'An unexpected error occurred. Please try again.';
}