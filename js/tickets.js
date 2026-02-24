import { db, auth } from './config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const ticketForm  = document.getElementById('ticketForm');
const ticketsBody = document.getElementById('ticketsBody');
const searchInput = document.getElementById('ticketSearch');
const emptyState  = document.getElementById('emptyState');

let allTickets = [];

// ── Submit ─────────────────────────────────────────────────────────
ticketForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting…';

    const payload = {
        titulo:      document.getElementById('titulo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        depto:       document.getElementById('departamento').value,
        prioridad:   document.getElementById('prioridad').value,
        timestamp:   serverTimestamp(),
        operator:    auth.currentUser?.email ?? 'unknown'
    };

    try {
        await addDoc(collection(db, 'tickets'), payload);
        e.target.reset();
    } catch (err) {
        console.error('Ticket submission failed:', err);
        alert('Failed to submit ticket. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send"></i> Submit Ticket';
    }
});

// ── Real-time ──────────────────────────────────────────────────────
const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));

onSnapshot(q, (snapshot) => {
    allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCounters(allTickets);
    renderTickets(filterTickets(allTickets, searchInput?.value ?? ''));
});

// ── Search ─────────────────────────────────────────────────────────
searchInput?.addEventListener('input', () => {
    renderTickets(filterTickets(allTickets, searchInput.value));
});

// ── Render ─────────────────────────────────────────────────────────
function renderTickets(tickets) {
    if (!ticketsBody) return;

    const countEl = document.getElementById('ticketCount');
    if (countEl) countEl.textContent = tickets.length;

    if (tickets.length === 0) {
        ticketsBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    ticketsBody.innerHTML = tickets.map(t => `
        <tr class="fade-in">
            <td><span class="ticket-id">#${t.id.slice(-6).toUpperCase()}</span></td>
            <td>
                <div class="ticket-subject">${esc(t.titulo)}</div>
                <div class="ticket-operator">${esc(t.operator)}</div>
            </td>
            <td><span class="prio-tag prio-${t.prioridad}">${t.prioridad}</span></td>
            <td><span class="dept-badge">${esc(t.depto)}</span></td>
            <td><span class="sla-active">Active</span></td>
            <td>
                <button onclick="purgeTicket('${t.id}')" class="btn-purge">
                    <i class="bi bi-trash"></i> Delete
                </button>
            </td>
        </tr>
    `).join('');
}

// ── Counters ───────────────────────────────────────────────────────
function updateCounters(tickets) {
    const c = { P0: 0, P1: 0, P2: 0, P3: 0 };
    tickets.forEach(t => { if (c[t.prioridad] !== undefined) c[t.prioridad]++; });

    ['P0','P1','P2','P3'].forEach(p => {
        const el = document.getElementById(`count${p}`);
        if (el) el.textContent = c[p];
    });

    const nav = document.getElementById('navTicketCount');
    if (nav) nav.textContent = tickets.length;
}

// ── Filter ─────────────────────────────────────────────────────────
function filterTickets(tickets, q) {
    if (!q.trim()) return tickets;
    const s = q.toLowerCase();
    return tickets.filter(t =>
        t.titulo?.toLowerCase().includes(s) ||
        t.operator?.toLowerCase().includes(s) ||
        t.id.slice(-6).toLowerCase().includes(s) ||
        t.depto?.toLowerCase().includes(s)
    );
}

// ── Delete ─────────────────────────────────────────────────────────
window.purgeTicket = async (id) => {
    if (!confirm('Delete this ticket permanently? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'tickets', id));
    } catch (e) {
        alert('Failed to delete ticket.');
    }
};

function esc(s = '') {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}