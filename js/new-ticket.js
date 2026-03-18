import { db, auth } from './config.js';
import {
    collection, addDoc, serverTimestamp,
    getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import './auth.js';
import { populateSelect, subscribeDepts } from './departamentos.js';

const form      = document.getElementById('ticketForm');
const submitBtn = document.getElementById('submitBtn');
const statusEl  = document.getElementById('formStatus');

// ── Populate nav badge + real agent list ───────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;

    populateSelect('departamento');

    // Populate contacts sidebar dynamically
    subscribeDepts(depts => {
        const list = document.getElementById('deptContactsList');
        if (!list) return;
        list.innerHTML = depts.map(d => `
            <div class="contact-row">
                <div class="contact-avatar" style="background:var(--accent-faint);color:var(--accent-light);border:1px solid rgba(99,102,241,0.2)">${d.icono || d.nombre.slice(0,2).toUpperCase()}</div>
                <div class="contact-info">
                    <span class="contact-name">${d.nombre} Team</span>
                    ${d.descripcion ? `<span class="contact-tag">${d.descripcion}</span>` : ''}
                </div>
            </div>`).join('');
    });

    try {
        const snap = await getDocs(query(collection(db, 'tickets'), where('status', '==', 'open')));
        const el = document.getElementById('navTicketCount');
        if (el) el.textContent = snap.size;
    } catch {}

    // FIX: populate assignee dropdown with real agents from Firestore
    try {
        const agSnap = await getDocs(query(collection(db, 'usuarios'), where('rol', '==', 'agente')));
        const sel = document.getElementById('assignee');
        if (sel && !agSnap.empty) {
            sel.innerHTML = '<option value="">Sin asignar</option>';
            agSnap.docs.forEach(d => {
                const data = d.data();
                const opt  = document.createElement('option');
                opt.value       = data.email;
                opt.textContent = data.nombre || data.email;
                sel.appendChild(opt);
            });
        }
    } catch {}
});

// ── Auto-assign: find agent with fewest active tickets in dept ────
async function autoAssign(depto) {
    try {
        // Get all agents (with or without dept filter)
        const agSnap = await getDocs(query(collection(db, 'usuarios'), where('rol', 'in', ['agente', 'admin'])));
        if (agSnap.empty) return null;

        const agents = agSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

        // Prefer agents from same department
        const deptAgents = agents.filter(a => a.departamento === depto);
        const pool = deptAgents.length > 0 ? deptAgents : agents;

        // Count active tickets per agent
        const ticketSnap = await getDocs(
            query(collection(db, 'tickets'), where('status', 'in', ['open', 'in-progress']))
        );
        const counts = {};
        pool.forEach(a => { counts[a.email] = 0; });
        ticketSnap.docs.forEach(d => {
            const email = d.data().assignedEmail;
            if (email && counts[email] !== undefined) counts[email]++;
        });

        // Pick agent with lowest count
        const best = pool.reduce((min, a) =>
            (counts[a.email] ?? 0) < (counts[min.email] ?? 0) ? a : min
        , pool[0]);

        return best?.email ?? null;
    } catch (e) {
        console.warn('Auto-assign failed:', e);
        return null;
    }
}

form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;

    const titulo      = document.getElementById('titulo')?.value.trim();
    const descripcion = document.getElementById('descripcion')?.value.trim();
    const depto       = document.getElementById('departamento')?.value;
    const prioridad   = document.getElementById('prioridad')?.value;
    const manualAssignee = document.getElementById('assignee')?.value;

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

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Enviando…';
    showStatus('loading', 'Creando ticket…');

    try {
        // Auto-assign if no manual assignee selected
        let assignee = manualAssignee || null;
        if (!assignee) {
            showStatus('loading', 'Asignando agente automáticamente…');
            assignee = await autoAssign(depto);
        }

        const docRef = await addDoc(collection(db, 'tickets'), {
            titulo,
            descripcion,
            depto,
            prioridad,
            assignee:      assignee || null,
            assignedEmail: assignee || null,
            timestamp:     serverTimestamp(),
            operator:      user?.email ?? 'unknown',
            ownerUid:      user?.uid   ?? null,
            ownerEmail:    user?.email ?? null,
            status:        'open',
            activity:      [],
        });

        const assignMsg = assignee ? ` · Asignado a ${assignee.split('@')[0]}` : '';
        showStatus('success', `Ticket #${docRef.id.slice(-6).toUpperCase()} creado correctamente.${assignMsg} Redirigiendo…`);
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1800);

    } catch (err) {
        console.error('Error al crear el ticket:', err);
        showStatus('error', 'Error al crear el ticket. Por favor inténtalo de nuevo.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-send-fill"></i> Enviar Ticket';
    }
});

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