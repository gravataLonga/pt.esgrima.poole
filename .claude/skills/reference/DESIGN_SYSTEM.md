# ESGRIMA.PT — Design System

> Canonical reference for all UI tokens, components, and patterns.  
> Derived from the live esgrima.pt Laravel + Tailwind CSS v4 + Alpine.js codebase.  
> Drop `tokens/theme.css` into any new project as the single CSS foundation.

---

## Stack

| Layer       | Technology                              |
|-------------|----------------------------------------|
| CSS         | Tailwind CSS v4 (`@tailwindcss/vite`)  |
| JS          | Alpine.js v3 (npm package)             |
| Templates   | Laravel Blade (or plain HTML)          |
| Icons       | Blade SVG (`blade-icons` package)      |
| Fonts       | Google Fonts — Montserrat + Work Sans  |

---

## 1. Colour Palette

### Base Neutrals

| Token              | Hex / Value                   | Usage                                      |
|--------------------|-------------------------------|--------------------------------------------|
| `light`            | `#FEFEFE`                     | Site background; light text on dark bg     |
| `dark`             | `#1D3749`                     | Primary dark; nav bg; headings; borders    |
| `black`            | `#000000`                     | Pure black (rare)                          |

### Grays

| Token              | Hex                           | Usage                                      |
|--------------------|-------------------------------|--------------------------------------------|
| `gray-dark`        | `#BBC3C8`                     | Disabled text, subtle borders              |
| `gray-medium`      | `#E8EBED`                     | Dividers, table lines, skeleton bg         |
| `gray-light`       | `#EFF1F2`                     | Table row stripe, light input bg           |

### Brand Accent

| Token              | Hex / Value                   | Usage                                      |
|--------------------|-------------------------------|--------------------------------------------|
| `green`            | `#00F6B9`                     | Primary CTA bg, highlights, focus rings    |
| `medium-green`     | `#00E0A9`                     | Hover state for green elements             |
| `light-green`      | `#63FFDF`                     | Tints, pressed/active state                |
| `green-4`          | `rgba(0,246,185,0.04)`        | Ghost button hover background              |

### Semantic

| Token              | Hex                           | Usage                                      |
|--------------------|-------------------------------|--------------------------------------------|
| `danger`           | `#DE161A`                     | Errors, destructive actions, required `*`  |
| `light-danger`     | `#FEF3F3`                     | Error alert background                     |
| `warning`          | `#E56B00`                     | Warnings                                   |
| `light-warning`    | `#FEF5EB`                     | Warning alert background                   |
| `success`          | `#008F61`                     | Success states                             |
| `light-success`    | `#E7F5F2`                     | Success alert background                   |

### Tailwind usage

```html
<!-- Text colours -->
<p class="text-dark">body text</p>
<p class="text-light">light text on dark bg</p>
<p class="text-green">accent text</p>
<p class="text-danger">error text</p>

<!-- Background colours -->
<div class="bg-dark">dark section</div>
<div class="bg-light">light section</div>
<div class="bg-green">accent block</div>
<div class="bg-light-success">success alert bg</div>

<!-- Border colours -->
<div class="border border-dark">bordered</div>
<div class="border border-green">green bordered</div>
```

---

## 2. Typography

### Font Families

| Variable          | Font         | Role                                               |
|-------------------|--------------|----------------------------------------------------|
| `font-montserrat` | Montserrat   | Headings, CTAs, price displays, bold accents       |
| `font-work-sans`  | Work Sans    | Body copy, labels, inputs, supporting text         |

Default body font is `font-work-sans`. Apply `font-montserrat` to headings and emphasis.

### Type Scale

