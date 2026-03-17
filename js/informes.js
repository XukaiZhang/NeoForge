import { db, auth } from './config.js';
import {
    collection, query, orderBy, onSnapshot, getDocs, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import './auth.js';

let allTickets  = [];
let currentDays = 7;

// ── Init ───────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (!user) return;

    // Nav badge
    try {
        getDocs(query(collection(db, 'tickets'), where('status', '==', 'open')))
            .then(s => { const el = document.getElementById('navTicketCount'); if (el) el.textContent = s.size; })
            .catch(() => {});
    } catch {}

    // Live tickets snapshot with fallback
    const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));
    onSnapshot(q, snap => {
        allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll(currentDays);
    }, err => {
        console.warn('informes orderBy failed, retrying:', err.message);
        onSnapshot(collection(db, 'tickets'), snap => {
            allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0));
            renderAll(currentDays);
        });
    });
});

// ── Exposed for period buttons ─────────────────────────────────────
window.loadInformes = function(days) {
    currentDays = days;
    renderAll(days);
};

// ── Main render ────────────────────────────────────────────────────
function renderAll(days) {
    const now      = Date.now();
    const cutoff   = now - days * 24 * 60 * 60 * 1000;
    const prev     = cutoff - days * 24 * 60 * 60 * 1000;

    // Split tickets into current period and previous period
    const inPeriod = allTickets.filter(t => tsMs(t.timestamp) >= cutoff);
    const inPrev   = allTickets.filter(t => { const ms = tsMs(t.timestamp); return ms >= prev && ms < cutoff; });

    renderKPIs(inPeriod, inPrev);
    renderVolumeChart(days, now, cutoff);
    renderPrioDonut();
    renderDeptBars();
    renderStatusFunnel();
    renderSLATable(inPeriod);
    renderTeamPerf(inPeriod);
}

// ── KPI cards ──────────────────────────────────────────────────────
function renderKPIs(cur, prev) {
    const total    = cur.length;
    const resolved = cur.filter(t => ['resolved','closed'].includes(t.status)).length;
    const prevRes  = prev.filter(t => ['resolved','closed'].includes(t.status)).length;

    // Avg resolution time (ms) for resolved tickets with resolvedAt field
    let avgMs = 0;
    const withTime = cur.filter(t => t.resolvedAt && t.timestamp);
    if (withTime.length > 0) {
        avgMs = withTime.reduce((s, t) => {
            const created  = tsMs(t.timestamp);
            const resolved = tsMs(t.resolvedAt);
            return s + Math.max(0, resolved - created);
        }, 0) / withTime.length;
    }
    const avgLabel = avgMs > 0 ? formatDuration(avgMs) : '—';

    // SLA compliance: P0 < 15min, P1 < 1h, P2 < 4h, P3 < 24h
    const slaLimits = { P0: 15*60*1000, P1: 60*60*1000, P2: 4*60*60*1000, P3: 24*60*60*1000 };
    const resTickets = cur.filter(t => t.resolvedAt && t.timestamp);
    const slaOk = resTickets.filter(t => {
        const duration = tsMs(t.resolvedAt) - tsMs(t.timestamp);
        return duration <= (slaLimits[t.prioridad] ?? Infinity);
    }).length;
    const slaPct = resTickets.length > 0 ? Math.round((slaOk / resTickets.length) * 100) : '—';

    _set('kpiTotalTickets', total);
    _set('kpiResueltos',    resolved);
    _set('kpiTiempoMedio',  avgLabel);
    _set('kpiSLA',          slaPct !== '—' ? slaPct + '%' : '—');

    // Deltas
    const deltaRes = resolved - prevRes;
    const deltaEl  = document.getElementById('kpiResueltosDelta');
    if (deltaEl) {
        deltaEl.textContent  = deltaRes >= 0 ? `+${deltaRes} vs periodo anterior` : `${deltaRes} vs periodo anterior`;
        deltaEl.className    = 'kpi-delta ' + (deltaRes >= 0 ? 'kpi-delta--good' : 'kpi-delta--bad');
    }
    const slaEl = document.getElementById('slaIcon');
    if (slaEl && typeof slaPct === 'number') {
        slaEl.style.background = slaPct >= 90 ? 'var(--green-faint)' : slaPct >= 70 ? 'var(--yellow-faint)' : 'var(--red-faint)';
        slaEl.style.color      = slaPct >= 90 ? 'var(--green)'       : slaPct >= 70 ? 'var(--yellow)'       : 'var(--red)';
    }
}

