/**
 * Alpine.js entry point — Esgrima.pt Design System
 *
 * Copy this to resources/js/app.js in any new project.
 * Register all Alpine.data components here so they are
 * available globally without inline x-data object literals.
 */
import Alpine from 'alpinejs'
import scrollTo from 'alpinejs-scroll-to'

// ── Plugins ───────────────────────────────────────────────
Alpine.plugin(scrollTo)

// ── Components ────────────────────────────────────────────
import modal    from './modal.js'
import tabs     from './tabs.js'
import dropdown from './dropdown.js'
import toasts   from './toast.js'

Alpine.data('modal',    modal)
Alpine.data('tabs',     tabs)
Alpine.data('dropdown', dropdown)
Alpine.data('toasts',   toasts)

// ── Start ─────────────────────────────────────────────────
window.Alpine = Alpine
Alpine.start()
