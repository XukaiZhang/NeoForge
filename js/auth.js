import { auth } from './config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ── Session Guardian ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    const isLogin = window.location.pathname.includes('login.html');
    const loader  = document.getElementById('kernel-loader');

    if (loader) loader.style.width = "100%";

    if (!user && !isLogin) {
        window.location.href = 'login.html';
        return;
    }
    if (user && isLogin) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Populate user email in topbar/sidebar
    if (user) {
        const emailEl = document.getElementById('userEmail');
        if (emailEl) emailEl.textContent = user.email;
    }
});

// ── Login Handler ──────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput    = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const msg           = document.getElementById('status-msg');
    const btn           = e.target.querySelector('button[type="submit"]');

    setStatus(msg, 'loading', 'Authenticating…');
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        // onAuthStateChanged will redirect
    } catch (err) {
        const friendly = getFriendlyError(err.code);
        setStatus(msg, 'error', friendly);
        btn.disabled = false;
    }
});

// ── Register Handler ───────────────────────────────────────────────
document.getElementById('btnRegister')?.addEventListener('click', async () => {
    const emailInput    = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const msg           = document.getElementById('status-msg');

    if (!emailInput.value || !passwordInput.value) {
        setStatus(msg, 'error', 'Please fill in email and password before registering.');
        return;
    }

    try {
        await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        setStatus(msg, 'success', 'Account created successfully. Signing you in…');
    } catch (err) {
        setStatus(msg, 'error', getFriendlyError(err.code));
    }
});

// ── Logout ─────────────────────────────────────────────────────────
document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));

// ── Helpers ────────────────────────────────────────────────────────
function setStatus(el, type, text) {
    if (!el) return;
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'status-alert';
    if (type === 'error')   el.style.cssText = '';
    if (type === 'success') {
        el.style.background = 'var(--green-faint)';
        el.style.borderColor = 'rgba(34,197,94,0.25)';
        el.style.color = 'var(--green)';
    }
    if (type === 'loading') {
        el.style.background = 'var(--accent-faint)';
        el.style.borderColor = 'rgba(99,102,241,0.25)';
        el.style.color = 'var(--accent-light)';
    }
}

function getFriendlyError(code) {
    const map = {
        'auth/user-not-found':     'No account found with this email address.',
        'auth/wrong-password':     'Incorrect password. Please try again.',
        'auth/invalid-email':      'Please enter a valid email address.',
        'auth/too-many-requests':  'Too many attempts. Please wait before trying again.',
        'auth/email-already-in-use': 'This email is already registered. Sign in instead.',
        'auth/weak-password':      'Password must be at least 6 characters.',
        'auth/invalid-credential': 'Invalid credentials. Check your email and password.',
    };
    return map[code] || 'An unexpected error occurred. Please try again.';
}