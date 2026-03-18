// notifications.js — Sistema de notificaciones toast compartido
// Importado por tickets.js (agentes) y mis-tickets.js (clientes)

const TOAST_DURATION = 4500;
let toastQueue = [];
let toastVisible = false;

// ── Mostrar toast ──────────────────────────────────────────────────
export function showToast(msg, type = 'info', opts = {}) {
    toastQueue.push({ msg, type, opts });
    if (!toastVisible) processQueue();
}

function processQueue() {
    if (toastQueue.length === 0) { toastVisible = false; return; }
    toastVisible = true;
    const { msg, type, opts } = toastQueue.shift();
    renderToast(msg, type, opts);
}

function renderToast(msg, type, opts) {
    // Remove existing
    document.querySelector('.nf-toast')?.remove();

    const icons = {
        success: 'bi-check-circle-fill',
        error:   'bi-exclamation-circle-fill',
        info:    'bi-info-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        ticket:  'bi-ticket-perforated-fill',
    };
    const colors = {
        success: { border: 'rgba(34,197,94,0.35)',  icon: 'var(--green)' },
        error:   { border: 'rgba(239,68,68,0.35)',   icon: 'var(--red)' },
        info:    { border: 'rgba(99,102,241,0.35)',  icon: 'var(--accent-light)' },
        warning: { border: 'rgba(234,179,8,0.35)',   icon: 'var(--yellow)' },
        ticket:  { border: 'rgba(99,102,241,0.35)',  icon: 'var(--accent-light)' },
    };

    const c = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    const toast = document.createElement('div');
    toast.className = 'nf-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        background: var(--bg-surface);
        border: 1px solid ${c.border};
        border-radius: var(--radius-md);
        padding: 14px 18px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        min-width: 280px;
        max-width: 380px;
        animation: toastSlideIn 0.3s cubic-bezier(0.34,1.4,0.64,1);
        font-family: var(--font-sans);
    `;

    const subtitle = opts.subtitle ? `<div style="font-size:0.74rem;color:var(--text-tertiary);margin-top:3px">${esc(opts.subtitle)}</div>` : '';
    const actionBtn = opts.action ? `<button class="nf-toast-action" style="margin-top:8px;padding:5px 12px;background:var(--accent-faint);border:1px solid rgba(99,102,241,0.3);border-radius:var(--radius-sm);color:var(--accent-light);font-size:0.75rem;cursor:pointer;font-family:var(--font-sans)">${esc(opts.action.label)}</button>` : '';

    toast.innerHTML = `
        <i class="bi ${icon}" style="color:${c.icon};font-size:1.15rem;flex-shrink:0;margin-top:1px"></i>
        <div style="flex:1;min-width:0">
            <div style="font-size:0.84rem;font-weight:500;color:var(--text-primary)">${esc(msg)}</div>
            ${subtitle}
            ${actionBtn}
        </div>
        <button class="nf-toast-close" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:0;font-size:0.9rem;flex-shrink:0;margin-top:1px">
            <i class="bi bi-x"></i>
        </button>
    `;

    // Progress bar
    const progress = document.createElement('div');
    progress.style.cssText = `
        position:absolute;bottom:0;left:0;height:3px;
        background:${c.icon};border-radius:0 0 var(--radius-md) var(--radius-md);
        width:100%;transition:width ${TOAST_DURATION}ms linear;
    `;
    toast.style.position = 'fixed';
    toast.appendChild(progress);

    document.body.appendChild(toast);

    // Add slide-in keyframe if not present
    if (!document.getElementById('nf-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'nf-toast-styles';
        style.textContent = `
            @keyframes toastSlideIn { from { opacity:0; transform:translateY(12px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes toastSlideOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(8px); } }
        `;
        document.head.appendChild(style);
    }

    // Start progress bar
    requestAnimationFrame(() => { progress.style.width = '0%'; });

    // Close handlers
    const close = () => {
        toast.style.animation = 'toastSlideOut 0.2s ease forwards';
        setTimeout(() => {
            toast.remove();
            setTimeout(processQueue, 150);
        }, 200);
    };

    toast.querySelector('.nf-toast-close').addEventListener('click', close);
    if (opts.action) {
        toast.querySelector('.nf-toast-action')?.addEventListener('click', () => {
            opts.action.fn?.();
            close();
        });
    }

    setTimeout(close, TOAST_DURATION);
}

function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Watcher para agentes: detecta tickets nuevos en tiempo real ────
let _prevTicketIds = null;

export function watchNewTickets(allTickets) {
    const currentIds = new Set(allTickets.map(t => t.id));

    if (_prevTicketIds === null) {
        // Primera carga — solo inicializar, no notificar
        _prevTicketIds = currentIds;
        return;
    }

    // Detectar tickets nuevos
    allTickets.forEach(t => {
        if (!_prevTicketIds.has(t.id)) {
            const prioLabels = { P0:'🔴 Crítico', P1:'🟠 Alto', P2:'🟡 Medio', P3:'🔵 Bajo' };
            showToast(
                t.titulo || 'Nuevo ticket',
                t.prioridad === 'P0' ? 'error' : t.prioridad === 'P1' ? 'warning' : 'ticket',
                {
                    subtitle: `${prioLabels[t.prioridad] || t.prioridad} · ${t.depto || '—'}`,
                    action: { label: 'Ver ticket', fn: () => window.openDrawer?.(t) }
                }
            );
        }
    });

    // Detectar cambios de estado en tickets existentes
    allTickets.forEach(t => {
        if (_prevTicketIds.has(t.id)) {
            const prev = _prevStatusMap?.get(t.id);
            if (prev && prev !== t.status) {
                const labels = { open:'Abierto', 'in-progress':'En proceso', resolved:'✓ Resuelto', closed:'Cerrado' };
                showToast(
                    `Estado actualizado: ${labels[t.status] || t.status}`,
                    t.status === 'resolved' ? 'success' : 'info',
                    { subtitle: t.titulo || '—' }
                );
            }
        }
    });

    _prevTicketIds  = currentIds;
    _prevStatusMap  = new Map(allTickets.map(t => [t.id, t.status]));
}

let _prevStatusMap = null;

// ── Watcher para clientes: detecta cambios de estado en sus tickets
let _prevClientStatusMap = null;

export function watchTicketStatusChanges(allTickets) {
    if (_prevClientStatusMap === null) {
        _prevClientStatusMap = new Map(allTickets.map(t => [t.id, t.status]));
        return;
    }

    allTickets.forEach(t => {
        const prev = _prevClientStatusMap.get(t.id);
        if (prev && prev !== t.status) {
            const msgs = {
                'in-progress': { msg: '¡Tu ticket está siendo atendido!', type: 'info' },
                'resolved':    { msg: '¡Tu ticket ha sido resuelto!',     type: 'success' },
                'closed':      { msg: 'Tu ticket ha sido cerrado.',        type: 'info' },
                'open':        { msg: 'Tu ticket ha sido reabierto.',      type: 'warning' },
            };
            const n = msgs[t.status];
            if (n) showToast(n.msg, n.type, { subtitle: t.titulo || '—' });
        }
    });

    _prevClientStatusMap = new Map(allTickets.map(t => [t.id, t.status]));
}