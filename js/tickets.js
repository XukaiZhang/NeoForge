import { db, auth } from './config.js';
import { 
    collection, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const ticketsBody  = document.getElementById('ticketsBody');
const searchInput  = document.getElementById('ticketSearch');
const filterPrio   = document.getElementById('filterPrio');
const filterDept   = document.getElementById('filterDept');
const emptyState   = document.getElementById('emptyState');

let allTickets = [];

// ── Real-time listener ─────────────────────────────────────────────
const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));

onSnapshot(q, (snapshot) => {
    allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCounters(allTickets);
    applyFilters();
});

// ── Filter triggers ────────────────────────────────────────────────
searchInput?.addEventListener('input',  applyFilters);
filterPrio?.addEventListener('change',  applyFilters);
filterDept?.addEventListener('change',  applyFilters);

function applyFilters() {
    const search = searchInput?.value.toLowerCase().trim() ?? '';
    const prio   = filterPrio?.value  ?? '';
    const dept   = filterDept?.value  ?? '';

    const filtered = allTickets.filter(t => {
        const matchSearch = !search ||
            t.titulo?.toLowerCase().includes(search) ||
            t.operator?.toLowerCase().includes(search) ||
            t.id.slice(-6).toLowerCase().includes(search) ||
            t.depto?.toLowerCase().includes(search);

        const matchPrio = !prio || t.prioridad === prio;
        const matchDept = !dept || t.depto === dept;

        return matchSearch && matchPrio && matchDept;
    });

    renderTickets(filtered);
}

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
            </td>
            <td><span class="prio-tag prio-${t.prioridad}">${t.prioridad}</span></td>
            <td><span class="dept-badge">${esc(t.depto)}</span></td>
            <td><span class="ticket-operator">${esc(t.operator)}</span></td>
            <td><span class="sla-active">Active</span></td>
            <td>
                <button onclick="purgeTicket('${t.id}')" class="btn-purge">
                    <i class="bi bi-trash"></i>
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