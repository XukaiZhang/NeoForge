import { db } from './config.js';
import { collection, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ─── Uptime grid ─────────────────────────────────────────────────
function buildUptimeGrid() {
    const grid = document.getElementById('uptimeGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const days = 90;
    for (let i = 0; i < days; i++) {
        const r = Math.random();
        const status = r > 0.06 ? 'up' : r > 0.02 ? 'degraded' : 'down';
        const daysAgo = days - i;
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const label = d.toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
        const box = document.createElement('div');
        box.className = `uptime-box ${status}`;
        box.setAttribute('title', `${label} — ${status.charAt(0).toUpperCase() + status.slice(1)}`);
        grid.appendChild(box);
    }
}

// ─── Department bar chart ─────────────────────────────────────────
function buildDeptChart(tickets) {
    const container = document.getElementById('deptChart');
    if (!container) return;

    const depts = {};
    tickets.forEach(t => {
        const d = t.depto || 'Unknown';
        depts[d] = (depts[d] || 0) + 1;
    });

    const total = tickets.length || 1;
    const colors = ['c0', 'c1', 'c2', 'c3'];
    const entries = Object.entries(depts).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<div style="color:var(--text-tertiary);font-size:0.8rem;padding:20px;text-align:center">No ticket data yet</div>';
        return;
    }

    container.innerHTML = entries.map(([dept, count], i) => {
        const pct = Math.round((count / total) * 100);
        return `
            <div class="bar-group">
                <div class="bar-track">
                    <div class="bar-fill ${colors[i % colors.length]}" style="height:${Math.max(pct, 4)}%">
                        <span class="bar-val">${pct}%</span>
                    </div>
                </div>
                <div class="bar-label">${dept}</div>
            </div>
        `;
    }).join('');
}

// ─── Donut chart ──────────────────────────────────────────────────
const PRIO_CONFIG = [
    { key: 'P0', label: 'P0 Critical', color: '#ef4444' },
    { key: 'P1', label: 'P1 High',     color: '#f97316' },
    { key: 'P2', label: 'P2 Medium',   color: '#eab308' },
    { key: 'P3', label: 'P3 Low',      color: '#6366f1' },
];

function buildDonut(tickets) {
    const svg    = document.getElementById('donutSvg');
    const legend = document.getElementById('donutLegend');
    const totalEl = document.getElementById('donutTotal');
    if (!svg || !legend) return;

    const total = tickets.length;
    if (totalEl) totalEl.textContent = total;

    const counts = {};
    PRIO_CONFIG.forEach(p => counts[p.key] = 0);
    tickets.forEach(t => { if (counts[t.prioridad] !== undefined) counts[t.prioridad]++; });

    const r = 45;
    const cx = 60, cy = 60;
    const circumference = 2 * Math.PI * r;

    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-hover)" stroke-width="16"/>`;

    let offset = 0;
    PRIO_CONFIG.forEach(p => {
        const pct = total > 0 ? counts[p.key] / total : 0;
        const dash = pct * circumference;
        if (dash > 0) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', r);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', p.color);
            circle.setAttribute('stroke-width', '16');
            circle.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
            circle.setAttribute('stroke-dashoffset', -offset);
            circle.setAttribute('stroke-linecap', 'round');
            circle.style.transition = 'stroke-dasharray 0.6s ease';
            svg.appendChild(circle);
            offset += dash;
        }
    });

    legend.innerHTML = PRIO_CONFIG.map(p => `
        <div class="legend-item">
            <div class="legend-dot" style="background:${p.color}"></div>
            <span>${p.label}</span>
            <strong>${total > 0 ? Math.round((counts[p.key] / total) * 100) : 0}%</strong>
        </div>
    `).join('');
}

