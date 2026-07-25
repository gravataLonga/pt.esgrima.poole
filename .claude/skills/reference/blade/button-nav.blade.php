{{--
    Button — Navigation link
    ─────────────────────────────────────────────────────────
    Used inside the dark top header navigation bar.

    Props:
      $href — URL (optional, renders <a> when provided, <button> otherwise)

    Usage:
      <x-button.nav href="{{ route('calendar.index') }}">
          Calendário
      </x-button.nav>

      <x-button.nav x-data @click.prevent="$scrollTo({targetId: 'precarios'})">
          Mensalidades
      </x-button.nav>
--}}
@props(['href' => null])

@if ($href)
    <a
        href="{{ $href }}"
        {{ $attributes->except('href')->merge() }}
        class="font-bold font-montserrat py-2 px-4 rounded-4 text-light whitespace-nowrap hover:text-medium-green active:text-green transition-colors"
    >
        {{ $slot }}
    </a>
@else
    <button
        {{ $attributes->merge() }}
        class="font-bold font-montserrat py-2 px-4 rounded-4 text-light whitespace-nowrap hover:text-medium-green active:text-green transition-colors cursor-pointer"
    >
        {{ $slot }}
    </button>
@endif
