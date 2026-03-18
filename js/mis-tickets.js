import { db, auth } from './config.js';
import {
    collection, query, where, onSnapshot,
    addDoc, getDocs, updateDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import './auth.js';
import { swalToast } from './swal.js';
import { populateSelect } from './departamentos.js';
import { watchTicketStatusChanges, showToast } from './notifications.js';

let allTickets    = [];
let currentFilter = '';
let currentSearch = '';

// ── Auth ───────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (!user) return;

    const display  = user.displayName || user.email.split('@')[0];
    const avatarEl = document.getElementById('ctAvatar');
    const emailEl  = document.getElementById('userEmail');
    if (avatarEl) avatarEl.textContent = display.charAt(0).toUpperCase();
    if (emailEl)  emailEl.textContent  = user.email;
    populateSelect('ctDepartamento');

    // Sin orderBy para evitar necesitar índice compuesto en Firestore
    // Ordenamos en memoria después de recibir los datos
    const q = query(
        collection(db, 'tickets'),
        where('ownerUid', '==', user.uid)
    );

    onSnapshot(q, snap => {
        allTickets = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0));
        watchTicketStatusChanges(allTickets);
        updateStats();
        renderTickets();
    }, err => {
        // Fallback por email para tickets legacy
        console.warn('ownerUid query failed, fallback ownerEmail:', err.message);
        const q2 = query(
            collection(db, 'tickets'),
            where('ownerEmail', '==', user.email)
        );
        onSnapshot(q2, snap => {
            allTickets = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0));
            updateStats();
            renderTickets();
        }, err2 => {
            console.error('Both queries failed:', err2);
        });
    });
});

// ── Logout ────────────────────────────────────────────────────────
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.replace('login.html'); // empleados siempre van a login.html
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
    if (currentFilter) filtered = filtered.filter(t => (t.status || 'open') === currentFilter);
    if (currentSearch.trim()) {
        const s = currentSearch.toLowerCase();
        filtered = filtered.filter(t =>
            (t.titulo || '').toLowerCase().includes(s) ||
            t.id.toLowerCase().includes(s)
        );
    }

    if (allTickets.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="ct-no-results">
                <i class="bi bi-search"></i>
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
        const isActive = status === 'in-progress';
        return `
        <div class="ct-ticket-card ${isActive ? 'ct-ticket-card--active' : ''}" data-id="${t.id}">
            <div class="ct-ticket-prio">
                <span class="prio-tag prio-${esc(t.prioridad || 'P3')}">${esc(t.prioridad || 'P3')}</span>
            </div>
            <div class="ct-ticket-body">
                <div class="ct-ticket-title">
                    ${isActive ? '<span class="ct-live-dot"></span>' : ''}${esc(t.titulo || 'Sin asunto')}
                </div>
                <div class="ct-ticket-meta">
                    <span>#${t.id.slice(-8).toUpperCase()}</span>
                    <span>${esc(t.depto || '—')}</span>
                    <span>${date}</span>
                </div>
            </div>
            <div class="ct-ticket-right">
                <span class="ct-status-pill" style="background:${statusConf.bg};color:${statusConf.color};border:1px solid ${statusConf.border}">
                    <span class="ct-status-dot" style="background:${statusConf.color}"></span>
                    ${statusConf.label}
                </span>
                <i class="bi bi-chevron-right ct-ticket-arrow"></i>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.ct-ticket-card').forEach(card => {
        card.addEventListener('click', () => {
            const t = allTickets.find(x => x.id === card.dataset.id);
            if (t) openTicketDetail(t);
        });
    });
}

const STATUS_CONFIG = {
    'open':        { label: 'Abierto',    bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
    'in-progress': { label: 'En proceso', bg: 'rgba(234,179,8,0.12)',   color: '#fbbf24', border: 'rgba(234,179,8,0.25)' },
    'resolved':    { label: 'Resuelto',   bg: 'rgba(34,197,94,0.12)',   color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'closed':      { label: 'Cerrado',    bg: 'rgba(148,163,184,0.1)',  color: '#94a3b8', border: 'rgba(148,163,184,0.25)' },
};

// ── Detalle ticket ─────────────────────────────────────────────────
function openTicketDetail(t) {
    const modal = document.getElementById('ctDetailModal');
    if (!modal) return;

    _set('ctdId',     '#' + t.id.slice(-8).toUpperCase());
    _set('ctdTitulo', t.titulo || 'Sin asunto');

    const status = t.status || 'open';
    const sc     = STATUS_CONFIG[status] || STATUS_CONFIG['open'];
    const date   = t.timestamp?.toDate?.()
        ? t.timestamp.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    document.getElementById('ctdMeta').innerHTML = `
        <div class="drawer-meta-item"><span class="ct-status-dot" style="background:${sc.color}"></span>${sc.label}</div>
        <div class="drawer-meta-item"><i class="bi bi-flag"></i>${esc(t.prioridad || 'P3')}</div>
        <div class="drawer-meta-item"><i class="bi bi-building"></i>${esc(t.depto || '—')}</div>
        <div class="drawer-meta-item"><i class="bi bi-calendar3"></i>${date}</div>
        ${t.assignedEmail
            ? `<div class="drawer-meta-item"><i class="bi bi-person-check" style="color:var(--green)"></i>${esc(t.assignedEmail)}</div>`
            : '<div class="drawer-meta-item" style="color:var(--text-tertiary)"><i class="bi bi-person-dash"></i>Sin asignar</div>'}
    `;

    document.getElementById('ctdDesc').textContent = t.descripcion || 'Sin descripción.';

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
                        <p style="margin:3px 0 0;font-size:0.8rem;color:var(--text-secondary)">${esc(a.text || '')}</p>
                        <div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:2px">${timeAgo(a.timestamp || a.ts)}</div>
                    </div>
                </div>`).join('');
        }
    }

    modal.style.display = 'flex';
}

