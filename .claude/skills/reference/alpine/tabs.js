/**
 * Tabs component — Esgrima.pt Design System
 *
 * Usage:
 *   Alpine.data('tabs', tabs)
 *
 * HTML example at bottom of file.
 */
export default (initialTab = 0) => ({
    active: initialTab,

    isActive(index) {
        return this.active === index
    },

    setTab(index) {
        this.active = index
    },
})

/**
 * ─── FULL HTML EXAMPLE ────────────────────────────────────────────────────────
 *
 * Register: Alpine.data('tabs', tabs)
 *
 * <div x-data="tabs(0)">
 *
 *   <!-- Tab triggers -->
 *   <div class="flex border-b border-gray-medium">
 *     <button
 *       @click="setTab(0)"
 *       :class="isActive(0)
 *         ? 'border-b-2 border-green text-dark font-bold'
 *         : 'text-gray-dark hover:text-dark'"
 *       class="font-montserrat text-base px-4 py-3 transition-colors -mb-px"
 *     >
 *       Espada
 *     </button>
 *     <button
 *       @click="setTab(1)"
 *       :class="isActive(1)
 *         ? 'border-b-2 border-green text-dark font-bold'
 *         : 'text-gray-dark hover:text-dark'"
 *       class="font-montserrat text-base px-4 py-3 transition-colors -mb-px"
 *     >
 *       Florete
 *     </button>
 *     <button
 *       @click="setTab(2)"
 *       :class="isActive(2)
 *         ? 'border-b-2 border-green text-dark font-bold'
 *         : 'text-gray-dark hover:text-dark'"
 *       class="font-montserrat text-base px-4 py-3 transition-colors -mb-px"
 *     >
 *       Sabre
 *     </button>
 *   </div>
 *
 *   <!-- Tab panels -->
 *   <div class="pt-6">
 *     <div x-show="isActive(0)" class="font-work-sans text-base text-dark">
 *       Conteúdo da tab Espada.
 *     </div>
 *     <div x-show="isActive(1)" x-cloak class="font-work-sans text-base text-dark">
 *       Conteúdo da tab Florete.
 *     </div>
 *     <div x-show="isActive(2)" x-cloak class="font-work-sans text-base text-dark">
 *       Conteúdo da tab Sabre.
 *     </div>
 *   </div>
 *
 * </div>
 *
 * ─── PILL VARIANT ─────────────────────────────────────────────────────────────
 *
 * <div x-data="tabs(0)">
 *   <div class="flex gap-2">
 *     <button
 *       @click="setTab(0)"
 *       :class="isActive(0) ? 'bg-green text-dark' : 'border border-dark text-dark hover:bg-dark/10'"
 *       class="font-montserrat font-bold text-sm px-4 py-2 rounded-full transition-all ease-in-out duration-300"
 *     >
 *       Espada
 *     </button>
 *     <button
 *       @click="setTab(1)"
 *       :class="isActive(1) ? 'bg-green text-dark' : 'border border-dark text-dark hover:bg-dark/10'"
 *       class="font-montserrat font-bold text-sm px-4 py-2 rounded-full transition-all ease-in-out duration-300"
 *     >
 *       Florete
 *     </button>
 *   </div>
 *   <div class="mt-6">
 *     <div x-show="isActive(0)">Espada content</div>
 *     <div x-show="isActive(1)" x-cloak>Florete content</div>
 *   </div>
 * </div>
 */