| Class         | Size        | Usage                                      |
|---------------|-------------|--------------------------------------------|
| `text-6xl`    | 60px        | Hero headline (mobile up to desktop)       |
| `text-5xl`    | 48px        | Hero headline (smaller variant)            |
| `text-4xl`    | 36px        | Section titles, footer headings            |
| `text-3xl`    | 30px        | Sub-section headings                       |
| `text-subtitle`| 24px (1.5rem)| Green accent subtitles, highlighted info  |
| `text-2xl`    | 24px        | Card titles, form section headings         |
| `text-xl`     | 20px        | Sub-headings                               |
| `text-lg`     | 18px        | Body large, pricing text                   |
| `text-base`   | 16px        | Default body text                          |
| `text-sm`     | 14px        | Labels, helper text, captions              |
| `text-xs`     | 12px        | Footnotes, legal text, timestamps         |

### Heading Examples

```html
<!-- Page / Hero -->
<h1 class="font-montserrat text-5xl md:text-6xl font-bold text-dark">Page Title</h1>

<!-- Section title -->
<h2 class="font-montserrat text-3xl sm:text-4xl font-bold text-dark">Section</h2>

<!-- Sub-section -->
<h3 class="font-montserrat text-2xl font-bold text-dark">Sub-section</h3>

<!-- Card title -->
<h4 class="font-montserrat text-xl font-bold text-dark">Card Title</h4>

<!-- Accent subtitle (green highlight) -->
<p class="font-montserrat text-subtitle font-bold text-green">Accent info</p>

<!-- Body -->
<p class="font-work-sans text-base text-dark">Body paragraph text.</p>

<!-- Small / helper -->
<p class="font-work-sans text-sm text-gray-dark">Helper text</p>

<!-- Footer / legal -->
<p class="font-work-sans text-xs text-dark">© 2025 All rights reserved</p>
```

---

## 3. Spacing

Tailwind's default spacing scale is used throughout. Key patterns from the codebase:

| Pattern              | Classes                          | Usage                             |
|----------------------|----------------------------------|-----------------------------------|
| Section padding      | `p-6 md:p-14`                    | All major content sections        |
| Card padding         | `p-4`                            | Inside card containers            |
| Form field gap       | `gap-4`                          | Grid gap between form fields      |
| Vertical stack       | `space-y-4` / `space-y-8`       | Stacked elements                  |
| Horizontal stack     | `space-x-4` / `space-x-8`       | Side-by-side elements             |
| Container            | `container mx-auto`              | All page sections                 |
| Mobile container     | `mx-4 md:mx-0`                   | Horizontal padding on mobile      |
| Section gap (large)  | `space-y-10` / `gap-10`          | Between major blocks              |
| Footer spacing       | `mb-16` / `mb-32`                | Footer clearance                  |

---

## 4. Border Radius

| Token         | Value   | Classes           | Usage                          |
|---------------|---------|-------------------|--------------------------------|
| `radius-none` | 0px     | `rounded-none`    | Sharp corners                  |
| `radius-4`    | 4px     | `rounded-4`       | Buttons, inputs, badges        |
| `radius-6`    | 6px     | `rounded-6`       | Small elements                 |
| `radius-10`   | 10px    | `rounded-10`      | Medium containers              |
| `radius-16`   | 16px    | `rounded-16`      | Cards, panels                  |
| `radius-22`   | 22px    | `rounded-22`      | Hero image, featured blocks    |
| `radius-full` | 9999px  | `rounded-full`    | Pills, avatar circles          |

---

## 5. Buttons

### Primary Button

- Background: `bg-green` → hover: `bg-medium-green`
- Text: `text-dark font-bold font-montserrat`
- Radius: `rounded-4`
- Optional animated trailing icon (arrow slides in from right on hover)

```html
<!-- Primary — Large -->
<button class="rounded-4 transition-all ease-in-out duration-300 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2">
    Inscreve-te
</button>

<!-- Primary — Large with animated arrow icon -->
<button class="relative flex items-center overflow-hidden group rounded-4 transition-all ease-in-out duration-300 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2 hover:pr-10">
    Inscreve-te
    <svg class="absolute right-3 top-1/2 -translate-y-1/2 translate-x-10 opacity-0 transition-all ease-in-out duration-300 group-hover:translate-x-0 group-hover:opacity-100 w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
</button>

<!-- Primary — Medium -->
<button class="rounded-4 transition-all ease-in-out duration-300 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-2 py-1">
    Enviar
</button>

<!-- Primary — Small -->
<button class="rounded-4 transition-all ease-in-out duration-300 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-1">
    OK
</button>
```

