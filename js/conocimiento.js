import { db, auth } from './config.js';
import {
    collection, query, orderBy, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import './auth.js';

let allArticulos  = [];
let currentCat    = '';
let currentSearch = '';
let currentSort   = 'reciente';
let currentUser   = null;
let viewingId     = null;

// ── Auth + Firestore listener ────────────────────────────────────
// Start listening only after auth is confirmed to avoid renders during redirect
onAuthStateChanged(auth, user => {
    if (!user) return;
    currentUser = user;
    updateNavBadge();

    // Try with orderBy first; if index is missing fall back to unordered
    const artQuery = query(collection(db, 'articulos'), orderBy('createdAt', 'desc'));
    onSnapshot(artQuery, snap => {
        allArticulos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderStats();
        renderCats();
        renderArticulos();
    }, err => {
        console.warn('articulos orderBy failed, retrying without orderBy:', err.message);
        onSnapshot(collection(db, 'articulos'), snap => {
            allArticulos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
            renderStats();
            renderCats();
            renderArticulos();
        });
    });
});

function updateNavBadge() {
    const el = document.getElementById('navTicketCount');
    if (!el) return;
    import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js").then(({ getDocs, query: q, where, collection: col }) => {
        getDocs(q(col(db, 'tickets'), where('status', '==', 'open'))).then(s => { el.textContent = s.size; }).catch(() => {});
    });
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
    const total  = allArticulos.length;
    const vistas = allArticulos.reduce((s, a) => s + (a.vistas || 0), 0);
    const utiles = allArticulos.reduce((s, a) => s + (a.votosPositivos || 0), 0);
    const cats   = new Set(allArticulos.map(a => a.categoria || 'General')).size;
    _set('statTotalArticulos', total);
    _set('statVistas',         vistas);
    _set('statUtiles',         utiles);
    _set('statCategorias',     cats);
}

// ── Categories ────────────────────────────────────────────────────
function renderCats() {
    const catList  = document.getElementById('catList');
    const tagsList = document.getElementById('tagsList');
    if (!catList) return;

    const catCounts = {};
    const tagCounts = {};
    allArticulos.forEach(a => {
        const c = a.categoria || 'General';
        catCounts[c] = (catCounts[c] || 0) + 1;
        (a.etiquetas || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });

    const total = allArticulos.length;
    const allCountEl = document.getElementById('catAllCount');
    if (allCountEl) allCountEl.textContent = total;

    catList.querySelectorAll('.kbase-cat-btn[data-cat]:not([data-cat=""])').forEach(b => b.remove());
    Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
        const btn = document.createElement('button');
        btn.className   = 'kbase-cat-btn' + (currentCat === cat ? ' active' : '');
        btn.dataset.cat = cat;
        btn.innerHTML   = `<i class="bi bi-folder"></i> ${esc(cat)} <span class="kbase-cat-count">${n}</span>`;
        catList.appendChild(btn);
    });

    // FIX: category click via event delegation — not missing inline onclick
    catList.addEventListener('click', e => {
        const btn = e.target.closest('.kbase-cat-btn');
        if (!btn) return;
        const cat = btn.dataset.cat ?? '';
        filterByCategory(cat);
        catList.querySelectorAll('.kbase-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    if (tagsList) {
        tagsList.innerHTML = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1]).slice(0, 12)
            .map(([t]) => `<span class="kbase-tag" data-tag="${esc(t)}">${esc(t)}</span>`)
            .join('');
        tagsList.querySelectorAll('.kbase-tag').forEach(tag => {
            tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
        });
    }
}

