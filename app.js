// ============================================================================
// IMPORTACIONES (Versión 10+ Modular)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    serverTimestamp, doc, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============================================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ============================================================================
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "neoforge-xxx.firebaseapp.com",
    projectId: "neoforge-xxx",
    storageBucket: "neoforge-xxx.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado global de la aplicación
let currentUser = null;
let isLoginMode = true; // Controla si mostramos form de Login o Registro

// ============================================================================
// REFERENCIAS DOM Y UI HELPERS
// ============================================================================
const views = {
    auth: document.getElementById('authView'),
    app: document.getElementById('appView'),
    userMenu: document.getElementById('userMenu')
};

const ui = {
    formAuth: document.getElementById('authForm'),
    btnAuthToggle: document.getElementById('toggleAuthMode'),
    authTitle: document.getElementById('authTitle'),
    btnAuthSubmit: document.getElementById('btnAuthSubmit'),
    btnLogout: document.getElementById('btnLogout'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    
    formTicket: document.getElementById('ticketForm'),
    ticketsBody: document.getElementById('ticketsBody'),
    emptyState: document.getElementById('emptyState'),
    
    // Stats
    statTotal: document.getElementById('statTotal'),
    statOpen: document.getElementById('statOpen'),
    statResolved: document.getElementById('statResolved')
};

// Función para mostrar notificaciones Toast
function showToast(message, type = 'primary') {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toastMessage');
    toastBody.textContent = message;
    
    toastEl.className = `toast align-items-center text-bg-${type} border-0`;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// ============================================================================
// MÓDULO DE AUTENTICACIÓN (IAM)
// ============================================================================

// Listener de estado de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado: Mostrar Dashboard
        currentUser = user;
        ui.userEmailDisplay.textContent = user.email;
        views.auth.classList.add('d-none');
        views.app.classList.remove('d-none');
        views.userMenu.classList.remove('d-none');
        showToast(`Bienvenido/a, ${user.email}`, 'success');
        initAppListeners(); // Iniciar carga de datos
    } else {
        // Usuario no logueado: Mostrar Login
        currentUser = null;
        views.auth.classList.remove('d-none');
        views.app.classList.add('d-none');
        views.userMenu.classList.add('d-none');
    }
});

// Alternar entre Login y Registro
ui.btnAuthToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    ui.authTitle.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    ui.btnAuthSubmit.textContent = isLoginMode ? 'Entrar al Sistema' : 'Registrar Cuenta';
    ui.btnAuthToggle.textContent = isLoginMode ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión';
});

// Manejo del formulario de Autenticación
ui.formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
        ui.formAuth.reset();
    } catch (error) {
        console.error("Auth Error:", error);
        showToast(error.message.includes('auth/invalid-credential') ? 'Credenciales incorrectas' : 'Error en la autenticación', 'danger');
    }
});

// Cerrar sesión
ui.btnLogout.addEventListener('click', () => {
    signOut(auth);
    showToast('Sesión cerrada con éxito', 'info');
});


// ============================================================================
// MÓDULO CORE: LÓGICA DE TICKETS Y NEGOCIO
// ============================================================================

function calcularSLA(prioridad) {
    const fechaActual = new Date();
    const mapHoras = { 'Crítica': 2, 'Alta': 4, 'Media': 24, 'Baja': 48 };
    fechaActual.setHours(fechaActual.getHours() + (mapHoras[prioridad] || 24));
    return fechaActual;
}

// Crear Ticket
ui.formTicket.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const ticketData = {
        titulo: document.getElementById('titulo').value,
        descripcion: document.getElementById('descripcion').value,
        departamento: document.getElementById('departamento').value,
        prioridad: document.getElementById('prioridad').value,
        estado: 'Abierto',
        slaVencimiento: calcularSLA(document.getElementById('prioridad').value).getTime(),
        fechaCreacion: serverTimestamp(),
        creadoPor: currentUser.email, // Auditoría
        creadorId: currentUser.uid
    };

    try {
        await addDoc(collection(db, "tickets"), ticketData);
        ui.formTicket.reset();
        showToast('Ticket desplegado correctamente', 'success');
    } catch (error) {
        console.error("Error al añadir:", error);
        showToast('Error al procesar el ticket en servidor', 'danger');
    }
});

