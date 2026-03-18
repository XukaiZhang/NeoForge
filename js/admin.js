import { db, auth } from './config.js';
import {
    collection, getDocs, doc, updateDoc,
    onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserRole } from './auth.js';
import { swalSuccess, swalError, swalConfirm, swalToast } from './swal.js';
import { subscribeDepts, addDept, updateDept, deleteDept, getDepts } from './departamentos.js';

let allUsers      = [];
let currentUser   = null;
let currentSearch = '';
let currentFilter = '';

// ── Guard ──────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;
    currentUser = user;
    const rol = await getUserRole(user.uid);
    if (rol !== 'admin') { window.location.replace('dashboard.html'); return; }

    try {
        const snap = await getDocs(collection(db, 'tickets'));
        const open = snap.docs.filter(d => (d.data().status || 'open') === 'open').length;
        const el   = document.getElementById('navTicketCount');
        if (el) el.textContent = open;
    } catch {}

    loadUsers();
    loadDepts();
});

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN USUARIOS
// ═══════════════════════════════════════════════════════════════════

function loadUsers() {
    const tbody = document.getElementById('usersBody');
    if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="7"><span class="loading-spinner"></span>Cargando usuarios…</td></tr>`;

    // No orderBy — avoids Firestore index requirement and ensures ALL docs appear
    // even if 'creado' field is missing (usuarios creados antes del sistema de roles)
    onSnapshot(collection(db, 'usuarios'), snap => {
        allUsers = snap.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            .sort((a, b) => (b.creado?.seconds ?? 0) - (a.creado?.seconds ?? 0));
        updateStats();
        renderUsers();
    }, err => {
        console.error('Error cargando usuarios:', err);
        if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Error al cargar usuarios. Comprueba las reglas de Firestore.</td></tr>`;
    });
}

function updateStats() {
    const admins   = allUsers.filter(u => u.rol === 'admin').length;
    const agentes  = allUsers.filter(u => u.rol === 'agente').length;
    const empleados= allUsers.filter(u => !u.rol || u.rol === 'cliente').length;
    _set('statTotal',     allUsers.length);
    _set('statAdmins',    admins);
    _set('statAgentes',   agentes);
    _set('statEmpleados', empleados);
}

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

    const depts = getDepts();

    tbody.innerHTML = filtered.map(u => {
        const rol     = u.rol || 'cliente';
        const isSelf  = u.uid === currentUser?.uid;
        const nombre  = u.nombre || u.email?.split('@')[0] || '—';
        const inicial = nombre.charAt(0).toUpperCase();
        const fecha   = u.creado?.toDate?.()
            ? u.creado.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        const dept = u.departamento || '';

        const deptOptions = depts.map(d =>
            `<option value="${esc(d.nombre)}" ${dept === d.nombre ? 'selected' : ''}>${esc(d.nombre)}</option>`
        ).join('');

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
            <td>
                ${isSelf
                    ? `<span style="font-size:0.75rem;color:var(--text-tertiary)">${esc(dept || '—')}</span>`
                    : rol === 'cliente'
                        ? `<span style="font-size:0.74rem;color:var(--text-tertiary);font-style:italic">—</span>`
                        : `<select class="dept-select" data-uid="${u.uid}">
                            <option value="" ${!dept ? 'selected' : ''}>Sin asignar</option>
                            ${deptOptions}
                           </select>`
                }
            </td>
            <td style="font-size:0.77rem;color:var(--text-tertiary);font-family:var(--font-mono)">${fecha}</td>
            <td>
                ${isSelf
                    ? `<span style="font-size:0.75rem;color:var(--text-tertiary)">No editable</span>`
                    : `<select class="rol-select" data-uid="${u.uid}" data-current="${rol}">
                        <option value="cliente" ${rol === 'cliente' ? 'selected' : ''}>Empleado</option>
                        <option value="agente"  ${rol === 'agente'  ? 'selected' : ''}>Agente</option>
                        <option value="admin"   ${rol === 'admin'   ? 'selected' : ''}>Admin</option>
                       </select>`
                }
            </td>
            <td>
                ${isSelf ? '' : `<button class="btn-apply-rol" data-uid="${u.uid}" data-nombre="${esc(nombre)}"><i class="bi bi-check-lg"></i> Aplicar</button>`}
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-apply-rol').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid     = btn.dataset.uid;
            const nombre  = btn.dataset.nombre;
            const rolSel  = tbody.querySelector(`.rol-select[data-uid="${uid}"]`);
            const deptSel = tbody.querySelector(`.dept-select[data-uid="${uid}"]`);
            if (!rolSel) return;
            const newRol     = rolSel.value;
            const currentRol = rolSel.dataset.current;
            openConfirm(uid, nombre, currentRol, newRol, btn, rolSel, deptSel);
        });
    });
}