window.openTicketDetail = openTicketDetail;

// ── Auto-assign ───────────────────────────────────────────────────
async function autoAssign(depto) {
    try {
        const agSnap = await getDocs(query(collection(db, 'usuarios'), where('rol', 'in', ['agente', 'admin'])));
        if (agSnap.empty) return null;
        const agents = agSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
        const deptAgents = agents.filter(a => a.departamento === depto);
        const pool = deptAgents.length > 0 ? deptAgents : agents;
        const ticketSnap = await getDocs(
            query(collection(db, 'tickets'), where('status', 'in', ['open', 'in-progress']))
        );
        const counts = {};
        pool.forEach(a => { counts[a.email] = 0; });
        ticketSnap.docs.forEach(d => {
            const email = d.data().assignedEmail;
            if (email && counts[email] !== undefined) counts[email]++;
        });
        const best = pool.reduce((min, a) =>
            (counts[a.email] ?? 0) < (counts[min.email] ?? 0) ? a : min
        , pool[0]);
        return best?.email ?? null;
    } catch { return null; }
}

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
    if (btn) btn.disabled = true;

    try {
        // Auto-asignar al agente con menos carga
        const assignedEmail = await autoAssign(dept);

        const ref = await addDoc(collection(db, 'tickets'), {
            titulo:        asunto,
            descripcion:   desc,
            depto:         dept,
            prioridad:     prio,
            status:        'open',
            ownerUid:      user.uid,
            ownerEmail:    user.email,
            operator:      user.email,
            assignee:      assignedEmail || null,
            assignedEmail: assignedEmail || null,
            timestamp:     serverTimestamp(),
            activity:      []
        });

        showMsg(msgEl, 'success', `✓ Ticket #${ref.id.slice(-8).toUpperCase()} creado correctamente.`);
        e.target.reset();
        document.getElementById('ctCharCount').textContent = '0';

        setTimeout(() => {
            document.getElementById('secNuevoTicket').style.display = 'none';
            document.getElementById('secMisTickets').style.display  = 'block';
            document.querySelectorAll('.ct-nav-btn').forEach(b => {
                b.classList.toggle('active', b.id === 'navMisTickets' || b.id === 'mNavMisTickets');
            });
            if (msgEl) msgEl.style.display = 'none';
            if (btn) btn.disabled = false;
        }, 2000);
    } catch (err) {
        console.error(err);
        showMsg(msgEl, 'error', 'Error al crear el ticket. Inténtalo de nuevo.');
        if (btn) btn.disabled = false;
    }
});

// ── Filtrado y búsqueda ────────────────────────────────────────────
window.filterClienteTickets = function(status) { currentFilter = status; renderTickets(); };
window.searchClienteTickets = function(term)   { currentSearch = term;   renderTickets(); };

