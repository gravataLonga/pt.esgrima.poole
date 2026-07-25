/**
 * Toast notification component — Esgrima.pt Design System
 *
 * Usage:
 *   Alpine.data('toasts', toasts)
 *
 * Dispatch from anywhere:
 *   $dispatch('toast', { message: 'Saved!', type: 'success' })
 *
 * Types: 'success' | 'danger' | 'warning' | 'info'
 *
 * HTML example at bottom of file.
 */
export default () => ({
    items: [],

    add(message, type = 'info', duration = 4000) {
        const id = Date.now()
        this.items.push({ id, message, type, visible: true })
        setTimeout(() => this.remove(id), duration)
    },

    remove(id) {
        const item = this.items.find(t => t.id === id)
        if (item) item.visible = false
        setTimeout(() => {
            this.items = this.items.filter(t => t.id !== id)
        }, 300)
    },

    typeClasses(type) {
        return {
            success: 'bg-light-success border-success text-success',
            danger:  'bg-light-danger border-danger text-danger',
            warning: 'bg-light-warning border-warning text-warning',
            info:    'bg-gray-light border-gray-medium text-dark',
        }[type] ?? 'bg-gray-light border-gray-medium text-dark'
    },
})

/**
 * ─── FULL HTML EXAMPLE ────────────────────────────────────────────────────────
 *
 * Register: Alpine.data('toasts', toasts)
 *
 * Place this once, near </body>:
 *
 * <div
 *   x-data="toasts"
 *   @toast.window="add($event.detail.message, $event.detail.type)"
 *   class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-80"
 * >
 *   <template x-for="toast in items" :key="toast.id">
 *     <div
 *       x-show="toast.visible"
 *       x-transition:enter="transition ease-out duration-300"
 *       x-transition:enter-start="opacity-0 translate-y-2"
 *       x-transition:enter-end="opacity-100 translate-y-0"
 *       x-transition:leave="transition ease-in duration-200"
 *       x-transition:leave-start="opacity-100 translate-y-0"
 *       x-transition:leave-end="opacity-0 translate-y-2"
 *       :class="typeClasses(toast.type)"
 *       class="flex items-start justify-between gap-3 p-4 rounded-4 border shadow-md"
 *     >
 *       <p class="font-work-sans text-sm font-bold" x-text="toast.message"></p>
 *       <button @click="remove(toast.id)" class="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
 *         <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
 *           <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
 *         </svg>
 *       </button>
 *     </div>
 *   </template>
 * </div>
 *
 * ─── DISPATCHING TOASTS ───────────────────────────────────────────────────────
 *
 * From any Alpine component:
 *   @click="$dispatch('toast', { message: 'Inscrição enviada!', type: 'success' })"
 *   @click="$dispatch('toast', { message: 'Erro ao guardar.', type: 'danger' })"
 *   @click="$dispatch('toast', { message: 'Verifique os dados.', type: 'warning' })"
 *   @click="$dispatch('toast', { message: 'Informação adicional.', type: 'info' })"
 *
 * From vanilla JS:
 *   window.dispatchEvent(new CustomEvent('toast', {
 *     detail: { message: 'Guardado com sucesso!', type: 'success' }
 *   }))
 */