// ── Render articles ───────────────────────────────────────────────
function renderArticulos() {
    const list  = document.getElementById('articulosList');
    const empty = document.getElementById('kbaseEmpty');
    if (!list) return;

    let filtered = allArticulos;
    if (currentCat) filtered = filtered.filter(a => (a.categoria || 'General') === currentCat);
    if (currentSearch.trim()) {
        const s = currentSearch.toLowerCase();
        filtered = filtered.filter(a =>
            (a.titulo || '').toLowerCase().includes(s) ||
            (a.contenido || '').toLowerCase().includes(s) ||
            (a.etiquetas || []).some(t => t.toLowerCase().includes(s))
        );
    }
    if (currentSort === 'vistas') filtered = [...filtered].sort((a, b) => (b.vistas || 0) - (a.vistas || 0));
    else if (currentSort === 'util') filtered = [...filtered].sort((a, b) => (b.votosPositivos || 0) - (a.votosPositivos || 0));

    const countEl = document.getElementById('articulosCount');
    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = allArticulos.length === 0 ? 'flex' : 'none';
        if (allArticulos.length > 0) {
            list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:0.84rem;">
                <i class="bi bi-search" style="font-size:1.4rem;display:block;margin-bottom:8px;"></i>
                No se encontraron artículos con ese filtro.</div>`;
        }
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = filtered.map(a => {
        const excerpt = (a.contenido || '').replace(/[#*`_]/g, '').slice(0, 140) + '…';
        const tags    = (a.etiquetas || []).slice(0, 4).map(t => `<span class="art-tag">${esc(t)}</span>`).join('');
        const visBadge = a.visibilidad === 'agentes'
            ? '<span class="art-vis-badge art-vis-badge--agentes">Solo agentes</span>'
            : '<span class="art-vis-badge art-vis-badge--todos">Público</span>';
        const date = a.createdAt?.toDate
            ? a.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        return `
        <div class="art-card" data-art-id="${a.id}">
            <div class="art-card-body">
                <div class="art-card-cat">${esc(a.categoria || 'General')}</div>
                <div class="art-card-title">${esc(a.titulo || '—')}</div>
                <div class="art-card-excerpt">${esc(excerpt)}</div>
                <div class="art-card-meta">
                    <div class="art-card-meta-item"><i class="bi bi-eye"></i>${a.vistas || 0} vistas</div>
                    <div class="art-card-meta-item"><i class="bi bi-hand-thumbs-up"></i>${a.votosPositivos || 0}</div>
                    <div class="art-card-meta-item"><i class="bi bi-calendar3"></i>${date}</div>
                    ${a.autor ? `<div class="art-card-meta-item"><i class="bi bi-person"></i>${esc(a.autor)}</div>` : ''}
                </div>
                ${tags ? `<div class="art-card-tags">${tags}</div>` : ''}
            </div>
            <div class="art-card-right">${visBadge}<i class="bi bi-chevron-right art-card-arrow"></i></div>
        </div>`;
    }).join('');

    // FIX: event delegation for article cards
    list.querySelectorAll('.art-card').forEach(card => {
        card.addEventListener('click', () => openArticulo(card.dataset.artId));
    });
}

// ── Open article ──────────────────────────────────────────────────
window.openArticulo = async function(id) {
    const a = allArticulos.find(x => x.id === id);
    if (!a) return;
    viewingId = id;

    _set('viewCat',    a.categoria || 'General');
    _set('viewTitulo', a.titulo || '—');

    const date = a.createdAt?.toDate
        ? a.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    document.getElementById('viewMeta').innerHTML = `
        <div class="drawer-meta-item"><i class="bi bi-calendar3"></i>${date}</div>
        ${a.autor ? `<div class="drawer-meta-item"><i class="bi bi-person"></i>${esc(a.autor)}</div>` : ''}
        <div class="drawer-meta-item"><i class="bi bi-eye"></i>${(a.vistas || 0) + 1} vistas</div>
        <div class="drawer-meta-item"><i class="bi bi-hand-thumbs-up"></i>${a.votosPositivos || 0} útil</div>`;

    document.getElementById('viewContent').innerHTML = renderMarkdown(a.contenido || '');
    document.getElementById('voteUpCount').textContent = a.votosPositivos || 0;

    const editRow = document.getElementById('artEditRow');
    if (editRow && currentUser) editRow.style.display = 'flex';

    document.getElementById('viewModal').style.display = 'flex';

    try {
        await updateDoc(doc(db, 'articulos', id), { vistas: increment(1) });
    } catch {}
};

// ── Vote ──────────────────────────────────────────────────────────
document.getElementById('btnVoteUp')?.addEventListener('click', async () => {
    if (!viewingId) return;
    try {
        await updateDoc(doc(db, 'articulos', viewingId), { votosPositivos: increment(1) });
        const cur = parseInt(document.getElementById('voteUpCount').textContent) || 0;
        document.getElementById('voteUpCount').textContent = cur + 1;
    } catch {}
});

// ── Edit / Delete ─────────────────────────────────────────────────
document.getElementById('btnEditArticulo')?.addEventListener('click', () => {
    const a = allArticulos.find(x => x.id === viewingId);
    if (!a) return;
    document.getElementById('viewModal').style.display = 'none';
    document.getElementById('artEditId').value    = a.id;
    document.getElementById('artTitulo').value    = a.titulo || '';
    document.getElementById('artCategoria').value = a.categoria || 'General';
    document.getElementById('artEtiquetas').value = (a.etiquetas || []).join(', ');
    document.getElementById('artContenido').value = a.contenido || '';
    const visEl = document.querySelector(`input[name="artVisibilidad"][value="${a.visibilidad || 'todos'}"]`);
    if (visEl) visEl.checked = true;
    document.getElementById('articuloModal').style.display = 'flex';
    document.getElementById('artModalTitle').textContent   = 'Editar artículo';
    document.getElementById('artSubmitLabel').textContent  = 'Guardar cambios';
});