### Secondary Button

- Border: `border-green` (on dark bg) or `border-dark` (on light bg)
- Text: matching border colour
- Background: transparent → hover: `bg-green-4` (green ghost) or `bg-dark/15`

```html
<!-- Secondary — Green (on dark background) -->
<button class="flex rounded-4 bg-transparent border border-green text-green hover:bg-green-4 font-bold font-montserrat text-base cursor-pointer ease-in-out duration-300 px-4 py-2">
    Dúvida?
</button>

<!-- Secondary — Dark (on light background) -->
<button class="flex rounded-4 bg-transparent border border-dark text-dark hover:bg-dark/15 font-bold font-montserrat text-base cursor-pointer ease-in-out duration-300 px-4 py-2">
    Saber mais
</button>
```

### Nav Button (text link style)

- Used inside the top navigation bar
- Text: `text-light` → hover: `text-medium-green` → active: `text-green`

```html
<a href="/calendario" class="font-bold font-montserrat py-2 px-4 rounded-4 text-light whitespace-nowrap hover:text-medium-green active:text-green">
    Calendário
</a>
```

### Danger Button

```html
<button class="rounded-4 transition-all ease-in-out duration-300 bg-danger hover:bg-red-700 text-white font-bold font-montserrat text-base px-4 py-2">
    Eliminar
</button>
```

### Disabled State (apply to any button)

```html
<button disabled class="... opacity-40 cursor-not-allowed pointer-events-none">
    Indisponível
</button>
```

### Size Reference

| Size     | Padding          | Classes            |
|----------|------------------|--------------------|
| Large    | 16px / 8px       | `px-4 py-2`        |
| Medium   | 8px / 4px        | `px-2 py-1`        |
| Small    | 4px / 0          | `px-1`             |

---

## 6. Form Components

All form fields share a consistent base style:

```
font-work-sans
bg-white/10           ← semi-transparent white on light bg; pure bg-white on dark bg
border border-dark    ← always dark border
rounded               ← rounded-4 equivalent (Tailwind `rounded`)
p-4                   ← 16px inner padding
focus:outline-offset-4 focus:outline-2 focus:outline-green   ← green focus ring
w-full
```

### Label

```html
<label for="name" class="block text-sm font-work-sans mb-1">
    Nome <span class="text-danger">*</span>
</label>
```

### Input

```html
<div>
    <label for="email" class="block text-sm font-work-sans mb-1">
        E-mail <span class="text-danger">*</span>
    </label>
    <input
        type="email"
        id="email"
        name="email"
        placeholder="exemplo@email.com"
        class="font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full"
    >
    <!-- Error state -->
    <p class="text-danger text-sm mt-1">Campo obrigatório.</p>
</div>
```

**Input with error border:**
```html
<input class="font-work-sans bg-white/10 border-2 border-danger rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full">
```

### Select

```html
<div>
    <label for="gender" class="block text-sm font-work-sans mb-1">Sexo</label>
    <select
        id="gender"
        name="gender"
        class="font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full"
    >
        <option value="">— Selecione —</option>
        <option value="M">Masculino</option>
        <option value="F">Feminino</option>
    </select>
</div>
```

### Textarea

```html
<div>
    <label for="message" class="block text-sm font-work-sans mb-1">Mensagem</label>
    <textarea
        id="message"
        name="message"
        rows="4"
        placeholder="A sua mensagem..."
        class="font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full"
    ></textarea>
</div>
```

### Checkbox

```html
<label class="inline-flex items-center cursor-pointer">
    <input
        type="checkbox"
        name="accept_tos"
        value="1"
        class="form-checkbox h-5 w-5 text-green focus:ring-green rounded-4"
    >
    <span class="ml-2 font-work-sans text-dark">
        Aceito os <a href="/termos" class="underline hover:text-green">Termos e Condições</a>
        <span class="text-danger">*</span>
    </span>
</label>
```

