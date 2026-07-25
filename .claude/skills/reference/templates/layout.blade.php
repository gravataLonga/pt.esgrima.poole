<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    {{-- Favicons --}}
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="theme-color" content="#1D3749">

    <title>@yield('title', config('app.name'))</title>
    <meta name="description" content="@yield('description', '')">

    {{-- Google Fonts — loaded in CSS via @import, but preconnect here for perf --}}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles

    @stack('head')
</head>
<body class="antialiased font-work-sans text-base bg-light">

{{-- ═══════════════════════════════════════════════════════════
     HEADER
════════════════════════════════════════════════════════════ --}}
<div class="bg-dark py-8">
    <div class="container mx-auto">
        <header class="flex justify-between items-center mx-4 md:mx-0 space-x-4"
                x-data="{ menuOpen: false }">

            {{-- Logo --}}
            <div class="flex items-center flex-1">
                <a href="/">
                    @svg('design.logo-green')
                </a>
            </div>

            {{-- Desktop nav --}}
            <x-menu class="items-center justify-end hidden lg:flex" />

            {{-- CTAs --}}
            <div class="flex items-center space-x-2 md:space-x-4">
                <x-button.secondary
                    size="large"
                    color="green"
                    class="hidden sm:flex"
                    x-data
                    @click="$scrollTo({ targetId: 'duvida' })"
                >
                    Dúvida?
                </x-button.secondary>

                <x-button.primary
                    size="large"
                    icon="design.arrow-right"
                    onclick="window.location='{{ route('athletes.register.show') }}'"
                >
                    Inscreve-te
                </x-button.primary>

                {{-- Mobile hamburger --}}
                <button @click="menuOpen = true"
                        class="flex lg:hidden text-white cursor-pointer p-1">
                    @svg('grommet-menu', ['class' => 'w-8 h-8'])
                </button>
            </div>

            {{-- Mobile full-screen menu --}}
            <div
                x-show="menuOpen"
                x-cloak
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0"
                x-transition:enter-end="opacity-100"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100"
                x-transition:leave-end="opacity-0"
                class="fixed top-0 left-0 bg-dark w-full h-screen z-50"
            >
                <div class="container mx-auto">
                    <div class="flex justify-between items-center mx-4 my-8">
                        <a href="/">
                            @svg('design.logo-green')
                        </a>
                        <button @click="menuOpen = false" class="text-white cursor-pointer">
                            @svg('grommet-close', ['class' => 'w-8 h-8'])
                        </button>
                    </div>
                    <x-menu @click="menuOpen = false" class="flex flex-col space-y-2 px-4" />
                </div>
            </div>

        </header>
    </div>
</div>
{{-- /HEADER --}}


{{-- ═══════════════════════════════════════════════════════════
     PAGE CONTENT
════════════════════════════════════════════════════════════ --}}
@yield('content')


{{-- ═══════════════════════════════════════════════════════════
     FOOTER
════════════════════════════════════════════════════════════ --}}
<div class="w-full p-6 md:p-14 mb-32 bg-dark min-h-[720px] bg-no-repeat bg-center bg-cover"
     style="background-image: url('{{ asset('img/shape-footer-bottom.svg') }}')">
    <div class="container mx-auto">
        <div class="flex flex-col md:flex-row space-y-10 md:space-y-0 md:space-x-12">

            {{-- Address --}}
            <div class="flex flex-col md:w-3/12 space-y-2">
                <h6 class="text-light font-montserrat text-4xl font-bold mb-4">Como chegar</h6>
                <p class="text-green font-montserrat text-subtitle font-bold">
                    R. da Nave,<br>4500-054 Espinho
                </p>
                <p class="text-light font-work-sans text-base">
                    (estacionamento gratuito no complexo desportivo)
                </p>
            </div>

            {{-- Hours + Contact --}}
            <div class="flex flex-col md:w-4/12 space-y-10 md:space-y-[58px]">
                <div class="space-y-4">
                    <h6 class="text-light font-montserrat text-4xl font-bold">Horário</h6>
                    <p class="text-green font-montserrat text-subtitle font-bold">
                        Segunda, Quarta e Sexta<br>19:00 – 20:30
                    </p>
                    <p class="text-light font-work-sans text-base">
                        (não é obrigatório ir às três aulas)
                    </p>
                </div>
                <div class="space-y-4">
                    <h6 class="text-light font-montserrat text-4xl font-bold">Contacto</h6>
                    <p class="text-green font-montserrat text-subtitle font-bold">961 040 379</p>
                    <p class="text-light font-work-sans text-base">(Ricardo Gouveia)</p>
                </div>
            </div>

            {{-- Contact form --}}
            <div class="md:w-5/12">
                <livewire:contact />
            </div>

        </div>
    </div>
</div>

{{-- Social --}}
<div class="w-full mb-16 -mt-[120px] md:-mt-64">
    <div class="container mx-auto">
        <div class="flex flex-col items-center md:items-start space-y-4">
            <h6 class="text-dark font-montserrat text-4xl font-bold mb-4">Segue-nos</h6>
            <div class="flex space-x-8">
                <a href="https://www.instagram.com/esgrima.ngd.espinho/" target="_blank" class="block hover:opacity-80 transition-opacity">
                    @svg('design.instagram')
                </a>
                <a href="https://www.facebook.com/EsgrimaEspinho" target="_blank" class="block hover:opacity-80 transition-opacity">
                    @svg('design.facebook')
                </a>
                <a href="https://wa.me/351961040379" target="_blank" class="block hover:opacity-80 transition-opacity">
                    @svg('design.whatsapp')
                </a>
            </div>
        </div>
    </div>
</div>

{{-- Copyright bar --}}
<div class="container mx-auto px-10 flex flex-col md:flex-row md:justify-between mt-10 mb-10">
    <p class="text-xs font-work-sans text-dark">© {{ date('Y') }} Todos os direitos reservados</p>
    <div class="flex md:justify-end space-x-8 mt-2 md:mt-0">
        <a href="{{ route('pages.terms-and-condition') }}" class="font-work-sans text-dark text-xs hover:text-green transition-colors">
            Termos e Condições
        </a>
        <a href="{{ route('pages.privacy') }}" class="font-work-sans text-dark text-xs hover:text-green transition-colors">
            Política de Privacidade
        </a>
    </div>
</div>
{{-- /FOOTER --}}

{{-- Toast container (place once; dispatch 'toast' events from anywhere) --}}
<div
    x-data="toasts"
    @toast.window="add($event.detail.message, $event.detail.type)"
    class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-80"
>
    <template x-for="toast in items" :key="toast.id">
        <div
            x-show="toast.visible"
            x-cloak
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="opacity-0 translate-y-2"
            x-transition:enter-end="opacity-100 translate-y-0"
            x-transition:leave="transition ease-in duration-200"
            x-transition:leave-start="opacity-100 translate-y-0"
            x-transition:leave-end="opacity-0 translate-y-2"
            :class="typeClasses(toast.type)"
            class="flex items-start justify-between gap-3 p-4 rounded-4 border shadow-md"
        >
            <p class="font-work-sans text-sm font-bold" x-text="toast.message"></p>
            <button @click="remove(toast.id)" class="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    </template>
</div>

@livewireScripts

@stack('scripts')
</body>
</html>