const ROL_LABELS = { admin: 'Admin', agente: 'Agente', cliente: 'Empleado' };

// ── Confirm modal ──────────────────────────────────────────────────
let pendingChange = null;

function openConfirm(uid, nombre, fromRol, toRol, btn, rolSel, deptSel) {
    const modal = document.getElementById('confirmModal');
    const desc  = document.getElementById('confirmDesc');
    if (!modal || !desc) return;
    const deptInfo = deptSel?.value ? ` · Dpto: ${deptSel.value}` : '';
    const rolChange = fromRol !== toRol ? `Rol: ${ROL_LABELS[fromRol]} → ${ROL_LABELS[toRol]}` : `Rol sin cambios`;
    desc.textContent = `${esc(nombre)} — ${rolChange}${deptInfo}`;
    pendingChange = { uid, toRol, btn, rolSel, deptSel };
    modal.style.display = 'flex';
}

document.getElementById('closeConfirm')?.addEventListener('click',  closeConfirm);
document.getElementById('cancelConfirm')?.addEventListener('click', closeConfirm);
document.getElementById('confirmModal')?.addEventListener('click',  e => { if (e.target === document.getElementById('confirmModal')) closeConfirm(); });

function closeConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    pendingChange = null;
}

document.getElementById('acceptConfirm')?.addEventListener('click', async () => {
    if (!pendingChange) return;
    const { uid, toRol, btn, rolSel, deptSel } = pendingChange;
    closeConfirm();
    await applyUserChange(uid, toRol, btn, rolSel, deptSel);
});

async function applyUserChange(uid, newRol, btn, rolSel, deptSel) {
    if (btn) { btn.classList.add('saving'); btn.innerHTML = '<span class="loading-spinner"></span>'; }
    if (rolSel)  rolSel.disabled  = true;
    if (deptSel) deptSel.disabled = true;

    const updateData = { rol: newRol, updatedAt: serverTimestamp() };
    if (deptSel) updateData.departamento = deptSel.value;

    try {
        await updateDoc(doc(db, 'usuarios', uid), updateData);
        if (btn) { btn.classList.remove('saving'); btn.classList.add('saved'); btn.innerHTML = '<i class="bi bi-check2-all"></i> Guardado'; }
        if (rolSel) rolSel.dataset.current = newRol;
        showToast(`Usuario actualizado correctamente.`, 'success');
        setTimeout(() => {
            if (btn) { btn.classList.remove('saved'); btn.innerHTML = '<i class="bi bi-check-lg"></i> Aplicar'; }
            if (rolSel)  rolSel.disabled  = false;
            if (deptSel) deptSel.disabled = false;
        }, 2000);
    } catch (err) {
        console.error(err);
        if (btn) { btn.classList.remove('saving'); btn.innerHTML = '<i class="bi bi-check-lg"></i> Aplicar'; }
        if (rolSel)  rolSel.disabled  = false;
        if (deptSel) deptSel.disabled = false;
        swalToast('Error al actualizar. Inténtalo de nuevo.', 'error');
    }
}

document.getElementById('adminSearch')?.addEventListener('input',  e => { currentSearch = e.target.value; renderUsers(); });
document.getElementById('filterRol')?.addEventListener('change',   e => { currentFilter = e.target.value; renderUsers(); });

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN DEPARTAMENTOS
// ═══════════════════════════════════════════════════════════════════

function loadDepts() {
    subscribeDepts(depts => {
        renderDepts(depts);
        // Also refresh dept selectors in user table if already rendered
        renderUsers();
    });
}

