import { db, auth } from './config.js';
import {
    collection, onSnapshot, query, orderBy,
    doc, deleteDoc, updateDoc, addDoc, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

// ── State ──────────────────────────────────────────────────────────
let allTickets  = [];
let sortCol     = 'timestamp';
let sortDir     = 'desc';
let currentPage = 1;
const PAGE_SIZE = 15;

// ── DOM refs ───────────────────────────────────────────────────────
const ticketsBody   = document.getElementById('ticketsBody');
const searchInput   = document.getElementById('ticketSearch');
const filterPrio    = document.getElementById('filterPrio');
const filterDept    = document.getElementById('filterDept');
const filterStatus  = document.getElementById('filterStatus');
const emptyState    = document.getElementById('emptyState');
const emptyMsg      = document.getElementById('emptyStateMsg');
const filterChips   = document.getElementById('filterChips');
const clearBtn      = document.getElementById('btnClearFilters');
const btnPrev       = document.getElementById('btnPrevPage');
const btnNext       = document.getElementById('btnNextPage');
const pageIndicator = document.getElementById('pageIndicator');
const paginationInfo= document.getElementById('paginationInfo');
const activityFeed  = document.getElementById('activityFeed');

// ── Firestore real-time listener ───────────────────────────────────
const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));

onSnapshot(q, (snapshot) => {
    allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCounters(allTickets);
    buildMiniDonut(allTickets);
    buildActivityFeed(allTickets);
    currentPage = 1;
    applyAndRender();
});

// ── Filter & sort triggers ─────────────────────────────────────────
searchInput?.addEventListener('input',  () => { currentPage = 1; applyAndRender(); });
filterPrio?.addEventListener('change',  () => { currentPage = 1; applyAndRender(); syncFilterChips(); syncStatCards(); });
filterDept?.addEventListener('change',  () => { currentPage = 1; applyAndRender(); syncFilterChips(); });
filterStatus?.addEventListener('change',() => { currentPage = 1; applyAndRender(); syncFilterChips(); });

clearBtn?.addEventListener('click', () => {
    if (filterPrio)   filterPrio.value   = '';
    if (filterDept)   filterDept.value   = '';
    if (filterStatus) filterStatus.value = '';
    if (searchInput)  searchInput.value  = '';
    document.querySelectorAll('.stat-card-clickable').forEach(c => c.classList.remove('stat-active'));
    currentPage = 1;
    applyAndRender();
    syncFilterChips();
});

// ── Sorting ────────────────────────────────────────────────────────
document.querySelectorAll('.th-sort').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortCol = col;
            sortDir = 'asc';
        }
        document.querySelectorAll('.th-sort').forEach(t => {
            t.classList.remove('sort-asc','sort-desc');
        });
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        currentPage = 1;
        applyAndRender();
    });
});

// ── Pagination ─────────────────────────────────────────────────────
btnPrev?.addEventListener('click', () => { currentPage--; applyAndRender(); });
btnNext?.addEventListener('click', () => { currentPage++; applyAndRender(); });

// ── Drawer comment submit ──────────────────────────────────────────
document.getElementById('drawerCommentSubmit')?.addEventListener('click', async () => {
    const input     = document.getElementById('drawerCommentInput');
    const statusSel = document.getElementById('drawerStatusChange');
    const drawer    = document.getElementById('ticketDrawer');
    const ticketId  = drawer?.dataset.ticketId;
    const text      = input?.value.trim();
    const newStatus = statusSel?.value;

    if (!ticketId) return;
    if (!text && !newStatus) return;

    const updates = {};
    if (newStatus) updates.status = newStatus;

    if (text) {
        updates.activity = arrayUnion({
            text,
            author: auth.currentUser?.email ?? 'Unknown',
            ts:     new Date().toISOString(),
        });
    }

    try {
        await updateDoc(doc(db, 'tickets', ticketId), updates);
        if (input)     input.value = '';
        if (statusSel) statusSel.value = '';
    } catch (e) {
        console.error('Failed to update ticket:', e);
    }
});

// ── Core pipeline ──────────────────────────────────────────────────
function applyAndRender() {
    const filtered = applyFilters(allTickets);
    const sorted   = sortTickets(filtered);
    renderPagination(sorted);
    const page = paginate(sorted);
    renderTickets(page, sorted.length);
}

