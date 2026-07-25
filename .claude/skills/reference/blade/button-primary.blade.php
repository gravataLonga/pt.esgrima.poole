{{--
    Button — Primary
    ─────────────────────────────────────────────────────────
    Props:
      $size   — 'large' (default) | 'medium' | 'small'
      $icon   — blade-icons name e.g. 'design.arrow-right' (optional)
      $type   — button type attribute (default: 'button')

    Usage:
      <x-button.primary size="large" icon="design.arrow-right">
          Inscreve-te
      </x-button.primary>

      <x-button.primary size="large" type="submit" icon="design.arrow-right">
          Enviar
      </x-button.primary>
--}}
@props([
    'size' => 'large',
    'icon' => null,
    'type' => 'button',
])

<button
    type="{{ $type }}"
    {{
        $attributes->class([
            'rounded-4 transition-all ease-in-out duration-300',
            'bg-green hover:bg-medium-green',
            'text-dark font-bold font-montserrat text-base',
            'overflow-hidden',
            'relative flex items-center group' => !empty($icon),

            'px-4 py-2'  => $size === 'large',
            'hover:pr-10' => $size === 'large' && !empty($icon),

            'px-2 py-1'  => $size === 'medium',
            'hover:pr-8'  => $size === 'medium' && !empty($icon),

            'px-1 py-0.5' => $size === 'small',
            'hover:pr-6'  => $size === 'small' && !empty($icon),
        ])
    }}
>
    {{ $slot }}

    @if (!empty($icon))
        @svg($icon, 'absolute right-3 top-1/2 -translate-y-1/2 translate-x-10 opacity-0 transition-all ease-in-out duration-300 group-hover:translate-x-0 group-hover:opacity-100 w-5 h-5 shrink-0')
    @endif
</button>
