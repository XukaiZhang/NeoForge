import { db, auth } from './config.js';
import {
    collection, query, where, orderBy, onSnapshot,
    getDocs, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import './auth.js';
import { swalConfirm, swalToast } from './swal.js';
import { populateSelect } from './departamentos.js';

let allAgentes     = [];
let allEmpleados   = [];
let empleadoSearch = '';
let allTickets     = [];
let searchTerm     = '';
let filterDept     = '';

// ── Init ───────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
        const snap = await getDocs(query(collection(db, 'tickets'), where('status', '==', 'open')));
        const el = document.getElementById('navTicketCount');
        if (el) el.textContent = snap.size;
    } catch {}
    populateSelect('filterDeptAgente', { includeAll: true });
    subscribeAgentes();
    subscribeEmpleados();
    subscribeTickets();
});

// ── Agentes listener ──────────────────────────────────────────────
function subscribeAgentes() {
    const q = query(collection(db, 'usuarios'),
        where('rol', 'in', ['agente', 'admin']));
    onSnapshot(q, snap => {
        allAgentes = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderAll();
    }, err => {
        // Fallback: get all usuarios and filter client-side
        onSnapshot(collection(db, 'usuarios'), snap => {
            allAgentes = snap.docs
                .map(d => ({ uid: d.id, ...d.data() }))
                .filter(u => u.rol === 'agente' || u.rol === 'admin');
            renderAll();
        });
    });
}

// ── Empleados listener ───────────────────────────────────────────
function subscribeEmpleados() {
    const q = query(collection(db, 'usuarios'), where('rol', '==', 'cliente'));
    onSnapshot(q, snap => {
        allEmpleados = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderEmpleados();
    }, err => {
        // Fallback sin where
        onSnapshot(collection(db, 'usuarios'), snap => {
            allEmpleados = snap.docs
                .map(d => ({ uid: d.id, ...d.data() }))
                .filter(u => !u.rol || u.rol === 'cliente');
            renderEmpleados();
        });
    });
}

// ── Render empleados ──────────────────────────────────────────────
function renderEmpleados() {
    const tbody  = document.getElementById('empleadosBody');
    const empty  = document.getElementById('empleadosEmpty');
    const countEl= document.getElementById('empleadoCount');
    if (!tbody) return;

    let filtered = allEmpleados;
    if (empleadoSearch.trim()) {
        const s = empleadoSearch.toLowerCase();
        filtered = filtered.filter(u =>
            (u.nombre || '').toLowerCase().includes(s) ||
            (u.email  || '').toLowerCase().includes(s)
        );
    }

    if (countEl) countEl.textContent = allEmpleados.length;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = filtered.map(u => {
        const nombre  = u.nombre || u.email?.split('@')[0] || '—';
        const inicial = nombre.charAt(0).toUpperCase();
        const abiertos= allTickets.filter(t => t.ownerUid === u.uid && ['open','in-progress'].includes(t.status || 'open')).length;
        const total   = allTickets.filter(t => t.ownerUid === u.uid || t.ownerEmail === u.email).length;
        return `
        <tr>
            <td>
                <div class="ag-cell-user">
                    <div class="ag-mini-avatar" style="background:var(--bg-hover);color:var(--text-secondary);border-color:var(--border-default)">${esc(inicial)}</div>
                    <div>
                        <div class="ag-name">${esc(nombre)}</div>
                        <div class="ag-email">${esc(u.email || '—')}</div>
                    </div>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-secondary)">${esc(u.email || '—')}</td>
            <td><span class="ag-num" style="color:${abiertos > 0 ? 'var(--yellow)' : 'var(--text-tertiary)'}">${abiertos}</span></td>
            <td><span class="ag-num">${total}</span></td>
        </tr>`;
    }).join('');
}

// ── Tickets listener ──────────────────────────────────────────────
function subscribeTickets() {
    onSnapshot(
        query(collection(db, 'tickets'), orderBy('timestamp', 'desc')),
        snap => {
            allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderAll();
        },
        err => {
            console.warn('tickets orderBy failed, retrying:', err.message);
            onSnapshot(collection(db, 'tickets'), snap => {
                allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a,b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0));
                renderAll();
            });
        }
    );
}

// ── Render everything ─────────────────────────────────────────────
function renderAll() {
    renderStats();
    renderTable();
    renderEmpleados();
    renderUnassigned();
    renderRanking();
    renderDeptBars();
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const asignados     = allTickets.filter(t => t.assignedEmail && ['open','in-progress'].includes(t.status || 'open')).length;
    const sinAsignar    = allTickets.filter(t => !t.assignedEmail && ['open','in-progress'].includes(t.status || 'open')).length;
    const resueltos30d  = allTickets.filter(t => {
        if (!['resolved','closed'].includes(t.status)) return false;
        const ts = t.timestamp?.toDate?.() ?? new Date(t.timestamp ?? 0);
        return ts.getTime() > thirtyDaysAgo;
    }).length;
    _set('statTotalAgentes', allAgentes.length);
    _set('statAsignados',    asignados);
    _set('statSinAsignar',   sinAsignar);
    _set('statResueltos30d', resueltos30d);
}