function applyFilters(tickets) {
    const search = searchInput?.value.toLowerCase().trim() ?? '';
    const prio   = filterPrio?.value  ?? '';
    const dept   = filterDept?.value  ?? '';
    const status = filterStatus?.value ?? '';

    return tickets.filter(t => {
        const matchSearch = !search ||
            (t.titulo   || '').toLowerCase().includes(search) ||
            (t.operator || '').toLowerCase().includes(search) ||
            t.id.slice(-6).toLowerCase().includes(search)     ||
            (t.depto    || '').toLowerCase().includes(search);

        return matchSearch &&
            (!prio   || t.prioridad === prio)  &&
            (!dept   || t.depto    === dept)   &&
            (!status || (t.status || 'open') === status);
    });
}

function sortTickets(tickets) {
    return [...tickets].sort((a, b) => {
        let va, vb;
        if (sortCol === 'timestamp') {
            va = a.timestamp?.seconds ?? 0;
            vb = b.timestamp?.seconds ?? 0;
        } else if (sortCol === 'prioridad') {
            const order = { P0:0, P1:1, P2:2, P3:3 };
            va = order[a.prioridad] ?? 9;
            vb = order[b.prioridad] ?? 9;
        } else {
            va = (a[sortCol] || '').toLowerCase();
            vb = (b[sortCol] || '').toLowerCase();
        }
        if (va < vb) return sortDir === 'asc' ? -1 :  1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
    });
}

function paginate(tickets) {
    const start = (currentPage - 1) * PAGE_SIZE;
    return tickets.slice(start, start + PAGE_SIZE);
}

function renderPagination(filtered) {
    const total     = filtered.length;
    const totalPages= Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage     = Math.min(currentPage, totalPages);

    const start = Math.min((currentPage - 1) * PAGE_SIZE + 1, total);
    const end   = Math.min(currentPage * PAGE_SIZE, total);

    if (pageIndicator)  pageIndicator.textContent  = `${currentPage} / ${totalPages}`;
    if (paginationInfo) paginationInfo.textContent = `Showing ${total === 0 ? 0 : start}–${end} of ${total}`;
    if (btnPrev)  btnPrev.disabled  = currentPage <= 1;
    if (btnNext)  btnNext.disabled  = currentPage >= totalPages;
}

