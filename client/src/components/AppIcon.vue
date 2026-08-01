<script setup lang="ts">
/**
 * Монохромные иконки одного набора.
 *
 * Раньше в интерфейсе стояли эмодзи: корона, кубок, замок. Их рисует шрифт системы,
 * поэтому на каждом телефоне они своего размера, веса и цвета — рядом с тонкой
 * версткой это выглядело как случайные наклейки, а в тёмной теме ещё и светилось.
 *
 * Здесь один стиль на всё: контур в 1.8 пикселя, скруглённые концы, цвет берётся
 * от текста (`currentColor`), поэтому иконка всегда в тон тому, рядом с чем стоит.
 */
export type IconName =
  | 'crown'
  | 'trophy'
  | 'lock'
  | 'pencil'
  | 'back'
  | 'exit'
  | 'chevron'
  | 'check'
  | 'close'

const PATHS: Record<IconName, string[]> = {
  crown: ['M4 18h16', 'M4 18 2.9 8.4l5.2 3.3L12 5l3.9 6.7 5.2-3.3L20 18'],
  trophy: [
    'M8 4h8v5a4 4 0 0 1-8 0z',
    'M8 6H5.5a3 3 0 0 0 3 3',
    'M16 6h2.5a3 3 0 0 1-3 3',
    'M12 13v4',
    'M8.5 20h7',
  ],
  lock: ['M5.5 10.5h13a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V12a1.5 1.5 0 0 1 1.5-1.5z', 'M8 10.5V7a4 4 0 0 1 8 0v3.5'],
  pencil: ['M13.5 5.5l5 5', 'M4 20l1.2-4.6L16 4.6a2 2 0 0 1 2.9 2.9L8.6 18.8z'],
  back: ['M15 5l-7 7 7 7'],
  exit: ['M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9', 'M16 8l4 4-4 4', 'M20 12H9.5'],
  chevron: ['M6 9.5l6 6 6-6'],
  check: ['M5 12.5l4.6 4.5L19 7'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
}

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 })
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, index) in PATHS[name]" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: none;
}
</style>