// ── Volume sparkline ───────────────────────────────────────────────
function renderVolumeChart(days, now, cutoff) {
    const svg    = document.getElementById('volumeSvg');
    const labels = document.getElementById('volumeLabels');
    if (!svg) return;

    const buckets = [];
    for (let i = 0; i < days; i++) {
        const dayStart = cutoff + i * 86400000;
        const dayEnd   = dayStart + 86400000;
        const opened   = allTickets.filter(t => { const ms = tsMs(t.timestamp); return ms >= dayStart && ms < dayEnd; }).length;
        const closed   = allTickets.filter(t => {
            if (!['resolved','closed'].includes(t.status)) return false;
            const ms = tsMs(t.resolvedAt || t.timestamp);
            return ms >= dayStart && ms < dayEnd;
        }).length;
        const d = new Date(dayStart);
        buckets.push({ label: d.toLocaleDateString('es-ES', { day:'2-digit', month:'short' }), opened, closed });
    }

    const maxVal = Math.max(...buckets.map(b => Math.max(b.opened, b.closed)), 1);
    const W = 600, H = 120, pad = 16;
    const xStep = buckets.length > 1 ? (W - pad*2) / (buckets.length - 1) : W - pad*2;

    const pointsOpen   = buckets.map((b, i) => `${pad + i*xStep},${H - pad - (b.opened/maxVal)*(H - pad*2)}`).join(' ');
    const pointsClosed = buckets.map((b, i) => `${pad + i*xStep},${H - pad - (b.closed/maxVal)*(H - pad*2)}`).join(' ');

    svg.innerHTML = `
        <polyline points="${pointsOpen}"   fill="none" stroke="var(--accent-light)" stroke-width="2" stroke-linejoin="round"/>
        <polyline points="${pointsClosed}" fill="none" stroke="var(--green)"        stroke-width="2" stroke-linejoin="round"/>
        ${buckets.map((b, i) => `
            <circle cx="${pad + i*xStep}" cy="${H - pad - (b.opened/maxVal)*(H-pad*2)}" r="3" fill="var(--accent-light)"/>
            <circle cx="${pad + i*xStep}" cy="${H - pad - (b.closed/maxVal)*(H-pad*2)}" r="3" fill="var(--green)"/>
        `).join('')}`;

    if (labels) {
        const show = days <= 14 ? buckets : buckets.filter((_, i) => i % Math.ceil(days/7) === 0);
        labels.innerHTML = show.map(b => `<span>${b.label}</span>`).join('');
    }
}

// ── Priority donut ─────────────────────────────────────────────────
function renderPrioDonut() {
    const svg     = document.getElementById('prioDonutSvg');
    const legend  = document.getElementById('prioDonutLegend');
    const totalEl = document.getElementById('prioDonutTotal');
    if (!svg) return;

    const open   = allTickets.filter(t => ['open','in-progress'].includes(t.status || 'open'));
    const total  = open.length;
    if (totalEl) totalEl.textContent = total;

    const config = [
        { key:'P0', label:'P0 Crítico', color:'#ef4444' },
        { key:'P1', label:'P1 Alto',    color:'#f97316' },
        { key:'P2', label:'P2 Medio',   color:'#eab308' },
        { key:'P3', label:'P3 Bajo',    color:'#6366f1' },
    ];
    const counts = {};
    config.forEach(c => { counts[c.key] = open.filter(t => t.prioridad === c.key).length; });

    const r = 46, cx = 60, cy = 60, circ = 2 * Math.PI * r;
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-hover)" stroke-width="12"/>`;
    let offset = 0;
    config.forEach(c => {
        const pct  = total > 0 ? counts[c.key] / total : 0;
        const dash = pct * circ;
        if (dash > 0.5) {
            const el = document.createElementNS('http://www.w3.org/2000/svg','circle');
            el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
            el.setAttribute('fill','none'); el.setAttribute('stroke', c.color);
            el.setAttribute('stroke-width','12');
            el.setAttribute('stroke-dasharray', `${dash} ${circ - dash}`);
            el.setAttribute('stroke-dashoffset', `-${offset}`);
            svg.appendChild(el);
            offset += dash;
        }
    });

    if (legend) {
        legend.innerHTML = config.map(c => `
            <div class="inf-leg-row">
                <div class="inf-leg-dot" style="background:${c.color}"></div>
                <span>${c.label}</span>
                <span class="inf-leg-count">${counts[c.key]}</span>
            </div>`).join('');
    }
}

