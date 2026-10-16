import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NicknameEditor from '../src/components/NicknameEditor.vue'
import { useSessionStore } from '../src/stores/session.js'

/** Настоящих запросов в тесте не делаем: проверяется, что и когда компонент зовёт. */
const post = vi.fn()
const get = vi.fn()
vi.mock('../src/api.js', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  setToken: () => undefined,
  describeError: () => 'не вышло',
}))

beforeEach(() => {
  setActivePinia(createPinia())
  post.mockReset()
  post.mockResolvedValue({ id: 'u-anya', nickname: 'Аня Б.', hasLogin: false, activeRoomCode: null })
  get.mockReset()
  get.mockResolvedValue({ nickname: null })
})

function editorWithUser() {
  const session = useSessionStore()
  session.user = { id: 'u-anya', nickname: 'Аня', hasLogin: false, activeRoomCode: null }
  return { editor: mount(NicknameEditor), session }
}

describe('смена имени', () => {
  it('показывает текущее имя, пока его не трогают', () => {
    const { editor } = editorWithUser()

    expect(editor.text()).toContain('Аня')
    expect(editor.find('.name-field').exists()).toBe(false)
  })

  it('сохраняет новое имя и убирает поле', async () => {
    const { editor, session } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('Аня Б.')
    await editor.find('[title="Готово"]').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/me/nickname', { nickname: 'Аня Б.' })
    expect(session.user?.nickname).toBe('Аня Б.')
    expect(editor.find('.name-field').exists()).toBe(false)
  })

  it('не дёргает сервер, если имя не менялось: комнате незачем знать', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('Аня')
    await editor.find('[title="Готово"]').trigger('click')

    expect(post).not.toHaveBeenCalled()
  })

  it('пустое имя не отправляет', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('   ')
    await editor.find('[title="Готово"]').trigger('click')

    expect(post).not.toHaveBeenCalled()
  })

  it('отмена возвращает старое имя', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('Другое')
    await editor.find('[title="Отмена"]').trigger('click')

    expect(post).not.toHaveBeenCalled()
    expect(editor.text()).toContain('Аня')
  })
})

describe('случайное прошлое имя', () => {
  it('подставляет в поле имя, которое вернул сервер, не отправляя его', async () => {
    get.mockResolvedValue({ nickname: 'Старое имя' })
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('[title="Взять одно из прошлых имён"]').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenCalledWith('/me/nickname/random')
    expect((editor.find('.name-field').element as HTMLInputElement).value).toBe('Старое имя')
    expect(post).not.toHaveBeenCalled()
  })

  it('сообщает, если прошлых имён ещё не было', async () => {
    get.mockResolvedValue({ nickname: null })
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('[title="Взять одно из прошлых имён"]').trigger('click')
    await flushPromises()

    expect(editor.text()).toContain('Прошлых имён пока нет')
  })
})
