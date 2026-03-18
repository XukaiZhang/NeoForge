// swal.js — Configuración global de SweetAlert2 con el tema de NeoForge
// Importar en cualquier módulo que necesite alertas/confirmaciones

// Configuración base del tema oscuro NeoForge
export const Toast = window.Swal?.mixin({
    toast: true,
    position: 'bottom-end',
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
    background: '#111420',
    color: '#f0f0f3',
    iconColor: '#818cf8',
    customClass: {
        popup: 'nf-swal-toast',
    },
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', window.Swal.stopTimer);
        toast.addEventListener('mouseleave', window.Swal.resumeTimer);
    }
});

// Alerta base con tema NeoForge
export const NfAlert = window.Swal?.mixin({
    background: '#111420',
    color: '#f0f0f3',
    confirmButtonColor: '#6366f1',
    cancelButtonColor: '#1c2032',
    cancelButtonText: 'Cancelar',
    customClass: {
        popup:         'nf-swal-popup',
        title:         'nf-swal-title',
        confirmButton: 'nf-swal-confirm',
        cancelButton:  'nf-swal-cancel',
    }
});

// ── Helpers exportados ─────────────────────────────────────────────

export function swalSuccess(title, text = '') {
    return NfAlert?.fire({ icon: 'success', title, text, timer: 2200, showConfirmButton: false });
}

export function swalError(title, text = '') {
    return NfAlert?.fire({ icon: 'error', title, text });
}

export function swalConfirm(title, text = '', confirmText = 'Confirmar', isDanger = false) {
    return NfAlert?.fire({
        icon: isDanger ? 'warning' : 'question',
        title,
        text,
        showCancelButton: true,
        confirmButtonText: confirmText,
        confirmButtonColor: isDanger ? '#ef4444' : '#6366f1',
        reverseButtons: true,
    });
}

export function swalToast(title, icon = 'success') {
    return Toast?.fire({ icon, title });
}