// ── Dept bar chart ─────────────────────────────────────────────────
function renderDeptBars() {
    const container = document.getElementById('deptBarChart');
    if (!container) return;

    const open  = allTickets.filter(t => ['open','in-progress'].includes(t.status || 'open'));
    const depts = {};
    open.forEach(t => { const d = t.depto || 'Sin depto'; depts[d] = (depts[d]||0) + 1; });
    const entries = Object.entries(depts).sort((a,b) => b[1]-a[1]);

    if (entries.length === 0) { container.innerHTML = '<div style="color:var(--text-tertiary);font-size:0.8rem;padding:12px 0">Sin datos</div>'; return; }

    const max = entries[0][1] || 1;
    const colors = ['var(--accent-light)','var(--green)','var(--yellow)','var(--orange)','var(--red)'];
    container.innerHTML = entries.map(([dept, n], i) => `
        <div class="inf-dept-row">
            <div class="inf-dept-label">${esc(dept)}</div>
            <div class="inf-dept-track"><div class="inf-dept-fill" style="width:${Math.round(n/max*100)}%;background:${colors[i%colors.length]}"></div></div>
            <div class="inf-dept-val">${n}</div>
        </div>`).join('');
}

// ── Status funnel ──────────────────────────────────────────────────
function renderStatusFunnel() {
    const container = document.getElementById('statusFunnel');
    if (!container) return;

    const statuses = [
        { key:'open',        label:'Abierto',    color:'var(--blue)' },
        { key:'in-progress', label:'En proceso', color:'var(--yellow)' },
        { key:'resolved',    label:'Resuelto',   color:'var(--green)' },
        { key:'closed',      label:'Cerrado',    color:'var(--text-tertiary)' },
    ];
    const total = allTickets.length || 1;
    container.innerHTML = statuses.map(s => {
        const n   = allTickets.filter(t => (t.status || 'open') === s.key).length;
        const pct = Math.round(n / total * 100);
        return `
        <div class="inf-funnel-row">
            <div class="inf-funnel-label">${s.label}</div>
            <div class="inf-funnel-track"><div class="inf-funnel-fill" style="width:${pct}%;background:${s.color}"></div></div>
            <div class="inf-funnel-val">${n} <small>(${pct}%)</small></div>
        </div>`;
    }).join('');
}

// ── SLA table ──────────────────────────────────────────────────────
function renderSLATable(periodTickets) {
    const container = document.getElementById('slaTable');
    if (!container) return;

    const slaLimits = { P0:15*60*1000, P1:60*60*1000, P2:4*60*60*1000, P3:24*60*60*1000 };
    const rows = ['P0','P1','P2','P3'].map(p => {
        const tickets = periodTickets.filter(t => t.prioridad === p && t.resolvedAt && t.timestamp);
        const ok  = tickets.filter(t => (tsMs(t.resolvedAt) - tsMs(t.timestamp)) <= slaLimits[p]).length;
        const pct = tickets.length > 0 ? Math.round(ok/tickets.length*100) : null;
        const color = pct === null ? 'var(--text-tertiary)' : pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)';
        return { p, pct, total: tickets.length, color };
    });

    container.innerHTML = rows.map(r => `
        <div class="inf-sla-row">
            <span class="prio-tag prio-${r.p}">${r.p}</span>
            <div class="inf-sla-track"><div class="inf-sla-fill" style="width:${r.pct ?? 0}%;background:${r.color}"></div></div>
            <span class="inf-sla-pct" style="color:${r.color}">${r.pct !== null ? r.pct+'%' : '—'}</span>
            <span class="inf-sla-detail">${r.total} tickets</span>
        </div>`).join('');
}

// ── Team performance ───────────────────────────────────────────────
function renderTeamPerf(periodTickets) {
    const container = document.getElementById('teamPerf');
    if (!container) return;

    // Count by resolvedBy first, then fall back to assignedEmail
    const counts = {};
    periodTickets
        .filter(t => ['resolved','closed'].includes(t.status))
        .forEach(t => {
            const agent = t.resolvedBy || t.assignedEmail;
            if (agent) counts[agent] = (counts[agent]||0) + 1;
        });

    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5);
    if (sorted.length === 0) {
        container.innerHTML = '<div style="color:var(--text-tertiary);font-size:0.8rem;padding:12px 0">Sin datos en este periodo</div>';
        return;
    }
    const max = sorted[0][1] || 1;
    container.innerHTML = sorted.map(([agent, n]) => {
        const name = agent.split('@')[0];
        const pct  = Math.round(n/max*100);
        return `
        <div class="inf-team-row">
            <div class="inf-team-avatar">${name.charAt(0).toUpperCase()}</div>
            <div class="inf-team-info">
                <div class="inf-team-name">${esc(name)}</div>
                <div class="inf-team-bar-wrap"><div class="inf-team-bar" style="width:${pct}%"></div></div>
            </div>
            <div class="inf-team-count">${n}</div>
        </div>`;
    }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────
function tsMs(ts) {
    if (!ts) return 0;
    if (ts.toDate) return ts.toDate().getTime();
    if (ts.seconds) return ts.seconds * 1000;
    return new Date(ts).getTime() || 0;
}
function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 24) return Math.floor(h/24) + 'd ' + (h%24) + 'h';
    if (h > 0)  return h + 'h ' + m + 'min';
    return m + ' min';
}
function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }