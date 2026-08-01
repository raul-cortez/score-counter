<script setup lang="ts">
import { useTheme } from '../composables/useTheme.js'

/**
 * Переключатель темы.
 *
 * Ползунок, а не кнопка с эмодзи: кнопка показывала значок того, что произойдёт по
 * нажатию, и читалась ровно наоборот — солнце на светлой теме выглядело как «сейчас
 * светло», хотя означало «стать светлым». У ползунка видно положение.
 *
 * Значок живёт в самом бегунке, а не на дорожке: на дорожке бегунок его накрывал,
 * и половина переключателя выглядела пустой.
 *
 * Иконки нарисованы svg, а не взяты эмодзи: эмодзи рисуются шрифтом системы, на
 * разных телефонах разного размера и цвета.
 */
const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    role="switch"
    :aria-checked="isDark"
    :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'"
    :title="isDark ? 'Светлая тема' : 'Тёмная тема'"
    @click="toggleTheme"
  >
    <span class="track" :class="{ dark: isDark }">
      <span class="knob">
        <svg class="glyph sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path
            stroke-linecap="round"
            d="M12 2.8v2.1M12 19.1v2.1M4.9 12H2.8M21.2 12h-2.1M6.7 6.7 5.2 5.2M18.8 18.8l-1.5-1.5M17.3 6.7l1.5-1.5M5.2 18.8l1.5-1.5"
          />
        </svg>

        <svg class="glyph moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.7 14.6A8.6 8.6 0 0 1 9.4 3.3a8.7 8.7 0 1 0 11.3 11.3Z" />
        </svg>
      </span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.theme-toggle {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  line-height: 0;

  &:focus-visible .track {
    outline: 2px solid var(--btn-bg);
    outline-offset: 3px;
  }
}

.track {
  position: relative;
  display: block;
  width: 62px;
  height: 32px;
  border: 2px solid var(--border);
  border-radius: 999px;
  background: var(--bg-card);
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.theme-toggle:hover .track {
  border-color: var(--border-hover);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--btn-bg);
  color: var(--btn-text);
  box-shadow: 0 1px 4px var(--shadow);
  /* Лёгкий перелёт: бегунок ощущается вещью, а не перерисовкой. */
  transition: transform 0.24s cubic-bezier(0.34, 1.35, 0.64, 1);
}

.track.dark .knob {
  transform: translateX(30px);
}

.glyph {
  position: absolute;
  width: 15px;
  height: 15px;
  transition:
    opacity 0.18s ease,
    transform 0.24s ease;
}

/* Показан значок того, что сейчас включено, а не того, что случится по нажатию. */
.sun {
  opacity: 1;
  transform: rotate(0deg);
}

.moon {
  opacity: 0;
  transform: rotate(-60deg);
}

.track.dark .sun {
  opacity: 0;
  transform: rotate(60deg);
}

.track.dark .moon {
  opacity: 1;
  transform: rotate(0deg);
}

/* Кому анимация мешает — тому её и не показываем. */
@media (prefers-reduced-motion: reduce) {
  .knob,
  .glyph {
    transition: none;
  }
}
</style>
