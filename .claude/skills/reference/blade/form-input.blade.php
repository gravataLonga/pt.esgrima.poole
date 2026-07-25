{{--
    Form — Input
    ─────────────────────────────────────────────────────────
    Props:
      $name     — input name + id (used for old() and @error)
      $label    — label text (optional)
      $type     — input type (default: 'text')
      $value    — default value (optional)
      $required — show required asterisk (default: false)
      $helper   — helper text below input (optional)

    Usage:
      <x-form.input name="first_name" label="Nome" required placeholder="Joaquim Fernando" />
      <x-form.input name="email" label="E-mail" type="email" required />
      <x-form.input name="dob" label="Data de Nascimento" type="date" required />
      <x-form.input
          name="citizen_number"
          label="Número de Cidadão"
          helper="Para inscrição na Federação Portuguesa de Esgrima."
      />
--}}
@props([
    'name'     => null,
    'label'    => null,
    'type'     => 'text',
    'value'    => null,
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

    <input
        {{ $attributes->merge([
            'id'          => $name,
            'name'        => $name,
            'type'        => $type,
            'value'       => $name ? old($name, $value) : $value,
            'class'       => 'font-work-sans bg-white/10 border border-dark rounded p-4 focus:outline-offset-4 focus:outline-2 focus:outline-green w-full transition-colors',
            'required'    => $required ?: null,
        ]) }}
    >

    @if ($helper)
        <p class="text-xs font-work-sans mt-1 text-gray-dark">{{ $helper }}</p>
    @endif

    @if ($name)
        @error($name)
            <p class="text-danger text-sm mt-1">{{ $message }}</p>
        @enderror
    @endif
</div>
