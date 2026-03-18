// departamentos.js — Gestión de departamentos desde Firestore
// Migra automáticamente departamentos legacy a los nuevos por defecto.

import { db } from './config.js';
import {
    collection, onSnapshot, addDoc, updateDoc,
    deleteDoc, doc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULTS = [
    { nombre: 'Soporte IT',  descripcion: 'Incidencias generales de sistemas y equipos',  icono: 'IT'  },
    { nombre: 'Hardware',    descripcion: 'Equipos, periféricos y dispositivos físicos',   icono: 'HW'  },
    { nombre: 'Software',    descripcion: 'Aplicaciones, licencias e instalaciones',       icono: 'SW'  },
];

// Nombres legacy que deben ser reemplazados
const LEGACY_NAMES = new Set([
    'DevOps', 'SecOps', 'Infraestructura', 'Seguridad', 'RRHH'
]);

let _depts     = [];
let _callbacks = [];
let _started   = false;
let _migrated  = false;

function _start() {
    if (_started) return;
    _started = true;

    onSnapshot(collection(db, 'departamentos'), async snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Check if we need to migrate (all docs are legacy names)
        const nonLegacy = docs.filter(d => !LEGACY_NAMES.has(d.nombre));
        const hasLegacy = docs.some(d => LEGACY_NAMES.has(d.nombre));

        if (!_migrated && hasLegacy && nonLegacy.length === 0) {
            _migrated = true;
            try {
                const batch = writeBatch(db);
                // Delete all legacy docs
                docs.forEach(d => batch.delete(doc(db, 'departamentos', d.id)));
                // Create new defaults
                DEFAULTS.forEach(d => {
                    batch.set(doc(collection(db, 'departamentos')), {
                        ...d, creado: serverTimestamp()
                    });
                });
                await batch.commit();
                // Snapshot will re-fire with clean data
                return;
            } catch (err) {
                console.warn('Migration failed, using memory defaults:', err.message);
                _depts = DEFAULTS.map((d, i) => ({ id: '_' + i, ...d }));
                _notify();
                return;
            }
        }

        if (snap.empty) {
            // Empty collection — seed with defaults
            try {
                const batch = writeBatch(db);
                DEFAULTS.forEach(d => {
                    batch.set(doc(collection(db, 'departamentos')), {
                        ...d, creado: serverTimestamp()
                    });
                });
                await batch.commit();
            } catch (err) {
                _depts = DEFAULTS.map((d, i) => ({ id: '_' + i, ...d }));
                _notify();
            }
            return;
        }

        // Normal load — use non-legacy docs (or all if no legacy)
        const toShow = nonLegacy.length > 0 ? nonLegacy : docs;
        _depts = toShow.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        _notify();

    }, err => {
        console.warn('departamentos error, using memory defaults:', err.message);
        _depts = DEFAULTS.map((d, i) => ({ id: '_' + i, ...d }));
        _notify();
    });
}

function _notify() {
    _callbacks.forEach(fn => fn([..._depts]));
}

export function subscribeDepts(onChange) {
    _callbacks.push(onChange);
    _start();
    if (_depts.length > 0) onChange([..._depts]);
}

export function populateSelect(selectId, { includeAll = false, selectedValue = '' } = {}) {
    subscribeDepts(depts => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const prev = selectedValue || sel.value || '';
        sel.innerHTML = '';
        if (includeAll) {
            const opt = document.createElement('option');
            opt.value = ''; opt.textContent = 'Todos los departamentos';
            sel.appendChild(opt);
        }
        depts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.nombre;
            opt.textContent = d.nombre;
            sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
    });
}

export async function addDept(nombre, descripcion = '', icono = '') {
    nombre = nombre.trim();
    if (!nombre) throw new Error('El nombre es obligatorio');
    await addDoc(collection(db, 'departamentos'), {
        nombre, descripcion, icono, creado: serverTimestamp()
    });
}

export async function updateDept(id, data) {
    await updateDoc(doc(db, 'departamentos', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDept(id) {
    await deleteDoc(doc(db, 'departamentos', id));
}

export function getDepts() { return [..._depts]; }