### Radio Button

```html
<div class="flex flex-col space-y-2">
    <label class="inline-flex items-center cursor-pointer">
        <input type="radio" name="interest" value="competition" class="h-5 w-5 text-green focus:ring-green">
        <span class="ml-2 font-work-sans text-dark">Competição</span>
    </label>
    <label class="inline-flex items-center cursor-pointer">
        <input type="radio" name="interest" value="leisure" class="h-5 w-5 text-green focus:ring-green">
        <span class="ml-2 font-work-sans text-dark">Lazer</span>
    </label>
</div>
```

### Form Section

```html
<div class="flex flex-col space-y-8">
    <div>
        <h3 class="font-montserrat text-2xl md:text-3xl font-bold mb-4">Dados Pessoais</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- fields here -->
        </div>
    </div>
</div>
```

### Form on Dark Background (contact/footer forms)

On dark backgrounds, switch to `bg-white` instead of `bg-white/10`:

```html
<input
    type="email"
    class="font-work-sans bg-white px-4 py-2 border-0 rounded focus:ring focus:ring-green focus:outline-offset-4 focus:outline-2 focus:outline-green"
    placeholder="O seu e-mail"
>
```

---

## 7. Cards

### Content Card (Coach / Profile)

```html
<div class="rounded-16 overflow-hidden border border-dark bg-light max-w-[350px]">
    <img src="/path/to/image.jpg" alt="Name" class="w-full object-cover">
    <div class="flex flex-col p-4">
        <div class="flex flex-col p-4">
            <h4 class="font-montserrat text-dark text-2xl font-bold text-center mb-4">Nome</h4>
            <p class="font-work-sans text-dark text-base">Descrição do card.</p>
        </div>
    </div>
</div>
```

### Pricing Card

```html
<div class="bg-green p-4 text-dark font-bold text-2xl flex flex-col items-center font-montserrat">
    35€
    <span class="text-sm font-normal text-center mt-1">Mensalidade</span>
</div>
```

### Info Card (light bg, dark border)

```html
<div class="rounded-10 border border-dark bg-light p-6 flex flex-col space-y-2">
    <h4 class="font-montserrat text-xl font-bold text-dark">Título</h4>
    <p class="font-work-sans text-base text-dark">Conteúdo do card.</p>
</div>
```

---

## 8. Alerts / Notifications

```html
<!-- Danger / Error -->
<div class="p-4 bg-light-danger border border-danger text-danger rounded-4">
    <p class="font-work-sans text-sm font-bold">Corrija o formulário e volte a tentar.</p>
    <ul class="list-disc list-inside mt-2 text-sm font-work-sans">
        <li>Campo obrigatório: Nome</li>
    </ul>
</div>

<!-- Success -->
<div class="p-4 bg-light-success border border-success text-success rounded-4">
    <p class="font-work-sans text-sm font-bold">Operação realizada com sucesso!</p>
</div>

<!-- Warning -->
<div class="p-4 bg-light-warning border border-warning text-warning rounded-4">
    <p class="font-work-sans text-sm font-bold">Atenção: verifique os dados antes de continuar.</p>
</div>

<!-- Info (dark border, light-green tint) -->
<div class="p-4 bg-gray-light border border-gray-dark text-dark rounded-4">
    <p class="font-work-sans text-sm">Informação adicional sobre este campo.</p>
</div>
```

---

## 9. Badges / Labels

```html
<!-- Green accent badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-green text-dark text-xs font-bold font-montserrat">
    Novo
</span>

<!-- Dark badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-dark text-light text-xs font-bold font-montserrat">
    Confirmado
</span>

<!-- Danger badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-light-danger border border-danger text-danger text-xs font-bold font-montserrat">
    Pendente
</span>

<!-- Success badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-light-success border border-success text-success text-xs font-bold font-montserrat">
    Pago
</span>
```

---

## 10. Navigation

### Top Header (dark background)

