{{--
    Form — Textarea
    ─────────────────────────────────────────────────────────
    Props:
      $name     — textarea name + id
      $label    — label text (optional)
      $rows     — number of visible rows (default: 4)
      $required — show required asterisk (default: false)
      $helper   — helper text below (optional)

    Usage:
      <x-form.textarea name="observation" label="Observações" rows="4"
          placeholder="Ex: dificuldades, problemas de saúde, etc." />
--}}
@props([
    'name'     => null,
    'label'    => null,
    'rows'     => 4,
    'required' => false,
    'helper'   => null,
])

<div>
    @if ($label)
        <label
            @if ($name) for="{{ $name }}" @endif
            class="block text-sm font-work-sans mb-1 text-dark"
        >
            {{ $label }}
            @if ($required)
                <span class="text-danger">*</span>
            @endif
        </label>
    @endif

    <textarea
        {{ $attributes->merge([
            'id'       => $name,
            'name'     => $name,
            'rows'     => $rows,
            'class'    => 'font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full transition-colors',
            'required' => $required ?: null,
        ]) }}
    >{{ $name ? old($name) : '' }}</textarea>

    @if ($helper)
        <p class="text-xs font-work-sans mt-1 text-gray-dark">{{ $helper }}</p>
    @endif

    @if ($name)
        @error($name)
            <p class="text-danger text-sm mt-1">{{ $message }}</p>
        @enderror
    @endif
</div>