// ── Table ─────────────────────────────────────────────────────────
function renderTable() {
    const tbody  = document.getElementById('agentesBody');
    const countEl= document.getElementById('agenteCount');
    const empty  = document.getElementById('agentesEmpty');
    if (!tbody) return;

    let filtered = allAgentes;
    if (filterDept) filtered = filtered.filter(a => a.departamento === filterDept);
    if (searchTerm) {
        const s = searchTerm.toLowerCase();
        filtered = filtered.filter(a =>
            (a.nombre  || '').toLowerCase().includes(s) ||
            (a.email   || '').toLowerCase().includes(s)
        );
    }

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = filtered.map(a => {
        const nombre   = a.nombre || a.email?.split('@')[0] || '—';
        const inicial  = nombre.charAt(0).toUpperCase();
        const abiertos = allTickets.filter(t => t.assignedEmail === a.email && ['open','in-progress'].includes(t.status || 'open')).length;
        const resueltos= allTickets.filter(t => ['resolved','closed'].includes(t.status) && (t.resolvedBy === a.email || t.assignedEmail === a.email)).length;
        const total    = abiertos + resueltos || 1;
        const pct      = Math.min(Math.round((abiertos / (allAgentes.length || 1)) * 100), 100);
        const barColor = pct > 70 ? 'var(--red)' : pct > 40 ? 'var(--yellow)' : 'var(--green)';
        return `
        <tr data-uid="${a.uid}" style="cursor:pointer">
            <td>
                <div class="ag-cell-user">
                    <div class="ag-mini-avatar">${esc(inicial)}</div>
                    <div>
                        <div class="ag-name">${esc(nombre)}</div>
                        <div class="ag-email">${esc(a.email || '—')}</div>
                    </div>
                </div>
            </td>
            <td><span class="dept-badge">${esc(a.departamento || 'Sin asignar')}</span></td>
            <td><span class="ag-num">${abiertos}</span></td>
            <td><span class="ag-num ag-resolved">${resueltos}</span></td>
            <td>
                <div class="ag-load-bar-wrap">
                    <div class="ag-load-bar" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <div class="ag-load-pct">${abiertos} activos</div>
            </td>
            <td><div class="ag-status-dot"></div></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-uid]').forEach(row => {
        row.addEventListener('click', () => {
            const ag = allAgentes.find(a => a.uid === row.dataset.uid);
            if (ag) openAgenteDrawer(ag);
        });
    });
}

// ── Unassigned feed ───────────────────────────────────────────────
function renderUnassigned() {
    const feed  = document.getElementById('unassignedFeed');
    const badge = document.getElementById('unassignedBadge');
    if (!feed) return;

    const unassigned = allTickets.filter(t => !t.assignedEmail && ['open','in-progress'].includes(t.status || 'open'));
    if (badge) badge.textContent = unassigned.length;

    if (unassigned.length === 0) {
        feed.innerHTML = '<div class="activity-empty">Sin tickets pendientes</div>';
        return;
    }

    feed.innerHTML = unassigned.slice(0, 8).map(t => `
        <div class="uf-item">
            <span class="prio-tag prio-${esc(t.prioridad || 'P3')}" style="flex-shrink:0">${esc(t.prioridad || 'P3')}</span>
            <div class="uf-info">
                <div class="uf-title">${esc(t.titulo || 'Sin asunto')}</div>
                <div class="uf-meta">#${t.id.slice(-6).toUpperCase()} · ${esc(t.depto || '—')}</div>
            </div>
        </div>`).join('');
}

// ── Ranking ───────────────────────────────────────────────────────
function renderRanking() {
    const list = document.getElementById('rankingList');
    if (!list) return;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = {};
    allTickets.forEach(t => {
        if (!['resolved','closed'].includes(t.status)) return;
        const ts = t.timestamp?.toDate?.() ?? new Date(t.timestamp ?? 0);
        if (ts.getTime() < thirtyDaysAgo) return;
        const agent = t.resolvedBy || t.assignedEmail;
        if (agent) counts[agent] = (counts[agent] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) { list.innerHTML = '<div class="activity-empty">Sin datos aún</div>'; return; }

    const max    = sorted[0][1] || 1;
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    list.innerHTML = sorted.map(([email, n], i) => {
        const ag   = allAgentes.find(a => a.email === email);
        const name = ag?.nombre || email.split('@')[0];
        const pct  = Math.round((n / max) * 100);
        return `
        <div class="rk-item">
            <div class="rk-medal">${medals[i]}</div>
            <div class="rk-info">
                <div class="rk-name">${esc(name)}</div>
                <div class="rk-bar-wrap"><div class="rk-bar" style="width:${pct}%"></div></div>
            </div>
            <div class="rk-count">${n}</div>
        </div>`;
    }).join('');
}

// ── Dept bars ─────────────────────────────────────────────────────
function renderDeptBars() {
    const container = document.getElementById('deptLoadBars');
    if (!container) return;

    const depts = {};
    allTickets.filter(t => ['open','in-progress'].includes(t.status || 'open')).forEach(t => {
        const d = t.depto || 'Sin depto';
        depts[d] = (depts[d] || 0) + 1;
    });

    const entries = Object.entries(depts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) { container.innerHTML = '<div class="activity-empty">Sin datos</div>'; return; }

    const max = entries[0][1] || 1;
    container.innerHTML = entries.map(([dept, n]) => `
        <div class="dl-row">
            <div class="dl-label">${esc(dept)}</div>
            <div class="dl-bar-wrap"><div class="dl-bar" style="width:${Math.round((n/max)*100)}%"></div></div>
            <div class="dl-val">${n}</div>
        </div>`).join('');
}

// ── Agente drawer ─────────────────────────────────────────────────
function openAgenteDrawer(ag) {
    const drawer = document.getElementById('agenteDrawer');
    const dov    = document.getElementById('drawerOverlay');
    if (!drawer) return;

    const nombre = ag.nombre || ag.email?.split('@')[0] || '—';
    _set('adUid',    ag.uid?.slice(0,12) + '…');
    _set('adNombre', nombre);

    const tickets = allTickets.filter(t => t.assignedEmail === ag.email);
    const abiertos = tickets.filter(t => ['open','in-progress'].includes(t.status || 'open'));
    const res30 = allTickets.filter(t => {
        if (!['resolved','closed'].includes(t.status)) return false;
        const agent = t.resolvedBy || t.assignedEmail;
        if (agent !== ag.email) return false;
        const ts = t.resolvedAt?.toDate?.() ?? t.timestamp?.toDate?.() ?? new Date(t.timestamp ?? 0);
        return ts.getTime() > Date.now() - 30*24*60*60*1000;
    });

    document.getElementById('adInfoGrid').innerHTML = `
        <div class="ad-info-item"><span>Email</span><strong>${esc(ag.email || '—')}</strong></div>
        <div class="ad-info-item"><span>Rol</span><strong>${esc(ag.rol || 'agente')}</strong></div>
        <div class="ad-info-item"><span>Departamento</span><strong>${esc(ag.departamento || 'Sin asignar')}</strong></div>
        <div class="ad-info-item"><span>Resueltos (30d)</span><strong>${res30.length}</strong></div>`;

    const ticketsList = document.getElementById('adTicketsList');
    if (ticketsList) {
        if (abiertos.length === 0) {
            ticketsList.innerHTML = '<div class="activity-empty">Sin tickets asignados</div>';
        } else {
            ticketsList.innerHTML = abiertos.slice(0,6).map(t => `
                <div class="ad-ticket-row">
                    <span class="prio-tag prio-${esc(t.prioridad||'P3')}">${esc(t.prioridad||'P3')}</span>
                    <div class="ad-ticket-info">
                        <span class="ad-ticket-title">${esc(t.titulo||'Sin asunto')}</span>
                        <span class="ad-ticket-meta">#${t.id.slice(-6).toUpperCase()} · ${esc(t.depto||'—')}</span>
                    </div>
                </div>`).join('');
        }
    }

    // Populate unassigned dropdown
    const sel = document.getElementById('adTicketToAssign');
    if (sel) {
        const unassigned = allTickets.filter(t => !t.assignedEmail && ['open','in-progress'].includes(t.status||'open'));
        sel.innerHTML = '<option value="">Seleccionar ticket sin asignar…</option>' +
            unassigned.map(t => `<option value="${t.id}">#${t.id.slice(-6).toUpperCase()} — ${esc(t.titulo||'Sin asunto')}</option>`).join('');
        sel.dataset.agentEmail = ag.email;
        sel.dataset.agentNombre = nombre;
    }

    drawer.classList.add('open');
    if (dov) dov.classList.add('visible');
}

// ── Assign ticket ─────────────────────────────────────────────────
document.getElementById('adBtnAssign')?.addEventListener('click', async () => {
    const sel    = document.getElementById('adTicketToAssign');
    const tickId = sel?.value;
    const email  = sel?.dataset.agentEmail;
    const nombre = sel?.dataset.agentNombre;
    if (!tickId || !email) { alert('Selecciona un ticket primero.'); return; }

    try {
        await updateDoc(doc(db, 'tickets', tickId), {
            assignedEmail: email,
            assignee:      email,
            updatedAt:     serverTimestamp(),
        });
        sel.querySelector(`option[value="${tickId}"]`)?.remove();
        sel.value = '';
    } catch (err) {
        console.error('Error al asignar:', err);
        swalToast('Error al asignar el ticket.', 'error');
    }
});

// ── Search & filter ────────────────────────────────────────────────
document.getElementById('empleadoSearch')?.addEventListener('input', e => {
    empleadoSearch = e.target.value;
    renderEmpleados();
});

document.getElementById('agenteSearch')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    renderTable();
});
document.getElementById('filterDeptAgente')?.addEventListener('change', e => {
    filterDept = e.target.value;
    renderTable();
});

// ── Helpers ───────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }