import { db, auth } from './config.js';
import {
    doc, getDoc, updateDoc, serverTimestamp,
    collection, query, where, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    onAuthStateChanged, updateProfile,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserRole } from './auth.js';
import { swalSuccess, swalError, swalToast } from './swal.js';
import { populateSelect } from './departamentos.js';

let currentUser = null;

// ── Load user data ─────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) return;
    currentUser = user;

    const display = user.displayName || user.email.split('@')[0];
    const initial = display.charAt(0).toUpperCase();

    _set('perfilAvatar',       initial);
    _set('perfilNombre',       display);
    _set('perfilEmailDisplay', user.email);
    _set('userEmail',          user.email);
    _set('userAvatarInitial',  initial);

    const pfNombre = document.getElementById('pfNombre');
    const pfEmail  = document.getElementById('pfEmail');
    if (pfNombre) pfNombre.value = display;
    if (pfEmail)  pfEmail.value  = user.email;

    try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
            const data = snap.data();
            const rol  = data.rol ?? 'cliente';

            const rolBadge = document.getElementById('perfilRolBadge');
            const roleEl   = document.getElementById('userRole');
            const rolLabel = rol === 'admin'  ? 'Admin'  :
                             rol === 'agente' ? 'Agente' : 'Empleado';
            if (rolBadge) rolBadge.textContent = rolLabel;
            if (roleEl)   roleEl.textContent   = rolLabel;

            populateSelect('pfDepartamento', { selectedValue: data.departamento || '' });

            // Ocultar campos solo de agente si es empleado
            if (rol === 'cliente') {
                const deptRow = document.getElementById('pfDepartamento')?.closest('.pf-field');
                if (deptRow) deptRow.style.display = 'none';
            }
        }
    } catch {}

    try {
        // Query all tickets assigned to this agent (no compound index needed)
        const assignedSnap = await getDocs(
            query(collection(db, 'tickets'), where('assignedEmail', '==', user.email))
        );
        const assignedTickets = assignedSnap.docs.map(d => d.data());
        const openCount     = assignedTickets.filter(t => ['open','in-progress'].includes(t.status || 'open')).length;
        const resolvedCount = assignedTickets.filter(t => ['resolved','closed'].includes(t.status)).length;
        _set('pidTicketsAbiertos', openCount);
        _set('pidResueltos',       resolvedCount);

        // Also count tickets resolved by this agent (resolvedBy field)
        const resolvedBySnap = await getDocs(
            query(collection(db, 'tickets'), where('resolvedBy', '==', user.email))
        );
        // Merge: count unique resolved tickets from both sources
        const resolvedIds = new Set([
            ...assignedSnap.docs.filter(d => ['resolved','closed'].includes(d.data().status)).map(d => d.id),
            ...resolvedBySnap.docs.map(d => d.id)
        ]);
        _set('pidResueltos', resolvedIds.size);

        // Total: all tickets ever assigned to this agent
        _set('pidArticulos', assignedSnap.size);
    } catch (e) { console.warn('Stats error:', e); }

    try {
        const navSnap = await getDocs(query(collection(db, 'tickets'), where('status', '==', 'open')));
        _set('navTicketCount', navSnap.size);
    } catch {}

    loadActivity(user.email);
    loadNotifPrefs();
});

// ── Recent activity ────────────────────────────────────────────────
async function loadActivity(email) {
    const el = document.getElementById('perfilActivity');
    if (!el) return;
    try {
        const allSnap = await getDocs(
            query(collection(db, 'tickets'), where('assignedEmail', '==', email))
        );
        // Sort and limit in memory to avoid composite index requirement
        const sorted = allSnap.docs
            .sort((a, b) => (b.data().timestamp?.seconds ?? 0) - (a.data().timestamp?.seconds ?? 0))
            .slice(0, 5);
        const snap = { empty: sorted.length === 0, docs: sorted };
        if (snap.empty) { el.innerHTML = '<div class="activity-empty">Sin actividad registrada</div>'; return; }
        el.innerHTML = snap.docs.map(d => {
            const t    = d.data();
            const date = t.timestamp?.toDate?.()
                ? t.timestamp.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                : '—';
            const colors = { open:'var(--blue)', 'in-progress':'var(--yellow)', resolved:'var(--green)', closed:'var(--text-tertiary)' };
            const color  = colors[t.status || 'open'] || 'var(--blue)';
            return `
            <div class="pact-item">
                <div class="pact-dot" style="background:${color}"></div>
                <div class="pact-info">
                    <div class="pact-text">${esc(t.titulo || 'Ticket sin asunto')}</div>
                    <div class="pact-time">${date} · ${esc(t.depto || '—')}</div>
                </div>
            </div>`;
        }).join('');
    } catch { el.innerHTML = '<div class="activity-empty">Error al cargar actividad</div>'; }
}

// ── Save personal data ─────────────────────────────────────────────
document.getElementById('formDatos')?.addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('datosStatus');
    const btn      = document.getElementById('btnGuardarDatos');
    const nombre   = document.getElementById('pfNombre')?.value.trim();
    const dept     = document.getElementById('pfDepartamento')?.value;

    if (!nombre) { showMsg(statusEl, 'error', 'El nombre no puede estar vacío.'); return; }
    showMsg(statusEl, 'loading', 'Guardando…');
    if (btn) btn.disabled = true;

    try {
        await updateProfile(currentUser, { displayName: nombre });
        await updateDoc(doc(db, 'usuarios', currentUser.uid), {
            nombre, departamento: dept, updatedAt: serverTimestamp()
        });
        _set('perfilNombre',      nombre);
        _set('perfilAvatar',      nombre.charAt(0).toUpperCase());
        _set('userAvatarInitial', nombre.charAt(0).toUpperCase());
        _set('userEmail',         currentUser.email);
        showMsg(statusEl, 'success', '¡Perfil actualizado correctamente!');
    } catch {
        showMsg(statusEl, 'error', 'Error al guardar. Inténtalo de nuevo.');
    } finally {
        if (btn) btn.disabled = false;
    }
});

// ── Change password ────────────────────────────────────────────────
document.getElementById('formPassword')?.addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl  = document.getElementById('passStatus');
    const btn       = document.getElementById('btnCambiarPass');
    const actual    = document.getElementById('pfPassActual')?.value;
    const nueva     = document.getElementById('pfPassNueva')?.value;
    const confirmar = document.getElementById('pfPassConfirm')?.value;

    if (!actual)             { showMsg(statusEl, 'error', 'Introduce tu contraseña actual.'); return; }
    if (!nueva)              { showMsg(statusEl, 'error', 'Introduce la nueva contraseña.'); return; }
    if (nueva.length < 6)    { showMsg(statusEl, 'error', 'La contraseña debe tener al menos 6 caracteres.'); return; }
    if (nueva !== confirmar) { showMsg(statusEl, 'error', 'Las contraseñas no coinciden.'); return; }

    showMsg(statusEl, 'loading', 'Verificando contraseña actual…');
    if (btn) btn.disabled = true;

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, actual);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, nueva);
        showMsg(statusEl, 'success', '¡Contraseña actualizada correctamente!');
        document.getElementById('formPassword').reset();
    } catch (err) {
        const msgs = {
            'auth/wrong-password':        'La contraseña actual es incorrecta.',
            'auth/invalid-credential':    'La contraseña actual es incorrecta.',
            'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
            'auth/requires-recent-login': 'Cierra sesión y vuelve a entrar para cambiar la contraseña.',
        };
        showMsg(statusEl, 'error', msgs[err.code] || 'Error al cambiar contraseña. Inténtalo de nuevo.');
    } finally {
        if (btn) btn.disabled = false;
    }
});

// ── Notifications ──────────────────────────────────────────────────
function loadNotifPrefs() {
    const prefs = JSON.parse(localStorage.getItem('nf_notif_prefs') || '{}');
    ['notifAsignado','notifComentario','notifP0','notifResumen'].forEach(id => {
        const el = document.getElementById(id);
        if (el && id in prefs) el.checked = prefs[id];
    });
}

document.getElementById('btnGuardarNotifs')?.addEventListener('click', () => {
    const prefs = {};
    ['notifAsignado','notifComentario','notifP0','notifResumen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) prefs[id] = el.checked;
    });
    localStorage.setItem('nf_notif_prefs', JSON.stringify(prefs));
    const btn = document.getElementById('btnGuardarNotifs');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> ¡Guardado!';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
});

// ── Helpers ───────────────────────────────────────────────────────
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showMsg(el, type, text) {
    if (!el) return;
    el.style.display = 'block'; el.textContent = text;
    const s = {
        error:   { bg: 'var(--red-faint)',    b: 'rgba(239,68,68,0.25)',   c: 'var(--red)' },
        success: { bg: 'var(--green-faint)',  b: 'rgba(34,197,94,0.25)',   c: 'var(--green)' },
        loading: { bg: 'var(--accent-faint)', b: 'rgba(99,102,241,0.25)', c: 'var(--accent-light)' },
    }[type] || {};
    Object.assign(el.style, { background: s.bg, border: `1px solid ${s.b}`, color: s.c, borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.82rem' });
}