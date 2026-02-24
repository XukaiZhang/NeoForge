import { db, auth } from './config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import './auth.js';

const assetForm = document.getElementById('assetForm');
const inventoryBody = document.getElementById('inventoryBody');

assetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "inventory"), {
        sn: document.getElementById('serial').value.toUpperCase(),
        modelo: document.getElementById('modelo').value,
        tipo: document.getElementById('tipo').value,
        creado: serverTimestamp()
    });
    e.target.reset();
});

const invQ = query(collection(db, "inventory"), orderBy("creado", "desc"));
onSnapshot(invQ, (snap) => {
    if (!inventoryBody) return;
    inventoryBody.innerHTML = '';
    snap.forEach(d => {
        const item = d.data();
        inventoryBody.innerHTML += `
            <tr>
                <td class="fw-bold text-primary">${item.sn}</td>
                <td>${item.modelo}</td>
                <td><span class="badge-asset">${item.tipo}</span></td>
                <td><div class="health-bar"><div class="health-fill" style="width: 100%"></div></div></td>
                <td><button onclick="deleteAsset('${d.id}')" class="btn-purge">Retirar</button></td>
            </tr>
        `;
    });
});

window.deleteAsset = (id) => confirm("¿Retirar activo del inventario?") && deleteDoc(doc(db, "inventory", id));