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

// ── Submit new ticket ──────────────────────────────────────────────
ticketForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const payload = {
        titulo:     document.getElementById('titulo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        depto:      document.getElementById('departamento').value,
        prioridad:  document.getElementById('prioridad').value,
        timestamp:  serverTimestamp(),
        operator:   auth.currentUser?.email ?? 'unknown'
    };

    try {
        await addDoc(collection(db, "tickets"), payload);
        e.target.reset();
    } catch (error) {
        console.error("Ticket submission failed:", error);
        alert("Failed to submit ticket. Please try again.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send"></i> Submit Ticket';
    }
});

// ── Real-time listener ─────────────────────────────────────────────
const q = query(collection(db, "tickets"), orderBy("timestamp", "desc"));

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

    document.getElementById('ticketCount').textContent = tickets.length;

    if (tickets.length === 0) {
        ticketsBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    ticketsBody.innerHTML = tickets.map(t => `
        <tr class="fade-in">
            <td>
                <span class="ticket-id">#${t.id.slice(-6).toUpperCase()}</span>
            </td>
            <td>
                <div class="ticket-subject">${escHtml(t.titulo)}</div>
                <div class="ticket-operator">${escHtml(t.operator)}</div>
            </td>
            <td><span class="prio-tag prio-${t.prioridad}">${t.prioridad}</span></td>
            <td><span class="dept-badge">${escHtml(t.depto)}</span></td>
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
    const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    tickets.forEach(t => { if (counts[t.prioridad] !== undefined) counts[t.prioridad]++; });

    ['P0','P1','P2','P3'].forEach(p => {
        const el = document.getElementById(`count${p}`);
        if (el) el.textContent = counts[p];
    });

    const navCount = document.getElementById('navTicketCount');
    if (navCount) navCount.textContent = tickets.length;
}

// ── Filter ─────────────────────────────────────────────────────────
function filterTickets(tickets, query) {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(t =>
        t.titulo?.toLowerCase().includes(q) ||
        t.operator?.toLowerCase().includes(q) ||
        t.id.slice(-6).toLowerCase().includes(q) ||
        t.depto?.toLowerCase().includes(q)
    );
}

// ── Delete ─────────────────────────────────────────────────────────
window.purgeTicket = async (id) => {
    if (!confirm("Are you sure you want to delete this ticket? This action cannot be undone.")) return;
    try {
        await deleteDoc(doc(db, "tickets", id));
    } catch (e) {
        alert("Failed to delete ticket.");
    }
};

// ── Utils ──────────────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}