// ── Helpers ───────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(ts) {
    if (!ts) return '—';
    const d = typeof ts === 'string' ? new Date(ts) : (ts.toDate?.() ?? new Date(ts));
    if (isNaN(d)) return '—';
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
    Object.assign(el.style, { background:s.bg, border:`1px solid ${s.b}`, color:s.c, borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:'0.84rem', fontFamily:'var(--font-sans)' });
}

// ── Perfil del cliente ────────────────────────────────────────────
window.initPerfilModal = function() {
    const user = auth.currentUser;
    if (!user) return;
    const display = user.displayName || user.email.split('@')[0];
    const initial = display.charAt(0).toUpperCase();

    const avatarEl = document.getElementById('ctPerfilAvatar');
    const nameEl   = document.getElementById('ctPerfilName');
    const emailEl  = document.getElementById('ctPerfilEmail');
    const nameInp  = document.getElementById('ctPerfilNombreInput');
    const emailInp = document.getElementById('ctPerfilEmailInput');

    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl)   nameEl.textContent   = display;
    if (emailEl)  emailEl.textContent  = user.email;
    if (nameInp)  nameInp.value        = display;
    if (emailInp) emailInp.value       = user.email;
};

// Save profile data
document.getElementById('ctPerfilDatosForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const user   = auth.currentUser;
    if (!user) return;
    const msgEl  = document.getElementById('ctPerfilDatosMsg');
    const nombre = document.getElementById('ctPerfilNombreInput')?.value.trim();
    const btn    = e.target.querySelector('button[type="submit"]');

    if (!nombre) { showMsg(msgEl, 'error', 'El nombre no puede estar vacío.'); return; }
    showMsg(msgEl, 'loading', 'Guardando…');
    if (btn) btn.disabled = true;

    try {
        await updateProfile(user, { displayName: nombre });
        await updateDoc(doc(db, 'usuarios', user.uid), { nombre, updatedAt: serverTimestamp() });

        // Update topbar avatar + email
        const avatarEl = document.getElementById('ctAvatar');
        const emailEl  = document.getElementById('userEmail');
        if (avatarEl) avatarEl.textContent = nombre.charAt(0).toUpperCase();
        document.getElementById('ctPerfilAvatar').textContent = nombre.charAt(0).toUpperCase();
        document.getElementById('ctPerfilName').textContent   = nombre;

        showMsg(msgEl, 'success', '¡Perfil actualizado!');
        showToast('Perfil actualizado correctamente', 'success');
    } catch {
        showMsg(msgEl, 'error', 'Error al guardar. Inténtalo de nuevo.');
    } finally {
        if (btn) btn.disabled = false;
    }
});

// Change password
document.getElementById('ctPerfilPassForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const user      = auth.currentUser;
    if (!user) return;
    const msgEl     = document.getElementById('ctPerfilPassMsg');
    const actual    = document.getElementById('ctPassActual')?.value;
    const nueva     = document.getElementById('ctPassNueva')?.value;
    const confirmar = document.getElementById('ctPassConfirm')?.value;
    const btn       = e.target.querySelector('button[type="submit"]');

    if (!actual)              { showMsg(msgEl, 'error', 'Introduce tu contraseña actual.'); return; }
    if (!nueva)               { showMsg(msgEl, 'error', 'Introduce la nueva contraseña.'); return; }
    if (nueva.length < 6)     { showMsg(msgEl, 'error', 'Mínimo 6 caracteres.'); return; }
    if (nueva !== confirmar)  { showMsg(msgEl, 'error', 'Las contraseñas no coinciden.'); return; }

    showMsg(msgEl, 'loading', 'Verificando…');
    if (btn) btn.disabled = true;

    try {
        const cred = EmailAuthProvider.credential(user.email, actual);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, nueva);
        showMsg(msgEl, 'success', '¡Contraseña actualizada!');
        showToast('Contraseña actualizada correctamente', 'success');
        e.target.reset();
    } catch (err) {
        const msgs = {
            'auth/wrong-password':     'La contraseña actual es incorrecta.',
            'auth/invalid-credential': 'La contraseña actual es incorrecta.',
            'auth/too-many-requests':  'Demasiados intentos. Espera un momento.',
        };
        showMsg(msgEl, 'error', msgs[err.code] || 'Error al cambiar contraseña.');
    } finally {
        if (btn) btn.disabled = false;
    }
});