// ── Render table ───────────────────────────────────────────────────
function renderTickets(tickets, totalFiltered) {
    if (!ticketsBody) return;

    const countEl = document.getElementById('ticketCount');
    if (countEl) countEl.textContent = totalFiltered;

    const hasResults = tickets.length > 0;

    if (emptyState) emptyState.style.display = hasResults ? 'none' : 'flex';
    if (!hasResults) {
        ticketsBody.innerHTML = '';
        if (emptyMsg) emptyMsg.textContent = totalFiltered === 0 && allTickets.length > 0
            ? 'No tickets match your current filters.'
            : 'No tickets yet. Create your first incident report.';
        return;
    }

    ticketsBody.innerHTML = tickets.map(t => {
        const timeStr  = formatTime(t.timestamp);
        const status   = t.status || 'open';
        const prioClass = { P0:'critical', P1:'high', P2:'medium', P3:'low' }[t.prioridad] ?? 'low';

        return `
        <tr class="fade-in" onclick="openDrawer(${JSON.stringify(t).replace(/"/g,'&quot;')})">
            <td><span class="ticket-id">#${t.id.slice(-6).toUpperCase()}</span></td>
            <td>
                <div class="ticket-subject" title="${esc(t.titulo)}">${esc(t.titulo)}</div>
            </td>
            <td><span class="prio-tag prio-${t.prioridad}">${t.prioridad}</span></td>
            <td><span class="dept-badge">${esc(t.depto || '—')}</span></td>
            <td><span class="ticket-operator" title="${esc(t.operator)}">${esc(shortEmail(t.operator))}</span></td>
            <td style="font-size:0.74rem;color:var(--text-tertiary);font-family:var(--font-mono);white-space:nowrap;">${timeStr}</td>
            <td><span class="status-badge status-${status.replace(' ','-')}">${status}</span></td>
            <td onclick="event.stopPropagation()">
                <button class="btn-row-delete" onclick="purgeTicket('${t.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── Counters ───────────────────────────────────────────────────────
function updateCounters(tickets) {
    const c = { P0:0, P1:0, P2:0, P3:0 };
    tickets.forEach(t => { if (c[t.prioridad] !== undefined) c[t.prioridad]++; });
    ['P0','P1','P2','P3'].forEach(p => {
        const el = document.getElementById(`count${p}`);
        if (el) el.textContent = c[p];
    });
    const nav = document.getElementById('navTicketCount');
    if (nav) nav.textContent = tickets.length;
}

// ── Mini donut ─────────────────────────────────────────────────────
function buildMiniDonut(tickets) {
    const svg     = document.getElementById('miniDonutSvg');
    const legend  = document.getElementById('miniLegend');
    const totalEl = document.getElementById('miniDonutTotal');
    if (!svg) return;

    const total = tickets.length;
    if (totalEl) totalEl.textContent = total;

    const config = [
        { key:'P0', label:'P0 Critical', color:'#ef4444' },
        { key:'P1', label:'P1 High',     color:'#f97316' },
        { key:'P2', label:'P2 Medium',   color:'#eab308' },
        { key:'P3', label:'P3 Low',      color:'#6366f1' },
    ];

    const counts = {};
    config.forEach(c => counts[c.key] = 0);
    tickets.forEach(t => { if (counts[t.prioridad] !== undefined) counts[t.prioridad]++; });

    const r = 32;
    const cx = 40, cy = 40;
    const circ = 2 * Math.PI * r;

    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-hover)" stroke-width="10"/>`;

    let offset = 0;
    config.forEach(c => {
        const pct  = total > 0 ? counts[c.key] / total : 0;
        const dash = pct * circ;
        if (dash > 0) {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke', c.color);
            el.setAttribute('stroke-width', '10');
            el.setAttribute('stroke-dasharray', `${dash} ${circ}`);
            el.setAttribute('stroke-dashoffset', -offset);
            svg.appendChild(el);
            offset += dash;
        }
    });

    if (legend) {
        legend.innerHTML = config.map(c => `
            <div class="mini-legend-item">
                <div class="mini-legend-dot" style="background:${c.color}"></div>
                <span>${c.label}</span>
                <strong>${counts[c.key]}</strong>
            </div>
        `).join('');
    }
}

// ── Activity feed (sidebar) ────────────────────────────────────────
function buildActivityFeed(tickets) {
    if (!activityFeed) return;

    // Show the 8 most recent tickets as activity
    const recent = [...tickets]
        .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0))
        .slice(0, 8);

    if (recent.length === 0) {
        activityFeed.innerHTML = '<div class="activity-empty">No activity yet</div>';
        return;
    }

    const dotClass = { P0:'critical', P1:'high', P2:'medium', P3:'low' };

    activityFeed.innerHTML = recent.map(t => `
        <div class="feed-item" onclick="openDrawer(${JSON.stringify(t).replace(/"/g,'&quot;')})">
            <div class="feed-dot ${dotClass[t.prioridad] ?? 'low'}"></div>
            <div class="feed-content">
                <div class="feed-subject">${esc(t.titulo || 'Untitled')}</div>
                <div class="feed-meta">${t.prioridad} · ${esc(t.depto || '—')} · ${timeAgo(t.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

// ── Filter chips ───────────────────────────────────────────────────
function syncFilterChips() {
    if (!filterChips) return;
    const chips = [];
    if (filterPrio?.value)   chips.push({ label: filterPrio.value,   el: filterPrio });
    if (filterDept?.value)   chips.push({ label: filterDept.value,   el: filterDept });
    if (filterStatus?.value) chips.push({ label: filterStatus.value, el: filterStatus });

    filterChips.innerHTML = chips.map((c, i) => `
        <span class="filter-chip" data-chip="${i}">${esc(c.label)} ×</span>
    `).join('');

    filterChips.querySelectorAll('.filter-chip').forEach((chip, i) => {
        chip.addEventListener('click', () => {
            chips[i].el.value = '';
            currentPage = 1;
            applyAndRender();
            syncFilterChips();
            syncStatCards();
        });
    });

    if (clearBtn) clearBtn.style.display = chips.length > 0 ? 'flex' : 'none';
}

function syncStatCards() {
    const prio = filterPrio?.value ?? '';
    document.querySelectorAll('.stat-card-clickable').forEach(c => {
        c.classList.toggle('stat-active', c.dataset.filterPrio === prio && prio !== '');
    });
}

// ── Delete ─────────────────────────────────────────────────────────
window.purgeTicket = async (id) => {
    if (!confirm('Delete this ticket permanently?')) return;
    try { await deleteDoc(doc(db, 'tickets', id)); }
    catch (e) { alert('Failed to delete ticket.'); }
};

// ── Helpers ────────────────────────────────────────────────────────
function esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shortEmail(email = '') {
    return email.split('@')[0];
}

function formatTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' });
}

function timeAgo(ts) {
    if (!ts) return '—';
    const d    = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
}

// Expose for inline HTML onclick
window.openDrawer = window.openDrawer || (() => {});
window.timeAgo    = timeAgo;
window.esc        = esc;