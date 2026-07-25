---
name: design system guidelines
description: Use this skills everytime you need to create, modified or alter anything related to the frontend, is where
    the design system live and explain rules about how the frontend need to look like.  
---
# Project Guidelines

## Design System
This project uses the Esgrima.pt Design System.
Full specification: reference/DESIGN_SYSTEM.md

**Always read that file before creating or modifying any UI.**

### Quick rules
- Colours: bg-dark, bg-light, bg-green, text-dark, text-light, text-green
- Fonts: font-montserrat (headings/CTAs), font-work-sans (body/inputs)
- Buttons: use Blade components x-button.primary / x-button.secondary
- Forms: use Blade components x-form.input / x-form.select / x-form.textarea / x-form.checkbox
- Alerts: use x-alert with type="success|danger|warning|info"
- Badges: use x-badge with type="green|dark|success|danger|warning|gray"
- Alpine.js: always use Alpine.data() in separate files, never inline x-data objects with logic
- Tailwind: never use arbitrary colours — only tokens from the @theme block