```html

<div class="bg-dark py-8">
    <div class="container mx-auto">
        <header class="flex justify-between items-center mx-4 md:mx-0 space-x-4">
            <!-- Logo -->
            <div class="flex items-center flex-1">
                <a href="/">
                    <!-- SVG logo goes here -->
                </a>
            </div>

            <!-- Desktop nav links -->
            <nav class="items-center justify-end hidden lg:flex space-x-2">
                <a href="/horarios"
                   class="font-bold font-montserrat py-2 px-4 rounded-4 text-light whitespace-nowrap hover:text-medium-green active:text-green">Horários</a>
                <a href="/calendario"
                   class="font-bold font-montserrat py-2 px-4 rounded-4 text-light whitespace-nowrap hover:text-medium-green active:text-green">Calendário</a>
            </nav>

            <!-- CTAs -->
            <div class="flex items-center space-x-2 md:space-x-4">
                <button class="hidden sm:flex rounded-4 bg-transparent border border-green text-green hover:bg-green-4 font-bold font-montserrat text-base px-4 py-2">
                    Dúvida?
                </button>
                <button class="relative flex items-center overflow-hidden group rounded-4 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2 hover:pr-10 transition-all ease-in-out duration-300">
                    Inscreve-te
                    <svg class="absolute right-3 top-1/2 -translate-y-1/2 translate-x-10 opacity-0 transition-all ease-in-out duration-300 group-hover:translate-x-0 group-hover:opacity-100 w-5 h-5 shrink-0"
                         viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>

                <!-- Mobile hamburger -->
                <button class="flex flex-col text-white lg:hidden" x-data @click="$dispatch('open-menu')">
                    <svg class="w-10 h-10 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                </button>
            </div>
        </header>
    </div>
</div>
```

### Mobile Full-Screen Menu (Alpine.js)

```html
<div
    class="fixed top-0 left-0 bg-dark w-full h-screen z-50"
    x-data="{ open: false }"
    @open-menu.window="open = true"
    x-show="open"
    x-cloak
>
    <div class="container mx-auto">
        <div class="flex justify-between items-center mx-4 my-8">
            <a href="/"><img src="/logo.svg" alt="Logo"></a>
            <button @click="open = false" class="text-white">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <nav class="flex flex-col space-y-4 px-4" @click="open = false">
            <a href="/horarios" class="font-bold font-montserrat text-xl py-2 text-light hover:text-green">Horários</a>
            <a href="/calendario" class="font-bold font-montserrat text-xl py-2 text-light hover:text-green">Calendário</a>
        </nav>
    </div>
</div>
```

---

## 11. Sections / Layout Patterns

### Hero Section

```html
<div class="h-[320px] md:h-[550px] relative px-12 mb-16">
    <div class="container mx-auto h-full flex items-center z-10">
        <div class="flex flex-col space-y-8 md:w-[420px]">
            <h1 class="text-5xl mt-20 md:text-6xl text-dark font-bold font-montserrat">
                Título Principal
            </h1>
            <h2 class="text-3xl sm:text-4xl text-dark font-bold font-montserrat pb-2">
                Sub-título
            </h2>
            <div class="flex space-x-4">
                <button class="flex rounded-4 bg-transparent border border-dark text-dark hover:bg-dark/15 font-bold font-montserrat text-base px-4 py-2">Saber mais</button>
                <button class="rounded-4 bg-green hover:bg-medium-green text-dark font-bold font-montserrat text-base px-4 py-2">Experimenta grátis</button>
            </div>
        </div>
    </div>
    <!-- Full-height image right side, clipped -->
    <div class="hidden md:block -z-10 top-0 right-0 absolute overflow-hidden w-[600px] md:h-[550px] xl:w-[960px] bg-center rounded-bl-22 bg-cover"
         style="background-image: url('/img/hero.jpg')">
    </div>
</div>
```

### Dark Section (pricing, info blocks)

```html
<div class="bg-dark w-full p-6 md:p-14">
    <div class="container mx-auto flex flex-col lg:flex-row gap-10">
        <!-- content -->
    </div>
</div>
```

### Light Content Section

