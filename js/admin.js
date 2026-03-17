import { db, auth } from './config.js';
import {
    collection, getDocs, doc, updateDoc,
    onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserRole } from './auth.js';

let allUsers      = [];
let currentUser   = null;
let currentSearch = '';
let currentFilter = '';

// ── Guard: solo admin puede estar aquí ────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return; // auth.js redirige si no hay sesión
    currentUser = user;

    const rol = await getUserRole(user.uid);
    if (rol !== 'admin') {
        window.location.replace('dashboard.html');
        return;
    }

    // Actualizar nav badge
    try {
        const snap = await getDocs(query(collection(db, 'tickets')));
        const open = snap.docs.filter(d => (d.data().status || 'open') === 'open').length;
        const el   = document.getElementById('navTicketCount');
        if (el) el.textContent = open;
    } catch {}

    loadUsers();
});

// ── Cargar usuarios en tiempo real ────────────────────────────────
function loadUsers() {
    const tbody = document.getElementById('usersBody');
    if (tbody) {
        tbody.innerHTML = `<tr class="loading-row"><td colspan="6"><span class="loading-spinner"></span>Cargando usuarios…</td></tr>`;
    }

    onSnapshot(
        query(collection(db, 'usuarios'), orderBy('creado', 'desc')),
        snap => {
            allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            updateStats();
            renderUsers();
        },
        err => {
            console.error('Error cargando usuarios:', err);
            if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="6">Error al cargar usuarios.</td></tr>`;
        }
    );
}

// ── Stats ─────────────────────────────────────────────────────────
function updateStats() {
    const admins  = allUsers.filter(u => u.rol === 'admin').length;
    const agentes = allUsers.filter(u => u.rol === 'agente').length;
    const clientes = allUsers.filter(u => !u.rol || u.rol === 'cliente').length;
    _set('statTotal',   allUsers.length);
    _set('statAdmins',  admins);
    _set('statAgentes', agentes);
    _set('statClientes',clientes);
}

// ── Render tabla ──────────────────────────────────────────────────
function renderUsers() {
    const tbody  = document.getElementById('usersBody');
    const empty  = document.getElementById('emptyState');
    const info   = document.getElementById('paginationInfo');
    const countEl= document.getElementById('userCount');
    if (!tbody) return;

    let filtered = allUsers;
    if (currentFilter) filtered = filtered.filter(u => (u.rol || 'cliente') === currentFilter);
    if (currentSearch.trim()) {
        const s = currentSearch.toLowerCase();
        filtered = filtered.filter(u =>
            (u.nombre || '').toLowerCase().includes(s) ||
            (u.email  || '').toLowerCase().includes(s)
        );
    }

    if (countEl) countEl.textContent = filtered.length;
    if (info) info.textContent = `Mostrando ${filtered.length} usuario${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = filtered.map(u => {
        const rol      = u.rol || 'cliente';
        const isSelf   = u.uid === currentUser?.uid;
        const nombre   = u.nombre || u.email?.split('@')[0] || '—';
        const inicial  = nombre.charAt(0).toUpperCase();
        const fecha    = u.creado?.toDate?.()
            ? u.creado.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        return `
        <tr class="${isSelf ? 'user-row-self' : ''}" data-uid="${u.uid}">
            <td>
                <div class="admin-user-cell">
                    <div class="admin-avatar av-${rol}">${esc(inicial)}</div>
                    <div>
                        <div class="admin-name">${esc(nombre)}${isSelf ? '<span class="self-tag">tú</span>' : ''}</div>
                        <div class="admin-uid">${u.uid.slice(0, 16)}…</div>
                    </div>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-secondary)">${esc(u.email || '—')}</td>
            <td><span class="rol-badge rol-${rol}">${ROL_LABELS[rol] || rol}</span></td>
            <td style="font-size:0.77rem;color:var(--text-tertiary);font-family:var(--font-mono)">${fecha}</td>
            <td>
                ${isSelf
                    ? `<span style="font-size:0.75rem;color:var(--text-tertiary)">No editable</span>`
                    : `<select class="rol-select" data-uid="${u.uid}" data-current="${rol}">
                        <option value="cliente"  ${rol === 'cliente'  ? 'selected' : ''}>Cliente</option>
                        <option value="agente"   ${rol === 'agente'   ? 'selected' : ''}>Agente</option>
                        <option value="admin"    ${rol === 'admin'    ? 'selected' : ''}>Admin</option>
                       </select>`
                }
            </td>
            <td>
                ${isSelf
                    ? ''
                    : `<button class="btn-apply-rol" data-uid="${u.uid}" data-nombre="${esc(nombre)}">
                            <i class="bi bi-check-lg"></i> Aplicar
                       </button>`
                }
            </td>
        </tr>`;
    }).join('');

    // Attach click handlers
    tbody.querySelectorAll('.btn-apply-rol').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid    = btn.dataset.uid;
            const nombre = btn.dataset.nombre;
            const sel    = tbody.querySelector(`.rol-select[data-uid="${uid}"]`);
            if (!sel) return;
            const newRol    = sel.value;
            const currentRol= sel.dataset.current;
            if (newRol === currentRol) {
                showToast('El rol seleccionado es igual al actual.', 'error');
                return;
            }
            openConfirm(uid, nombre, currentRol, newRol, btn, sel);
        });
    });
}