document.getElementById('btnDeleteArticulo')?.addEventListener('click', async () => {
    if (!viewingId) return;
    if (!confirm('¿Eliminar este artículo permanentemente? Esta acción no se puede deshacer.')) return;
    try {
        await deleteDoc(doc(db, 'articulos', viewingId));
        document.getElementById('viewModal').style.display = 'none';
    } catch { alert('Error al eliminar.'); }
});

// ── Create / Update article ───────────────────────────────────────
document.getElementById('articuloForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('artModalStatus');
    const btn      = document.getElementById('artSubmitBtn');
    const editId   = document.getElementById('artEditId').value;

    const titulo      = document.getElementById('artTitulo').value.trim();
    const categoria   = document.getElementById('artCategoria').value;
    const etiquetasRaw= document.getElementById('artEtiquetas').value;
    const contenido   = document.getElementById('artContenido').value.trim();
    const visibilidad = document.querySelector('input[name="artVisibilidad"]:checked')?.value || 'todos';

    if (!titulo)    { showMsg(statusEl, 'error', 'El título es obligatorio.'); return; }
    if (!contenido) { showMsg(statusEl, 'error', 'El contenido es obligatorio.'); return; }

    const etiquetas = etiquetasRaw.split(',').map(t => t.trim()).filter(Boolean);
    const autor     = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Agente';

    showMsg(statusEl, 'loading', editId ? 'Guardando cambios…' : 'Publicando artículo…');
    btn.disabled = true;

    try {
        if (editId) {
            await updateDoc(doc(db, 'articulos', editId), { titulo, categoria, etiquetas, contenido, visibilidad, updatedAt: serverTimestamp() });
        } else {
            await addDoc(collection(db, 'articulos'), {
                titulo, categoria, etiquetas, contenido, visibilidad, autor,
                createdAt: serverTimestamp(), vistas: 0, votosPositivos: 0
            });
        }
        showMsg(statusEl, 'success', editId ? '¡Cambios guardados!' : '¡Artículo publicado!');
        setTimeout(() => {
            document.getElementById('articuloModal').style.display = 'none';
            document.getElementById('articuloForm').reset();
            document.getElementById('artEditId').value = '';
            statusEl.style.display = 'none';
            btn.disabled = false;
        }, 1200);
    } catch {
        showMsg(statusEl, 'error', 'Error al guardar. Inténtalo de nuevo.');
        btn.disabled = false;
    }
});

// ── Filters ───────────────────────────────────────────────────────
function filterByCategory(cat) { currentCat = cat; renderArticulos(); }
function filterByTag(tag) {
    const inp = document.getElementById('kbaseSearch');
    if (inp) inp.value = tag;
    currentSearch = tag;
    renderArticulos();
}
window.filterByCategory = filterByCategory;
window.filterByTag      = filterByTag;

document.getElementById('kbaseSearch')?.addEventListener('input', e => { currentSearch = e.target.value; renderArticulos(); });
document.getElementById('kbaseSort')?.addEventListener('change',  e => { currentSort   = e.target.value; renderArticulos(); });

// ── Markdown renderer ─────────────────────────────────────────────
// FIX: escape HTML first, then apply markdown — prevents XSS and malformed tags
function renderMarkdown(md) {
    const escaped = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = escaped.split('\n');
    const out   = [];
    let inUl    = false;

    for (const raw of lines) {
        let line = raw
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`(.+?)`/g,       '<code>$1</code>');

        if (/^### /.test(line)) { if (inUl) { out.push('</ul>'); inUl = false; } out.push(`<h3>${line.slice(4)}</h3>`); }
        else if (/^## /.test(line))  { if (inUl) { out.push('</ul>'); inUl = false; } out.push(`<h2>${line.slice(3)}</h2>`); }
        else if (/^# /.test(line))   { if (inUl) { out.push('</ul>'); inUl = false; } out.push(`<h2>${line.slice(2)}</h2>`); }
        else if (/^- /.test(line))   { if (!inUl) { out.push('<ul>'); inUl = true; } out.push(`<li>${line.slice(2)}</li>`); }
        else if (line.trim() === '') { if (inUl) { out.push('</ul>'); inUl = false; } }
        else                         { if (inUl) { out.push('</ul>'); inUl = false; } out.push(`<p>${line}</p>`); }
    }
    if (inUl) out.push('</ul>');
    return out.join('\n');
}

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