// Listener en tiempo real de la tabla
let isListening = false;
function initAppListeners() {
    if (isListening) return; // Evitar múltiples suscripciones si entra/sale rápido
    isListening = true;

    const ticketsQuery = query(collection(db, "tickets"), orderBy("estado", "asc"), orderBy("slaVencimiento", "asc"));

    onSnapshot(ticketsQuery, (snapshot) => {
        ui.ticketsBody.innerHTML = '';
        
        let countTotal = snapshot.size;
        let countOpen = 0;
        let countResolved = 0;

        if (countTotal === 0) {
            ui.emptyState.classList.remove('d-none');
            ui.ticketsBody.parentElement.classList.add('d-none');
        } else {
            ui.emptyState.classList.add('d-none');
            ui.ticketsBody.parentElement.classList.remove('d-none');
        }

        const now = new Date().getTime();

        snapshot.forEach((docSnap) => {
            const ticket = docSnap.data();
            const ticketId = docSnap.id;
            
            // Actualizar contadores
            ticket.estado === 'Resuelto' ? countResolved++ : countOpen++;

            // Lógica UI
            const fechaLegible = new Date(ticket.slaVencimiento).toLocaleString('es-ES', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' 
            });
            
            const isOverdue = ticket.estado !== 'Resuelto' && ticket.slaVencimiento < now;
            const slaClass = isOverdue ? 'sla-overdue text-danger' : 'text-info';
            const iconSla = isOverdue ? '<i class="bi bi-exclamation-triangle-fill"></i> ' : '';

            const badgeClass = `badge-${ticket.prioridad.toLowerCase()}`;
            const estadoClass = ticket.estado === 'Abierto' ? 'badge-abierto' : 'badge-resuelto';

            // HTML de la fila. Usamos window.updateTicketStatus para invocar funciones desde el DOM generado dinámicamente
            const row = `
                <tr class="${ticket.estado === 'Resuelto' ? 'opacity-50' : ''}">
                    <td>
                        <div class="fw-bold">${ticket.titulo}</div>
                        <div class="small text-muted" style="font-size: 0.75rem;">Por: ${ticket.creadoPor}</div>
                    </td>
                    <td><span class="text-secondary"><i class="bi bi-building"></i> ${ticket.departamento}</span></td>
                    <td><span class="badge rounded-pill ${badgeClass}">${ticket.prioridad}</span></td>
                    <td><span class="badge ${estadoClass}">${ticket.estado}</span></td>
                    <td class="font-monospace ${slaClass} small">${iconSla}${fechaLegible}</td>
                    <td class="text-end">
                        ${ticket.estado === 'Abierto' ? 
                            `<button class="btn btn-sm btn-outline-success" onclick="window.updateTicketStatus('${ticketId}', 'Resuelto')" title="Marcar como Resuelto">
                                <i class="bi bi-check2-all"></i>
                            </button>` 
                            : ''
                        }
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteTicket('${ticketId}')" title="Eliminar Registro">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            ui.ticketsBody.innerHTML += row;
        });

        // Actualizar UI de Estadísticas
        ui.statTotal.textContent = countTotal;
        ui.statOpen.textContent = countOpen;
        ui.statResolved.textContent = countResolved;
    });
}

// ============================================================================
// FUNCIONES GLOBALES (Llamadas desde el HTML inyectado)
// ============================================================================
window.updateTicketStatus = async (id, newStatus) => {
    try {
        const ticketRef = doc(db, "tickets", id);
        await updateDoc(ticketRef, { estado: newStatus });
        showToast('Estado de ticket actualizado', 'success');
    } catch (error) {
        console.error("Error al actualizar:", error);
        showToast('Error de comunicación con base de datos', 'danger');
    }
};

window.deleteTicket = async (id) => {
    if(!confirm('¿Estás seguro de que deseas eliminar este ticket permanentemente?')) return;
    try {
        await deleteDoc(doc(db, "tickets", id));
        showToast('Registro eliminado', 'warning');
    } catch (error) {
        console.error("Error al eliminar:", error);
        showToast('Error al intentar eliminar', 'danger');
    }
};