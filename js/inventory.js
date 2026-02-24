import { db, auth } from './config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const assetForm     = document.getElementById('assetForm');
const inventoryBody = document.getElementById('inventoryBody');
const searchInput   = document.getElementById('assetSearch');
const emptyState    = document.getElementById('emptyState');

let allAssets = [];

// ── Register ───────────────────────────────────────────────────────
assetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving…';

    try {
        await addDoc(collection(db, 'inventory'), {
            sn:       document.getElementById('serial').value.toUpperCase().trim(),
            modelo:   document.getElementById('modelo').value.trim(),
            tipo:     document.getElementById('tipo').value,
            creado:   serverTimestamp(),
            operator: auth.currentUser?.email ?? 'unknown'
        });
        e.target.reset();
    } catch (err) {
        console.error('Asset registration failed:', err);
        alert('Failed to register asset. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-plus-lg"></i> Register';
    }
});

// ── Real-time ──────────────────────────────────────────────────────
const invQ = query(collection(db, 'inventory'), orderBy('creado', 'desc'));

onSnapshot(invQ, (snap) => {
    allAssets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCounters(allAssets);
    renderAssets(filterAssets(allAssets, searchInput?.value ?? ''));
});

// ── Search ─────────────────────────────────────────────────────────
searchInput?.addEventListener('input', () => {
    renderAssets(filterAssets(allAssets, searchInput.value));
});

// ── Render ─────────────────────────────────────────────────────────
function renderAssets(assets) {
    if (!inventoryBody) return;

    const countEl = document.getElementById('assetCount');
    if (countEl) countEl.textContent = assets.length;

    if (assets.length === 0) {
        inventoryBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    inventoryBody.innerHTML = assets.map(item => {
        const date = item.creado?.toDate?.()
            ? item.creado.toDate().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
            : '—';

        return `
            <tr class="fade-in">
                <td><span class="serial-cell">${esc(item.sn)}</span></td>
                <td style="font-size:0.83rem">${esc(item.modelo)}</td>
                <td><span class="type-badge type-${item.tipo}">${esc(item.tipo)}</span></td>
                <td>
                    <div class="health-bar" title="Health: 85%">
                        <div class="health-fill" style="width:85%"></div>
                    </div>
                </td>
                <td style="font-size:0.77rem;color:var(--text-tertiary);font-family:var(--font-mono)">${date}</td>
                <td>
                    <button onclick="deleteAsset('${item.id}')" class="btn-purge">
                        <i class="bi bi-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ── Counters ───────────────────────────────────────────────────────
function updateCounters(assets) {
    const c = { Workstation: 0, Mobile: 0, Server: 0 };
    assets.forEach(a => { if (c[a.tipo] !== undefined) c[a.tipo]++; });

    const ids = { Workstation: 'countWorkstation', Mobile: 'countMobile', Server: 'countServer' };
    Object.entries(ids).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = c[k];
    });
    const ttl = document.getElementById('countTotal');
    if (ttl) ttl.textContent = assets.length;
}

// ── Filter ─────────────────────────────────────────────────────────
function filterAssets(assets, q) {
    if (!q.trim()) return assets;
    const s = q.toLowerCase();
    return assets.filter(a =>
        a.sn?.toLowerCase().includes(s) ||
        a.modelo?.toLowerCase().includes(s) ||
        a.tipo?.toLowerCase().includes(s)
    );
}

// ── Delete ─────────────────────────────────────────────────────────
window.deleteAsset = async (id) => {
    if (!confirm('Remove this asset from inventory? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'inventory', id));
    } catch (e) {
        alert('Failed to remove asset.');
    }
};

function esc(s = '') {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}