```html
<div class="container mx-auto p-6 md:p-14 mb-2">
    <div class="flex flex-col items-center space-y-10">
        <!-- content -->
    </div>
</div>
```

### Two-Column Grid (content + sidebar)

```html
<div class="container mx-auto flex flex-col lg:flex-row gap-10">
    <div class="w-full lg:w-8/12"><!-- main --></div>
    <div class="w-full lg:w-4/12"><!-- sidebar --></div>
</div>
```

### Three-Column Card Grid

```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
    <!-- cards -->
</div>
```

---

## 12. Footer

```html
<!-- Main footer block (with optional background shape image) -->
<div class="w-full p-6 md:p-14 mb-32 bg-dark min-h-[720px]">
    <div class="container mx-auto">
        <div class="flex flex-col md:flex-row space-y-10 md:space-y-0 md:space-x-12">
            <!-- Column 1: Address -->
            <div class="flex flex-col md:w-3/12 space-y-2">
                <h6 class="text-light font-montserrat text-4xl font-bold mb-4">Como chegar</h6>
                <p class="text-green font-montserrat text-subtitle font-bold">R. da Nave,<br>4500-054 Espinho</p>
                <p class="text-light font-work-sans text-base">(estacionamento gratuito)</p>
            </div>

            <!-- Column 2: Hours + Contact -->
            <div class="flex flex-col md:w-4/12 space-y-10">
                <div class="space-y-4">
                    <h6 class="text-light font-montserrat text-4xl font-bold">Horário</h6>
                    <p class="text-green font-montserrat text-subtitle font-bold">Segunda, Quarta e Sexta<br>19:00 – 20:30</p>
                </div>
                <div class="space-y-4">
                    <h6 class="text-light font-montserrat text-4xl font-bold">Contacto</h6>
                    <p class="text-green font-montserrat text-subtitle font-bold">961 040 379</p>
                    <p class="text-light font-work-sans text-base">(Ricardo Gouveia)</p>
                </div>
            </div>

            <!-- Column 3: Contact form -->
            <div class="md:w-5/12">
                <!-- form component here -->
            </div>
        </div>
    </div>
</div>

<!-- Social links -->
<div class="w-full mb-16 -mt-16">
    <div class="container mx-auto">
        <div class="flex flex-col items-start space-y-4">
            <h6 class="text-dark font-montserrat text-4xl font-bold">Segue-nos</h6>
            <div class="flex flex-row space-x-8">
                <a href="https://instagram.com/" target="_blank" class="block"><!-- Instagram SVG --></a>
                <a href="https://facebook.com/" target="_blank" class="block"><!-- Facebook SVG --></a>
                <a href="https://wa.me/351XXXXXXXXX" target="_blank" class="block"><!-- WhatsApp SVG --></a>
            </div>
        </div>
    </div>
</div>

<!-- Copyright bar -->
<div class="container mx-auto px-10 flex flex-col md:flex-row md:justify-between mt-10 mb-10">
    <p class="text-xs font-work-sans text-dark">© 2025 Todos os direitos reservados</p>
    <div class="flex md:justify-end space-x-8">
        <a href="/termos" class="font-work-sans text-dark text-xs hover:text-green">Termos e Condições</a>
        <a href="/privacidade" class="font-work-sans text-dark text-xs hover:text-green">Política de Privacidade</a>
    </div>
</div>
```

---

## 13. Links

```html
<!-- Inline link (in body text) -->
<a href="#" class="underline hover:text-green transition-colors">texto do link</a>

<!-- Nav link (dark bg) -->
<a href="#" class="font-montserrat font-bold text-light hover:text-medium-green">link</a>

<!-- Footer legal link -->
<a href="#" class="font-work-sans text-dark text-xs hover:text-green">Termos</a>
```

---

## 14. Focus & Accessibility

All focusable elements use:
```
focus:outline-2 focus:outline-green focus:outline-offset-4
```

For interactive elements that are only keyboard-accessible:
```html
<div tabindex="0" class="focus:outline-2 focus:outline-green focus:outline-offset-4 rounded-4">
```

