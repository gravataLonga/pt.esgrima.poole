/**
 * Modal component — Esgrima.pt Design System
 *
 * Usage:
 *   Alpine.data('modal', modal)
 *
 * HTML:
 *   <div x-data="modal">
 *     <button @click="open()">Open</button>
 *     <template x-teleport="body">
 *       <div x-show="isOpen" ...>...</div>
 *     </template>
 *   </div>
 *
 * Full example at bottom of this file.
 */
export default (options = {}) => ({
    isOpen: false,
    title: options.title ?? '',

    open() {
        this.isOpen = true
        document.body.classList.add('overflow-hidden')
    },

    close() {
        this.isOpen = false
        document.body.classList.remove('overflow-hidden')
    },

    toggle() {
        this.isOpen ? this.close() : this.open()
    },
})

/**
 * ─── FULL HTML EXAMPLE ────────────────────────────────────────────────────────
 *
 * Register: Alpine.data('modal', modal)
 *
 * <div x-data="modal">
 *
 *   <!-- Trigger -->
 *   <button
 *     @click="open()"
 *     class="rounded-4 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2 transition-all ease-in-out duration-300"
 *   >
 *     Abrir modal
 *   </button>
 *
 *   <!-- Overlay + dialog (teleported to body) -->
 *   <template x-teleport="body">
 *
 *     <!-- Backdrop -->
 *     <div
 *       x-show="isOpen"
 *       x-cloak
 *       x-transition:enter="transition ease-out duration-200"
 *       x-transition:enter-start="opacity-0"
 *       x-transition:enter-end="opacity-100"
 *       x-transition:leave="transition ease-in duration-150"
 *       x-transition:leave-start="opacity-100"
 *       x-transition:leave-end="opacity-0"
 *       @click="close()"
 *       class="fixed inset-0 bg-dark/60 z-50"
 *     ></div>
 *
 *     <!-- Dialog panel -->
 *     <div
 *       x-show="isOpen"
 *       x-cloak
 *       x-transition:enter="transition ease-out duration-200"
 *       x-transition:enter-start="opacity-0 scale-95"
 *       x-transition:enter-end="opacity-100 scale-100"
 *       x-transition:leave="transition ease-in duration-150"
 *       x-transition:leave-start="opacity-100 scale-100"
 *       x-transition:leave-end="opacity-0 scale-95"
 *       @keydown.escape.window="close()"
 *       class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
 *     >
 *       <div class="bg-light rounded-16 shadow-xl w-full max-w-lg pointer-events-auto">
 *
 *         <!-- Header -->
 *         <div class="flex items-center justify-between p-6 border-b border-gray-medium">
 *           <h3 class="font-montserrat text-xl font-bold text-dark" x-text="title || 'Título do modal'"></h3>
 *           <button @click="close()" class="text-gray-dark hover:text-dark transition-colors p-1">
 *             <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
 *               <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
 *             </svg>
 *           </button>
 *         </div>
 *
 *         <!-- Body (slot) -->
 *         <div class="p-6 font-work-sans text-base text-dark">
 *           Conteúdo do modal aqui.
 *         </div>
 *
 *         <!-- Footer -->
 *         <div class="flex justify-end gap-3 p-6 border-t border-gray-medium">
 *           <button
 *             @click="close()"
 *             class="flex rounded-4 bg-transparent border border-dark text-dark hover:bg-dark/10 font-bold font-montserrat text-base px-4 py-2 transition-all ease-in-out duration-300"
 *           >
 *             Cancelar
 *           </button>
 *           <button
 *             @click="close()"
 *             class="rounded-4 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2 transition-all ease-in-out duration-300"
 *           >
 *             Confirmar
 *           </button>
 *         </div>
 *
 *       </div>
 *     </div>
 *   </template>
 *
 * </div>
 */
