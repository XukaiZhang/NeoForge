import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * CONFIGURACIÓN DE FIREBASE
 * Sustituye este objeto por el que te proporcionó la consola de Firebase en el Paso 1.
 */
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "neoforge-xxx.firebaseapp.com",
  projectId: "neoforge-xxx",
  storageBucket: "neoforge-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Inicializamos la aplicación de Firebase y el servicio de Base de Datos (Firestore)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Referencias a los elementos del DOM (Document Object Model)
const ticketForm = document.getElementById('ticketForm');
const ticketsBody = document.getElementById('ticketsBody');

/**
 * LÓGICA DE SLA (Service Level Agreement)
 * Calcula la fecha límite de resolución sumando horas a la fecha actual según la prioridad.
 * @param {string} prioridad - La prioridad seleccionada en el formulario.
 * @returns {Date} - Objeto fecha con el límite calculado.
 */
function calcularSLA(prioridad) {
    const fechaActual = new Date();
    let horasAsignadas = 0;

    // Estructura de control para asignar las horas de SLA
    switch (prioridad) {
        case 'Crítica':
            horasAsignadas = 2;
            break;
        case 'Alta':
            horasAsignadas = 4;
            break;
        case 'Media':
            horasAsignadas = 24;
            break;
        case 'Baja':
            horasAsignadas = 48;
            break;
    }

    // Modificamos el objeto fecha añadiéndole las horas correspondientes
    fechaActual.setHours(fechaActual.getHours() + horasAsignadas);
    return fechaActual;
}

/**
 * EVENTO DE ENVÍO DEL FORMULARIO
 * Interceptamos el envío por defecto para procesar los datos con JS y subirlos a la nube.
 */
ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    // Recogemos los valores actuales del formulario
    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;
    const departamento = document.getElementById('departamento').value;
    const prioridad = document.getElementById('prioridad').value;

    // Obtenemos la fecha límite calculada
    const fechaSLA = calcularSLA(prioridad);

    try {
        // addDoc inserta un nuevo documento en la colección 'tickets'
        await addDoc(collection(db, "tickets"), {
            titulo: titulo,
            descripcion: descripcion,
            departamento: departamento,
            prioridad: prioridad,
            estado: 'Abierto', // Estado por defecto
            slaVencimiento: fechaSLA.getTime(), // Guardamos el timestamp en milisegundos para fácil lectura en JS
            fechaCreacion: serverTimestamp() // Usamos el reloj del servidor de Firebase para la creación
        });

        // Limpiamos el formulario tras el envío exitoso
        ticketForm.reset();
    } catch (error) {
        console.error("Error al añadir el ticket: ", error);
        alert("Hubo un error al crear el ticket.");
    }
});

/**
 * LECTURA EN TIEMPO REAL (Realtime Listener)
 * onSnapshot mantiene una conexión abierta con Firestore. Si alguien añade un ticket
 * (incluso desde otro PC), la tabla se actualizará automáticamente sin recargar la página.
 */
const ticketsQuery = query(collection(db, "tickets"), orderBy("slaVencimiento", "asc"));

onSnapshot(ticketsQuery, (snapshot) => {
    ticketsBody.innerHTML = ''; // Limpiamos la tabla antes de renderizar los nuevos datos

    snapshot.forEach((doc) => {
        const ticket = doc.data();
        
        // Formateamos la fecha SLA a una cadena legible (Ej: "23/2/2026, 12:30")
        const fechaLegible = new Date(ticket.slaVencimiento).toLocaleString('es-ES');
        
        // Asignamos una clase CSS específica dependiendo de la prioridad para el color
        const badgeClass = `badge-${ticket.prioridad.toLowerCase()}`;

        // Construimos la fila (tr) inyectando los datos de Firebase
        const row = `
            <tr>
                <td class="fw-bold">${ticket.titulo}</td>
                <td>${ticket.departamento}</td>
                <td><span class="badge ${badgeClass}">${ticket.prioridad}</span></td>
                <td><span class="badge bg-secondary">${ticket.estado}</span></td>
                <td class="font-monospace text-warning">${fechaLegible}</td>
            </tr>
        `;
        
        // Añadimos la fila al HTML de la tabla
        ticketsBody.innerHTML += row;
    });
});