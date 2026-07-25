{{--
    Button — Secondary
    ─────────────────────────────────────────────────────────
    Props:
      $size   — 'large' (default) | 'medium' | 'small'
      $color  — 'green' (default, for dark backgrounds) | 'dark' (for light backgrounds)
      $icon   — blade-icons name (optional)
      $type   — button type attribute (default: 'button')

    Usage:
      <x-button.secondary size="large" color="dark">
          Saber mais
      </x-button.secondary>

      <x-button.secondary size="large" color="green">
          Dúvida?
      </x-button.secondary>
--}}
@props([
    'size'  => 'large',
    'color' => 'green',
    'icon'  => null,
    'type'  => 'button',
])

<button
    type="{{ $type }}"
    {{
        $attributes->class([
            'flex rounded-4 bg-transparent border',
            'font-bold font-montserrat text-base',
            'transition-all ease-in-out duration-300',
            'cursor-pointer',
            'group',

            'border-green text-green hover:bg-green/5' => $color === 'green',
            'border-dark text-dark hover:bg-dark/15'   => $color === 'dark',

            'relative' => !empty($icon),

            'px-4 py-2'  => $size === 'large',
            'px-2 py-1'  => $size === 'medium',
            'px-1 py-0.5' => $size === 'small',
        ])
    }}
>
    <span>{{ $slot }}</span>

    @if (!empty($icon))
        @svg($icon, 'ml-2 w-4 h-4 shrink-0')
    @endif
</button>
