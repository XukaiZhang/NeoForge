import { db, auth } from './config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const ticketForm = document.getElementById('ticketForm');
const ticketsBody = document.getElementById('ticketsBody');

ticketForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        titulo: document.getElementById('titulo').value,
        descripcion: document.getElementById('descripcion').value,
        depto: document.getElementById('departamento').value,
        prioridad: document.getElementById('prioridad').value,
        timestamp: serverTimestamp(),
        operator: auth.currentUser.email
    };

    try {
        await addDoc(collection(db, "tickets"), payload);
        e.target.reset();
    } catch (error) { console.error("Error al crear ticket:", error); }
});

const q = query(collection(db, "tickets"), orderBy("timestamp", "desc"));
onSnapshot(q, (snapshot) => {
    if (!ticketsBody) return;
    ticketsBody.innerHTML = '';
    document.getElementById('ticketCount').textContent = snapshot.size;

    snapshot.forEach(docSnap => {
        const t = docSnap.data();
        const id = docSnap.id;
        
        ticketsBody.innerHTML += `
            <tr>
                <td class="small text-muted fw-bold">#${id.slice(-4).toUpperCase()}</td>
                <td>
                    <div class="fw-bold">${t.titulo}</div>
                    <div class="text-muted x-small" style="font-size:0.75rem">${t.operator}</div>
                </td>
                <td><span class="prio-tag prio-${t.prioridad}">${t.prioridad}</span></td>
                <td><span class="badge bg-success-subtle text-success border border-success-subtle">Abierto</span></td>
                <td><button onclick="purgeTicket('${id}')" class="btn-purge">Gestionar</button></td>
            </tr>
        `;
    });
});

window.purgeTicket = (id) => confirm("¿Deseas cerrar y eliminar este ticket?") && deleteDoc(doc(db, "tickets", id));