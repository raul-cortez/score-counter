import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NicknameEditor from '../src/components/NicknameEditor.vue'
import { useSessionStore } from '../src/stores/session.js'

/** Настоящих запросов в тесте не делаем: проверяется, что и когда компонент зовёт. */
const post = vi.fn()
vi.mock('../src/api.js', () => ({
  api: {
    get: (...args: unknown[]) => Promise.reject(new Error(`неожиданный GET ${String(args[0])}`)),
    post: (...args: unknown[]) => post(...args),
  },
  setToken: () => undefined,
  describeError: () => 'не вышло',
}))

beforeEach(() => {
  setActivePinia(createPinia())
  post.mockReset()
  post.mockResolvedValue({ id: 'u-anya', nickname: 'Аня Б.', hasEmail: false, activeRoomCode: null })
})

function editorWithUser() {
  const session = useSessionStore()
  session.user = { id: 'u-anya', nickname: 'Аня', hasEmail: false, activeRoomCode: null }
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
    await editor.findAll('.btn-tiny')[0].trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/me/nickname', { nickname: 'Аня Б.' })
    expect(session.user?.nickname).toBe('Аня Б.')
    expect(editor.find('.name-field').exists()).toBe(false)
  })

  it('не дёргает сервер, если имя не менялось: комнате незачем знать', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('Аня')
    await editor.findAll('.btn-tiny')[0].trigger('click')

    expect(post).not.toHaveBeenCalled()
  })

  it('пустое имя не отправляет', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('   ')
    await editor.findAll('.btn-tiny')[0].trigger('click')

    expect(post).not.toHaveBeenCalled()
  })

  it('отмена возвращает старое имя', async () => {
    const { editor } = editorWithUser()

    await editor.find('.current').trigger('click')
    await editor.find('.name-field').setValue('Другое')
    await editor.findAll('.btn-tiny')[1].trigger('click')

    expect(post).not.toHaveBeenCalled()
    expect(editor.text()).toContain('Аня')
  })
})