// ─── Sparkline trend ──────────────────────────────────────────────
function buildSparkline() {
    const svg = document.getElementById('trendSvg');
    if (!svg) return;

    // Mock 12-week data
    const opened = [12, 19, 14, 22, 17, 28, 23, 31, 19, 25, 18, 24];
    const closed = [10, 16, 18, 20, 15, 24, 26, 28, 22, 20, 21, 22];

    const W = 400, H = 120;
    const padX = 10, padY = 12;
    const maxVal = Math.max(...opened, ...closed);
    const minVal = 0;
    const xStep = (W - padX * 2) / (opened.length - 1);

    function toPath(data) {
        return data.map((v, i) => {
            const x = padX + i * xStep;
            const y = padY + (1 - (v - minVal) / (maxVal - minVal || 1)) * (H - padY * 2);
            return (i === 0 ? 'M' : 'L') + `${x},${y}`;
        }).join(' ');
    }

    function toArea(data) {
        const line = toPath(data);
        const lastX = padX + (data.length - 1) * xStep;
        return `${line} L${lastX},${H} L${padX},${H} Z`;
    }

    // Grid lines
    let gridSvg = '';
    for (let i = 0; i <= 4; i++) {
        const y = padY + (i / 4) * (H - padY * 2);
        const val = Math.round(maxVal - (i / 4) * maxVal);
        gridSvg += `<line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
        gridSvg += `<text x="${padX - 4}" y="${y + 4}" text-anchor="end" fill="var(--text-tertiary)" font-size="9" font-family="DM Mono">${val}</text>`;
    }

    svg.innerHTML = `
        ${gridSvg}
        <defs>
            <linearGradient id="openedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#818cf8" stop-opacity="0.18"/>
                <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="closedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#22c55e" stop-opacity="0.15"/>
                <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <path d="${toArea(opened)}" fill="url(#openedGrad)"/>
        <path d="${toArea(closed)}" fill="url(#closedGrad)"/>
        <path d="${toPath(opened)}" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${toPath(closed)}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
}

// ─── Live audit log ───────────────────────────────────────────────
const LOG_EVENTS = [
    { level: 'INFO',  tag: 'info-tag',    msgs: [
        'Snapshot de Firestore actualizado en /tickets',
        'User session verified successfully',
        'Inventory sync complete — 0 conflicts',
        'Scheduled health check passed',
        'Database index rebuild completed',
    ]},
    { level: 'WARN',  tag: 'warn-tag',    msgs: [
        'Alta presión de memoria en el clúster IT_DEPT',
        'API response time exceeded 800ms threshold',
        'Cuota de Firestore al 78% — supervisa el uso',
        'Rate limit approaching on auth endpoint',
    ]},
    { level: 'AUTH',  tag: 'auth-tag',    msgs: [
        'Admin session established',
        'Privilege escalation request verified',
        'Token refresh completed',
    ]},
    { level: 'ERROR', tag: 'error-tag',   msgs: [
        'Failed to reach monitoring endpoint',
        'Asset sync retry #2 — connection refused',
    ]},
    { level: 'OK',    tag: 'success-tag', msgs: [
        'Kernel inicializado — todos los servicios nominales',
        'Backup completed successfully',
        'Certificado SSL renovado — válido 90 días',
    ]},
];

let logPaused = false;
let logInterval = null;

function getLogTime() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function appendLog(level, tag, msg) {
    const body = document.getElementById('logsBody');
    if (!body || logPaused) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="log-time">${getLogTime()}</span>
        <span class="log-level ${tag}">${level}</span>
        <span class="log-msg">${msg}</span>
    `;
    body.prepend(entry);

    // Keep max 80 entries
    while (body.children.length > 80) {
        body.removeChild(body.lastChild);
    }
}

function seedInitialLogs() {
    const seeds = [
        { level: 'OK',   tag: 'success-tag', msg: 'Kernel inicializado — todos los servicios nominales' },
        { level: 'INFO', tag: 'info-tag',     msg: 'Listeners de Firestore activos en /tickets e /inventory' },
        { level: 'AUTH', tag: 'auth-tag',     msg: 'Admin session established' },
        { level: 'INFO', tag: 'info-tag',     msg: 'Panel de analíticas cargado' },
    ];
    seeds.reverse().forEach(s => appendLog(s.level, s.tag, s.msg));
}

function startLiveLog() {
    seedInitialLogs();
    logInterval = setInterval(() => {
        if (logPaused) return;
        const group = LOG_EVENTS[Math.floor(Math.random() * LOG_EVENTS.length)];
        const msg   = group.msgs[Math.floor(Math.random() * group.msgs.length)];
        appendLog(group.level, group.tag, msg);
    }, 3500);
}

document.getElementById('logClear')?.addEventListener('click', () => {
    const body = document.getElementById('logsBody');
    if (body) body.innerHTML = '';
});

// ─── Firestore integration ────────────────────────────────────────
function connectFirestore() {
    try {
        const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));
        onSnapshot(q, (snap) => {
            const tickets = snap.docs.map(d => d.data());

            // Update KPI
            const kpiEl = document.getElementById('kpiOpenTickets');
            if (kpiEl) kpiEl.textContent = tickets.length;

            // Update charts
            buildDeptChart(tickets);
            buildDonut(tickets);

            // Log the update
            appendLog('INFO', 'info-tag', `Firestore: ${tickets.length} ticket(s) en cola`);
        });
    } catch (e) {
        console.warn('Firestore no disponible — usando datos de demo');
        buildDeptChart([
            { depto: 'DevOps' }, { depto: 'DevOps' }, { depto: 'DevOps' }, { depto: 'DevOps' },
            { depto: 'SecOps' }, { depto: 'SecOps' }, { depto: 'SecOps' },
            { depto: 'Hardware' }, { depto: 'Hardware' },
        ]);
        buildDonut([
            { prioridad: 'P0' },
            { prioridad: 'P1' }, { prioridad: 'P1' },
            { prioridad: 'P2' }, { prioridad: 'P2' }, { prioridad: 'P2' },
            { prioridad: 'P3' }, { prioridad: 'P3' }, { prioridad: 'P3' },
        ]);
        const kpiEl = document.getElementById('kpiOpenTickets');
        if (kpiEl) kpiEl.textContent = '9';
    }
}

// ─── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildUptimeGrid();
    buildSparkline();
    startLiveLog();
    connectFirestore();
});