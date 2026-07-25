{{--
    Form — Select
    ─────────────────────────────────────────────────────────
    Props:
      $name        — select name + id
      $label       — label text (optional)
      $required    — show required asterisk (default: false)
      $placeholder — first disabled option text (default: '— Selecione —')
      $helper      — helper text below (optional)
      $slot        — <option> elements

    Usage:
      <x-form.select name="gender" label="Sexo" required>
          <option value="M" {{ old('gender') == 'M' ? 'selected' : '' }}>Masculino</option>
          <option value="F" {{ old('gender') == 'F' ? 'selected' : '' }}>Feminino</option>
      </x-form.select>

      <x-form.select name="interest" label="Interesse" placeholder="— Selecione o seu interesse —">
          <option value="competition">Competição</option>
          <option value="leisure">Lazer</option>
      </x-form.select>
--}}
@props([
    'name'        => null,
    'label'       => null,
    'required'    => false,
    'placeholder' => '— Selecione —',
    'helper'      => null,
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

    <select
        {{ $attributes->merge([
            'id'       => $name,
            'name'     => $name,
            'class'    => 'font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full transition-colors',
            'required' => $required ?: null,
        ]) }}
    >
        @if ($placeholder)
            <option value="">{{ $placeholder }}</option>
        @endif
        {{ $slot }}
    </select>

    @if ($helper)
        <p class="text-xs font-work-sans mt-1 text-gray-dark">{{ $helper }}</p>
    @endif

    @if ($name)
        @error($name)
            <p class="text-danger text-sm mt-1">{{ $message }}</p>
        @enderror
    @endif
</div>
