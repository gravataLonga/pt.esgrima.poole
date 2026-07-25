/**
 * Dropdown component — Esgrima.pt Design System
 *
 * Usage:
 *   Alpine.data('dropdown', dropdown)
 *
 * HTML example at bottom of file.
 */
export default () => ({
    open: false,

    toggle() {
        this.open = !this.open
    },

    close() {
        this.open = false
    },
})

/**
 * ─── FULL HTML EXAMPLE ────────────────────────────────────────────────────────
 *
 * Register: Alpine.data('dropdown', dropdown)
 *
 * <div x-data="dropdown" class="relative inline-block">
 *
 *   <!-- Trigger -->
 *   <button
 *     @click="toggle()"
 *     :aria-expanded="open"
 *     class="flex items-center gap-2 rounded-4 bg-transparent border border-dark text-dark hover:bg-dark/10 font-bold font-montserrat text-base px-4 py-2 transition-all ease-in-out duration-300"
 *   >
 *     Opções
 *     <svg
 *       class="w-4 h-4 transition-transform duration-200"
 *       :class="open ? 'rotate-180' : ''"
 *       fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
 *     >
 *       <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
 *     </svg>
 *   </button>
 *
 *   <!-- Panel -->
 *   <div
 *     x-show="open"
 *     x-cloak
 *     @click.outside="close()"
 *     @keydown.escape.window="close()"
 *     x-transition:enter="transition ease-out duration-150"
 *     x-transition:enter-start="opacity-0 -translate-y-1"
 *     x-transition:enter-end="opacity-100 translate-y-0"
 *     x-transition:leave="transition ease-in duration-100"
 *     x-transition:leave-start="opacity-100 translate-y-0"
 *     x-transition:leave-end="opacity-0 -translate-y-1"
 *     class="absolute right-0 mt-2 w-52 bg-light border border-gray-medium rounded-6 shadow-lg z-20 overflow-hidden"
 *   >
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-dark hover:bg-gray-light hover:text-green transition-colors">
 *       Editar perfil
 *     </a>
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-dark hover:bg-gray-light hover:text-green transition-colors">
 *       Histórico de presenças
 *     </a>
 *     <hr class="border-gray-medium">
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-danger hover:bg-light-danger transition-colors">
 *       Terminar sessão
 *     </a>
 *   </div>
 *
 * </div>
 *
 * ─── NAV DROPDOWN VARIANT ────────────────────────────────────────────────────
 *
 * Useful for a desktop navigation item with a sub-menu:
 *
 * <div x-data="dropdown" class="relative">
 *   <button
 *     @click="toggle()"
 *     class="font-bold font-montserrat py-2 px-4 rounded-4 text-light hover:text-medium-green flex items-center gap-1"
 *   >
 *     Modalidades
 *     <svg class="w-4 h-4" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
 *       <path d="M19 9l-7 7-7-7"/>
 *     </svg>
 *   </button>
 *   <div
 *     x-show="open" x-cloak
 *     @click.outside="close()"
 *     class="absolute top-full left-0 mt-1 w-44 bg-dark border border-green/20 rounded-6 shadow-xl z-20 overflow-hidden"
 *   >
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-light hover:text-green transition-colors">Espada</a>
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-light hover:text-green transition-colors">Florete</a>
 *     <a href="#" class="block px-4 py-3 font-work-sans text-sm text-light hover:text-green transition-colors">Sabre</a>
 *   </div>
 * </div>
 */
