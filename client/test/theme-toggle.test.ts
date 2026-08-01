import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeToggle from '../src/components/ThemeToggle.vue'
import { useTheme } from '../src/composables/useTheme.js'

/** Тема — общая на всё приложение, поэтому тест возвращает её в исходное. */
beforeEach(() => {
  const { isDark, toggleTheme } = useTheme()
  if (isDark.value) toggleTheme()
  localStorage.clear()
})

describe('переключатель темы', () => {
  it('показывает положение, а не то, что случится по нажатию', async () => {
    const toggle = mount(ThemeToggle)
    const button = toggle.get('button')

    expect(button.attributes('aria-checked')).toBe('false')
    expect(toggle.get('.track').classes()).not.toContain('dark')

    await button.trigger('click')

    expect(button.attributes('aria-checked')).toBe('true')
    expect(toggle.get('.track').classes()).toContain('dark')
  })

  it('переключает тему документа и запоминает выбор', async () => {
    const toggle = mount(ThemeToggle)

    await toggle.get('button').trigger('click')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('score-counter-theme')).toBe('dark')

    await toggle.get('button').trigger('click')

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('score-counter-theme')).toBe('light')
  })

  it('называет себя переключателем — иначе с экранным диктором его не нажать', () => {
    const button = mount(ThemeToggle).get('button')

    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-label')).toBe('Включить тёмную тему')
  })
})
