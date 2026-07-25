{{--
    Form — Checkbox
    ─────────────────────────────────────────────────────────
    Props:
      $name     — checkbox name
      $value    — checkbox value (default: '1')
      $label    — label text rendered via slot or this prop
      $checked  — pre-checked state (default: false)
      $required — show required asterisk (default: false)

    Usage:
      <x-form.checkbox name="accept_tos" required>
          Aceito os <a href="{{ route('pages.terms') }}" class="underline hover:text-green">Termos e Condições</a>
      </x-form.checkbox>

      <x-form.checkbox name="newsletter" value="1">
          Aceito receber comunicações
      </x-form.checkbox>
--}}
@props([
    'name'     => null,
    'value'    => '1',
    'checked'  => false,
    'required' => false,
])

<div>
    <label class="inline-flex items-center cursor-pointer gap-2">
        <input
            {{ $attributes->merge([
                'type'     => 'checkbox',
                'id'       => $name,
                'name'     => $name,
                'value'    => $value,
                'checked'  => old($name, $checked) ? 'checked' : null,
                'required' => $required ?: null,
                'class'    => 'h-5 w-5 text-green focus:ring-green rounded border border-dark shrink-0',
            ]) }}
        >
        <span class="font-work-sans text-dark text-base">
            {{ $slot }}
            @if ($required)
                <span class="text-danger">*</span>
            @endif
        </span>
    </label>

    @if ($name)
        @error($name)
            <p class="text-danger text-sm mt-1">{{ $message }}</p>
        @enderror
    @endif
</div>
