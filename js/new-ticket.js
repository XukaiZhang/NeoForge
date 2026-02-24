import { db, auth } from './config.js';
import {
    collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const form       = document.getElementById('ticketForm');
const submitBtn  = document.getElementById('submitBtn');
const statusEl   = document.getElementById('formStatus');

form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo      = document.getElementById('titulo')?.value.trim();
    const descripcion = document.getElementById('descripcion')?.value.trim();
    const depto       = document.getElementById('departamento')?.value;
    const prioridad   = document.getElementById('prioridad')?.value;
    const assignee    = document.getElementById('assignee')?.value;

    // Client-side validation
    if (!titulo) {
        showStatus('error', 'Por favor indica un asunto para el ticket.');
        document.getElementById('titulo')?.focus();
        return;
    }

    if (!descripcion) {
        showStatus('error', 'Por favor añade una descripción antes de enviar.');
        document.getElementById('descripcion')?.focus();
        return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Enviando…';
    showStatus('loading', 'Creando ticket…');

    try {
        const docRef = await addDoc(collection(db, 'tickets'), {
            titulo,
            descripcion,
            depto,
            prioridad,
            assignee: assignee || null,
            timestamp: serverTimestamp(),
            operator: auth.currentUser?.email ?? 'unknown',
            status: 'open',
        });

        showStatus('success', `Ticket #${docRef.id.slice(-6).toUpperCase()} creado correctamente. Redirigiendo…`);

        // Redirect after short delay so user sees the success message
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1400);

    } catch (err) {
        console.error('Error al crear el ticket:', err);
        showStatus('error', 'Error al crear el ticket. Por favor inténtalo de nuevo.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-send-fill"></i> Enviar Ticket';
    }
});

// ── Status helper ──────────────────────────────────────────────────
function showStatus(type, message) {
    if (!statusEl) return;

    const styles = {
        error:   { bg: 'var(--red-faint)',    border: 'rgba(239,68,68,0.25)',   color: 'var(--red)' },
        success: { bg: 'var(--green-faint)',  border: 'rgba(34,197,94,0.25)',   color: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', border: 'rgba(99,102,241,0.25)', color: 'var(--accent-light)' },
    };

    const s = styles[type] || styles.error;
    statusEl.style.display    = 'block';
    statusEl.style.background = s.bg;
    statusEl.style.border     = `1px solid ${s.border}`;
    statusEl.style.color      = s.color;
    statusEl.textContent      = message;
}