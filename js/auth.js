import { auth } from './config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const isLogin = window.location.pathname.includes('login.html');
    const loader = document.getElementById('kernel-loader');
    
    if (loader) loader.style.width = "100%";

    if (!user && !isLogin) {
        window.location.href = 'login.html';
    } else if (user && isLogin) {
        window.location.href = 'dashboard.html';
    }

    if (user && document.getElementById('userEmail')) {
        document.getElementById('userEmail').textContent = user.email.toLowerCase();
    }
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('status-msg');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        msg.style.color = "#64748b";
        msg.textContent = "Validando credenciales...";
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        msg.style.color = "#ef4444";
        msg.textContent = "Error: Credenciales no válidas.";
    }
});

document.getElementById('btnRegister')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Por favor, rellena los campos.");
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cuenta creada con éxito.");
    } catch (err) { alert("Error: " + err.message); }
});

document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));