{{--
    Badge
    ─────────────────────────────────────────────────────────
    Props:
      $type  — 'green' | 'dark' | 'danger' | 'success' | 'warning' | 'gray' (default: 'gray')
      $pill  — rounded-full pill style (default: true)

    Usage:
      <x-badge type="success">Pago</x-badge>
      <x-badge type="danger">Pendente</x-badge>
      <x-badge type="green">Novo</x-badge>
      <x-badge type="dark">Confirmado</x-badge>
--}}
@props([
    'type' => 'gray',
    'pill' => true,
])

@php
    $styles = match($type) {
        'green'   => 'bg-green text-dark',
        'dark'    => 'bg-dark text-light',
        'danger'  => 'bg-light-danger border border-danger text-danger',
        'success' => 'bg-light-success border border-success text-success',
        'warning' => 'bg-light-warning border border-warning text-warning',
        default   => 'bg-gray-light border border-gray-medium text-gray-dark',
    };
    $radius = $pill ? 'rounded-full' : 'rounded-4';
@endphp

<span {{ $attributes->class(["inline-flex items-center px-2.5 py-0.5 $radius $styles text-xs font-bold font-montserrat"]) }}>
    {{ $slot }}
</span>