const ROL_LABELS = { admin: 'Admin', agente: 'Agente', cliente: 'Cliente' };

// ── Confirm modal ─────────────────────────────────────────────────
let pendingChange = null;

function openConfirm(uid, nombre, fromRol, toRol, btn, sel) {
    const modal = document.getElementById('confirmModal');
    const desc  = document.getElementById('confirmDesc');
    if (!modal || !desc) return;
    desc.textContent = `¿Cambiar el rol de "${nombre}" de ${ROL_LABELS[fromRol]} a ${ROL_LABELS[toRol]}?`;
    pendingChange = { uid, fromRol, toRol, btn, sel };
    modal.style.display = 'flex';
}

document.getElementById('closeConfirm')?.addEventListener('click', closeConfirm);
document.getElementById('cancelConfirm')?.addEventListener('click', closeConfirm);
document.getElementById('confirmModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) closeConfirm();
});

function closeConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    pendingChange = null;
}

document.getElementById('acceptConfirm')?.addEventListener('click', async () => {
    if (!pendingChange) return;
    const { uid, toRol, btn, sel } = pendingChange;
    closeConfirm();
    await applyRolChange(uid, toRol, btn, sel);
});

// ── Apply role change ──────────────────────────────────────────────
async function applyRolChange(uid, newRol, btn, sel) {
    if (btn) { btn.classList.add('saving'); btn.innerHTML = '<span class="loading-spinner"></span>'; }
    if (sel) sel.disabled = true;

    try {
        await updateDoc(doc(db, 'usuarios', uid), {
            rol:       newRol,
            updatedAt: serverTimestamp()
        });
        if (btn) { btn.classList.remove('saving'); btn.classList.add('saved'); btn.innerHTML = '<i class="bi bi-check2-all"></i> Guardado'; }
        if (sel) { sel.dataset.current = newRol; }
        showToast(`Rol actualizado a ${ROL_LABELS[newRol]} correctamente.`, 'success');

        setTimeout(() => {
            if (btn) { btn.classList.remove('saved'); btn.innerHTML = '<i class="bi bi-check-lg"></i> Aplicar'; }
            if (sel) sel.disabled = false;
        }, 2000);
    } catch (err) {
        console.error('Error actualizando rol:', err);
        if (btn) { btn.classList.remove('saving'); btn.innerHTML = '<i class="bi bi-check-lg"></i> Aplicar'; }
        if (sel) sel.disabled = false;
        showToast('Error al actualizar el rol. Inténtalo de nuevo.', 'error');
    }
}

// ── Search & filter ────────────────────────────────────────────────
document.getElementById('adminSearch')?.addEventListener('input', e => {
    currentSearch = e.target.value;
    renderUsers();
});
document.getElementById('filterRol')?.addEventListener('change', e => {
    currentFilter = e.target.value;
    renderUsers();
});

// ── Toast ─────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();

    const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
    const toast = document.createElement('div');
    toast.className = `admin-toast toast-${type}`;
    toast.innerHTML = `<i class="bi ${icon} ${type}"></i> ${esc(msg)}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Helpers ───────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }