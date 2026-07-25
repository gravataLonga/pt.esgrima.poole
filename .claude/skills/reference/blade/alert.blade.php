{{--
    Alert
    ─────────────────────────────────────────────────────────
    Props:
      $type       — 'danger' | 'success' | 'warning' | 'info' (default: 'info')
      $title      — bold heading (optional)
      $dismissible — show close button (default: false)

    Usage:
      <x-alert type="danger" title="Corrija o formulário">
          <ul class="list-disc list-inside mt-2 text-sm">
              @foreach ($errors->all() as $error)
                  <li>{{ $error }}</li>
              @endforeach
          </ul>
      </x-alert>

      <x-alert type="success">
          Inscrição enviada com sucesso!
      </x-alert>

      <x-alert type="warning" dismissible>
          A sua inscrição está pendente de aprovação.
      </x-alert>
--}}
@props([
    'type'        => 'info',
    'title'       => null,
    'dismissible' => false,
])

@php
    $styles = match($type) {
        'danger'  => 'bg-light-danger border-danger text-danger',
        'success' => 'bg-light-success border-success text-success',
        'warning' => 'bg-light-warning border-warning text-warning',
        default   => 'bg-gray-light border-gray-medium text-dark',
    };
@endphp

<div
    {{ $attributes->class(["p-4 border rounded-4 $styles"]) }}
    @if ($dismissible) x-data="{ show: true }" x-show="show" @endif
>
    <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
            @if ($title)
                <p class="font-work-sans text-sm font-bold mb-1">{{ $title }}</p>
            @endif
            <div class="font-work-sans text-sm">
                {{ $slot }}
            </div>
        </div>

        @if ($dismissible)
            <button @click="show = false" class="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        @endif
    </div>
</div>