function renderDepts(depts) {
    const list  = document.getElementById('deptsList');
    const count = document.getElementById('deptsCount');
    if (!list) return;
    if (count) count.textContent = depts.length;

    if (depts.length === 0) {
        list.innerHTML = `<div class="dept-empty">Sin departamentos. Crea el primero.</div>`;
        return;
    }

    list.innerHTML = depts.map(d => `
        <div class="dept-row" data-id="${d.id}">
            <div class="dept-row-icon">${esc(d.icono || d.nombre.slice(0,2).toUpperCase())}</div>
            <div class="dept-row-info">
                <div class="dept-row-name">${esc(d.nombre)}</div>
                ${d.descripcion ? `<div class="dept-row-desc">${esc(d.descripcion)}</div>` : ''}
            </div>
            <div class="dept-row-actions">
                <button class="dept-btn-edit" data-id="${d.id}" title="Editar"><i class="bi bi-pencil"></i></button>
                <button class="dept-btn-del"  data-id="${d.id}" title="Eliminar"><i class="bi bi-trash"></i></button>
            </div>
        </div>`).join('');

    list.querySelectorAll('.dept-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = depts.find(x => x.id === btn.dataset.id);
            if (d) openDeptModal(d);
        });
    });

    list.querySelectorAll('.dept-btn-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            const d = depts.find(x => x.id === btn.dataset.id);
            if (!d) return;
            const res = await swalConfirm(
                `¿Eliminar "${d.nombre}"?`,
                'Los tickets existentes no se verán afectados.',
                'Eliminar',
                true
            );
            if (!res?.isConfirmed) return;
            try {
                await deleteDept(d.id);
                showToast(`Departamento "${d.nombre}" eliminado.`, 'success');
            } catch { swalToast('Error al eliminar.', 'error'); }
        });
    });
}

// ── Dept modal ─────────────────────────────────────────────────────
let editingDeptId = null;

function openDeptModal(dept = null) {
    editingDeptId = dept?.id ?? null;
    document.getElementById('deptModalTitle').textContent = dept ? 'Editar departamento' : 'Nuevo departamento';
    document.getElementById('deptNombre').value      = dept?.nombre      ?? '';
    document.getElementById('deptDesc').value        = dept?.descripcion ?? '';
    document.getElementById('deptIcono').value       = dept?.icono       ?? '';
    document.getElementById('deptModalMsg').style.display = 'none';
    document.getElementById('deptModal').style.display = 'flex';
    document.getElementById('deptNombre').focus();
}

function closeDeptModal() {
    document.getElementById('deptModal').style.display = 'none';
    editingDeptId = null;
}

document.getElementById('btnNuevoDept')?.addEventListener('click',  () => openDeptModal());
document.getElementById('closeDeptModal')?.addEventListener('click', closeDeptModal);
document.getElementById('cancelDeptModal')?.addEventListener('click', closeDeptModal);
document.getElementById('deptModal')?.addEventListener('click', e => { if (e.target === document.getElementById('deptModal')) closeDeptModal(); });

document.getElementById('deptForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msgEl  = document.getElementById('deptModalMsg');
    const nombre = document.getElementById('deptNombre').value.trim();
    const desc   = document.getElementById('deptDesc').value.trim();
    const icono  = document.getElementById('deptIcono').value.trim();
    const btn    = e.target.querySelector('button[type="submit"]');

    if (!nombre) { showDeptMsg(msgEl, 'error', 'El nombre es obligatorio.'); return; }
    showDeptMsg(msgEl, 'loading', 'Guardando…');
    if (btn) btn.disabled = true;

    try {
        if (editingDeptId) {
            await updateDept(editingDeptId, { nombre, descripcion: desc, icono });
            showToast(`Departamento "${nombre}" actualizado.`, 'success');
        } else {
            await addDept(nombre, desc, icono);
            showToast(`Departamento "${nombre}" creado.`, 'success');
        }
        closeDeptModal();
    } catch (err) {
        showDeptMsg(msgEl, 'error', err.message || 'Error al guardar.');
    } finally {
        if (btn) btn.disabled = false;
    }
});

function showDeptMsg(el, type, text) {
    if (!el) return;
    el.style.display = 'block'; el.textContent = text;
    const s = {
        error:   { bg:'var(--red-faint)',    b:'rgba(239,68,68,0.25)',   c:'var(--red)' },
        success: { bg:'var(--green-faint)',  b:'rgba(34,197,94,0.25)',   c:'var(--green)' },
        loading: { bg:'var(--accent-faint)', b:'rgba(99,102,241,0.25)', c:'var(--accent-light)' },
    }[type] || {};
    Object.assign(el.style, { background:s.bg, border:`1px solid ${s.b}`, color:s.c, borderRadius:'var(--radius-sm)', padding:'8px 12px', fontSize:'0.8rem' });
}

// ── Toast (delegated to swal.js) ──────────────────────────────────
function showToast(msg, type = 'success') { swalToast(msg, type === 'error' ? 'error' : 'success'); }

// ── Helpers ────────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }