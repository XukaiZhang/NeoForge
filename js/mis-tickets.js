import { db, auth } from './config.js';
import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let allTickets    = [];
let currentFilter = '';
let currentSearch = '';

// ── Esperar usuario autenticado ────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (!user) return;

    // Avatar inicial
    const display = user.displayName || user.email.split('@')[0];
    const avatarEl = document.getElementById('ctAvatar');
    if (avatarEl) avatarEl.textContent = display.charAt(0).toUpperCase();

    // Escuchar tickets del usuario actual
    const q = query(
        collection(db, 'tickets'),
        where('ownerUid', '==', user.uid),
        orderBy('timestamp', 'desc')
    );

    onSnapshot(q, snap => {
        allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateStats();
        renderTickets();
    });
});

// ── Stats ──────────────────────────────────────────────────────────
function updateStats() {
    const abiertos  = allTickets.filter(t => (t.status || 'open') === 'open').length;
    const enProceso = allTickets.filter(t => t.status === 'in-progress').length;
    const resueltos = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

    _set('cstAbiertos',  abiertos);
    _set('cstEnProceso', enProceso);
    _set('cstResueltos', resueltos);
    _set('cstTotal',     allTickets.length);
}

// ── Render lista ───────────────────────────────────────────────────
function renderTickets() {
    const list  = document.getElementById('ctTicketsList');
    const empty = document.getElementById('ctEmpty');
    if (!list) return;

    let filtered = allTickets;
    if (currentFilter) {
        filtered = filtered.filter(t => (t.status || 'open') === currentFilter);
    }
    if (currentSearch.trim()) {
        const s = currentSearch.toLowerCase();
        filtered = filtered.filter(t =>
            (t.titulo || '').toLowerCase().includes(s) ||
            t.id.toLowerCase().includes(s)
        );
    }

    if (allTickets.length === 0) {
        list.innerHTML  = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    if (filtered.length === 0) {
        list.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:0.84rem;">
                <i class="bi bi-search" style="font-size:1.4rem;display:block;margin-bottom:8px;"></i>
                No se encontraron tickets con ese filtro.
            </div>`;
        return;
    }

    list.innerHTML = filtered.map(t => {
        const status     = t.status || 'open';
        const statusConf = STATUS_CONFIG[status] || STATUS_CONFIG['open'];
        const date       = t.timestamp?.toDate?.()
            ? t.timestamp.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        return `
        <div class="ct-ticket-card" onclick="openTicketDetail(${JSON.stringify(t).replace(/"/g, '&quot;')})">
            <div class="ct-ticket-prio">
                <span class="prio-tag prio-${esc(t.prioridad || 'P3')}">${esc(t.prioridad || 'P3')}</span>
            </div>
            <div class="ct-ticket-body">
                <div class="ct-ticket-title">${esc(t.titulo || 'Sin asunto')}</div>
                <div class="ct-ticket-meta">
                    <span>#${t.id.slice(-8).toUpperCase()}</span>
                    <span>${esc(t.depto || '—')}</span>
                    <span>${date}</span>
                </div>
            </div>
            <div class="ct-ticket-right">
                <span class="status-badge status-${status}" style="background:${statusConf.bg};color:${statusConf.color};border-color:${statusConf.border};font-size:0.72rem;padding:3px 9px">
                    ${statusConf.label}
                </span>
                <i class="bi bi-chevron-right ct-ticket-arrow"></i>
            </div>
        </div>`;
    }).join('');
}

// Status config
const STATUS_CONFIG = {
    'open':        { label: 'Abierto',    bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
    'in-progress': { label: 'En proceso', bg: 'rgba(234,179,8,0.1)',   color: '#fbbf24', border: 'rgba(234,179,8,0.25)' },
    'resolved':    { label: 'Resuelto',   bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'closed':      { label: 'Cerrado',    bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.25)' },
};

// ── Detalle ticket ─────────────────────────────────────────────────
window.openTicketDetail = function(t) {
    const modal = document.getElementById('ctDetailModal');
    if (!modal) return;

    _set('ctdId',    '#' + t.id.slice(-8).toUpperCase());
    _set('ctdTitulo', t.titulo || 'Sin asunto');

    const status = t.status || 'open';
    const sc     = STATUS_CONFIG[status] || STATUS_CONFIG['open'];
    const date   = t.timestamp?.toDate?.()
        ? t.timestamp.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    document.getElementById('ctdMeta').innerHTML = `
        <div class="drawer-meta-item"><i class="bi bi-circle-fill" style="color:${sc.color};font-size:0.4rem"></i> ${sc.label}</div>
        <div class="drawer-meta-item"><i class="bi bi-flag"></i> ${esc(t.prioridad || 'P3')}</div>
        <div class="drawer-meta-item"><i class="bi bi-building"></i> ${esc(t.depto || '—')}</div>
        <div class="drawer-meta-item"><i class="bi bi-calendar3"></i> ${date}</div>
        ${t.assignedEmail ? `<div class="drawer-meta-item"><i class="bi bi-person-check"></i> ${esc(t.assignedEmail)}</div>` : '<div class="drawer-meta-item" style="color:var(--text-tertiary)"><i class="bi bi-person-dash"></i> Sin asignar</div>'}
    `;

    document.getElementById('ctdDesc').textContent = t.descripcion || 'Sin descripción.';

    // Actividad
    const actEl = document.getElementById('ctdActivity');
    if (actEl) {
        const acts = Array.isArray(t.activity) ? t.activity : [];
        if (acts.length === 0) {
            actEl.innerHTML = `
                <div class="activity-entry system">
                    <div>
                        <strong style="font-size:0.78rem;color:var(--text-primary)">Ticket creado</strong>
                        <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">${date}</div>
                    </div>
                </div>`;
        } else {
            actEl.innerHTML = acts.map(a => `
                <div class="activity-entry ${a.type || 'note'}">
                    <div>
                        <strong style="font-size:0.78rem;color:var(--text-primary)">${esc(a.author || 'Sistema')}</strong>
                        <p style="margin:3px 0 0;font-size:0.8rem">${esc(a.text || '')}</p>
                        <div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:2px">${timeAgo(a.timestamp)}</div>
                    </div>
                </div>`).join('');
        }
    }

    modal.style.display = 'flex';
};

// ── Crear nuevo ticket ─────────────────────────────────────────────
document.getElementById('ctTicketForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const asunto = document.getElementById('ctAsunto')?.value.trim();
    const desc   = document.getElementById('ctDescripcion')?.value.trim();
    const dept   = document.getElementById('ctDepartamento')?.value;
    const prio   = document.getElementById('ctUrgencia')?.value;
    const msgEl  = document.getElementById('ctFormStatus');
    const btn    = document.getElementById('ctBtnEnviar');

    if (!asunto) { showMsg(msgEl, 'error', 'Por favor indica un asunto.'); return; }
    if (!desc)   { showMsg(msgEl, 'error', 'Por favor añade una descripción.'); return; }

    showMsg(msgEl, 'loading', 'Creando ticket…');
    btn.disabled = true;

    try {
        const ref = await addDoc(collection(db, 'tickets'), {
            titulo:      asunto,
            descripcion: desc,
            depto:       dept,
            prioridad:   prio,
            status:      'open',
            ownerUid:    user.uid,
            ownerEmail:  user.email,
            operator:    user.email,
            timestamp:   serverTimestamp(),
            activity:    []
        });

        showMsg(msgEl, 'success', `¡Ticket #${ref.id.slice(-8).toUpperCase()} creado! Volviendo…`);
        e.target.reset();
        document.getElementById('ctCharCount').textContent = '0';

        setTimeout(() => {
            // Volver a lista
            document.getElementById('secNuevoTicket').style.display = 'none';
            document.getElementById('secMisTickets').style.display  = 'block';
            document.querySelectorAll('.ct-nav-btn').forEach(b => {
                b.classList.toggle('active', b.id === 'navMisTickets' || b.id === 'mNavMisTickets');
            });
            msgEl.style.display = 'none';
            btn.disabled = false;
        }, 1800);
    } catch (err) {
        console.error(err);
        showMsg(msgEl, 'error', 'Error al crear el ticket. Inténtalo de nuevo.');
        btn.disabled = false;
    }
});

// ── Filtrado y búsqueda (expuesto globalmente para el HTML) ────────
window.filterClienteTickets = function(status) {
    currentFilter = status;
    renderTickets();
};
window.searchClienteTickets = function(term) {
    currentSearch = term;
    renderTickets();
};

// ── Helpers ───────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(ts) {
    if (!ts) return '—';
    const d    = ts.toDate?.() ?? new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)    return 'ahora mismo';
    if (diff < 3600)  return Math.floor(diff / 60) + ' min atrás';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h atrás';
    return Math.floor(diff / 86400) + ' d atrás';
}
function showMsg(el, type, text) {
    if (!el) return;
    el.style.display = 'block'; el.textContent = text;
    const s = {
        error:   { bg: 'var(--red-faint)',    b: 'rgba(239,68,68,0.25)',   c: 'var(--red)' },
        success: { bg: 'var(--green-faint)',  b: 'rgba(34,197,94,0.25)',   c: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', b: 'rgba(99,102,241,0.25)', c: 'var(--accent-light)' },
    }[type] || {};
    Object.assign(el.style, { background:s.bg, border:`1px solid ${s.b}`, color:s.c, borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:'0.82rem' });
}