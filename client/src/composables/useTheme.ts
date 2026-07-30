import { ref } from 'vue'

const THEME_KEY = 'score-counter-theme'

const isDark = ref(false)

/** Тема и её хранение перенесены из офлайн-версии без изменений, включая ключ. */
export function useTheme() {
  function applyTheme(dark: boolean): void {
    isDark.value = dark
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }

  function restoreTheme(): void {
    if (localStorage.getItem(THEME_KEY) === 'dark') applyTheme(true)
  }

  return { isDark, toggleTheme: () => applyTheme(!isDark.value), restoreTheme }
}