---

## 15. Transitions & Animation

Default transition for interactive elements:
```
transition-all ease-in-out duration-300
```

Icon slide-in (used on primary buttons):
```
translate-x-10 opacity-0 → group-hover:translate-x-0 group-hover:opacity-100
```

---

## 16. Alpine.js Patterns

### Setup (vite / npm)

```js
// resources/js/app.js
import Alpine from 'alpinejs'
import scrollTo from 'alpinejs-scroll-to'

Alpine.plugin(scrollTo)

// Register components
import modal from './components/modal.js'
import tabs from './components/tabs.js'
import dropdown from './components/dropdown.js'

Alpine.data('modal', modal)
Alpine.data('tabs', tabs)
Alpine.data('dropdown', dropdown)

Alpine.start()
```

### Data component pattern

Always use `Alpine.data()` in a separate file — never inline `x-data="{...}"` with logic:

```js
// resources/js/components/my-component.js
export default () => ({
    open: false,
    toggle() {
        this.open = !this.open
    }
})
```

```html
<div x-data="myComponent">
    <button @click="toggle">Toggle</button>
    <div x-show="open">Content</div>
</div>
```

---

## 17. Responsive Breakpoints (Tailwind defaults)

| Breakpoint | Min Width | Usage in this project                    |
|------------|-----------|------------------------------------------|
| `sm`       | 640px     | Show secondary CTA; scale hero text up   |
| `md`       | 768px     | Padding switches; hero image appears     |
| `lg`       | 1024px    | Desktop nav shows; 3-col grids activate  |
| `xl`       | 1280px    | Hero image full-width variant            |

Mobile-first approach: base styles for mobile, then `md:` and `lg:` overrides.

---

## 18. Z-Index Layers

| Layer      | z-index | Usage                              |
|------------|---------|-------------------------------------|
| Base       | 0       | Normal content                      |
| Below      | -10     | Hero background image               |
| Overlay    | 10      | Mobile menu overlay                 |
| Modal      | 50      | Modal dialogs                       |
| Toast      | 100     | Toast notifications (top-right)     |

---

## 19. Vite Config Template

```js
// vite.config.js
import { defineConfig } from 'vite'
import laravel from 'laravel-vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
})
```

---

## 20. package.json Template

```json
{
    "private": true,
    "type": "module",
    "scripts": {
        "build": "vite build",
        "dev": "vite"
    },
    "devDependencies": {
        "@tailwindcss/vite": "^4.0.0",
        "laravel-vite-plugin": "^1.2.0",
        "tailwindcss": "^4.0.0",
        "vite": "^6.0.0"
    },
    "dependencies": {
        "alpinejs": "^3.15.0",
        "alpinejs-scroll-to": "^1.1.1"
    }
}
```

---

## Quick Reference Cheatsheet

```
COLOURS       bg-dark  bg-light  bg-green  text-dark  text-light  text-green
              bg-light-danger  bg-light-success  bg-light-warning
              text-danger  text-success  text-warning

FONTS         font-montserrat (headings, CTAs)
              font-work-sans  (body, inputs, labels)

RADIUS        rounded-4 (buttons/inputs)  rounded-16 (cards)  rounded-22 (hero)

BUTTONS       bg-green text-dark → hover:bg-medium-green             [primary]
              border-green text-green → hover:bg-green-4             [secondary green]
              border-dark text-dark → hover:bg-dark/15               [secondary dark]
              text-light → hover:text-medium-green                   [nav]

INPUTS        bg-white/10 border border-dark rounded p-4             [light bg]
              bg-white border-0 rounded px-4 py-2                    [dark bg]
              focus:outline-2 focus:outline-green focus-offset-4     [focus ring]

SECTIONS      container mx-auto p-6 md:p-14                          [content]
              bg-dark p-6 md:p-14                                    [dark section]
              space-y-8 / gap-4 / space-x-4                          [spacing]
```

## 21. Logos  

If you need to get the logo svg raw data, you can look at folder of design/
