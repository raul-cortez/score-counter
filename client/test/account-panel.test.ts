import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountPanel from '../src/components/AccountPanel.vue'
import { useSessionStore } from '../src/stores/session.js'

/** Настоящих запросов в тесте не делаем: проверяется, что и когда компонент зовёт. */
const post = vi.fn()
vi.mock('../src/api.js', () => ({
  api: {
    get: () => Promise.resolve(null),
    post: (...args: unknown[]) => post(...args),
  },
  setToken: () => undefined,
  describeError: () => 'не вышло',
}))

const push = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  post.mockReset()
  post.mockResolvedValue({ id: 'u-anya', nickname: 'Аня', hasLogin: true, activeRoomCode: null })
  push.mockReset()
})

function panelWith(hasLogin: boolean) {
  const session = useSessionStore()
  session.user = { id: 'u-anya', nickname: 'Аня', hasLogin, activeRoomCode: null }
  return { panel: mount(AccountPanel), session }
}

/** Форма раскрывается по значку; он же её и закрывает. */
async function openPanel(panel: ReturnType<typeof mount>) {
  await panel.find('.icon').trigger('click')
  return panel
}

describe('аккаунт без логина', () => {
  it('до нажатия показывает только значок', () => {
    const { panel } = panelWith(false)

    expect(panel.find('.icon').exists()).toBe(true)
    expect(panel.find('.field').exists()).toBe(false)
  })

  it('по нажатию раскрывает поля логина и пароля', async () => {
    const panel = await openPanel(panelWith(false).panel)

    expect(panel.findAll('.field')).toHaveLength(2)
  })

  it('привязывает логин и закрывается', async () => {
    const { panel, session } = panelWith(false)

    await openPanel(panel)
    const fields = panel.findAll('.field')
    await fields[0].setValue('Anya')
    await fields[1].setValue('очень-секретно')
    await panel.find('.btn-wide').trigger('click')
    await flushPromises()

    // Логин уходит приведённым к нижнему: «Anya» и «anya» — это один человек.
    expect(post).toHaveBeenCalledWith('/auth/upgrade', {
      login: 'anya',
      password: 'очень-секретно',
    })
    expect(session.user?.hasLogin).toBe(true)
    expect(panel.find('.field').exists()).toBe(false)
  })

  it('не отправляет короткий пароль и объясняет, что не так', async () => {
    const { panel } = panelWith(false)

    await openPanel(panel)
    const fields = panel.findAll('.field')
    await fields[0].setValue('anya')
    await fields[1].setValue('корот')
    await panel.find('.btn-wide').trigger('click')

    expect(post).not.toHaveBeenCalled()
    expect(panel.text()).toContain('пароль короче восьми символов')
  })

  it('показывает отказ сервера, не закрывая форму', async () => {
    post.mockRejectedValue(new Error('занято'))
    const { panel } = panelWith(false)

    await openPanel(panel)
    const fields = panel.findAll('.field')
    await fields[0].setValue('anya')
    await fields[1].setValue('очень-секретно')
    await panel.find('.btn-wide').trigger('click')
    await flushPromises()

    expect(panel.text()).toContain('не вышло')
    expect(panel.findAll('.field')).toHaveLength(2)
  })
})

describe('закрытие формы', () => {
  it('повторное нажатие на значок убирает поля', async () => {
    const { panel } = panelWith(false)

    await openPanel(panel)
    await panel.find('.icon').trigger('click')

    expect(panel.find('.field').exists()).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('щелчок мимо закрывает', async () => {
    const { panel } = panelWith(false)

    await openPanel(panel)
    document.body.click()
    await flushPromises()

    expect(panel.find('.field').exists()).toBe(false)
  })

  it('Escape закрывает', async () => {
    const { panel } = panelWith(false)

    await openPanel(panel)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(panel.find('.field').exists()).toBe(false)
  })

  /** Слушатели живут на документе, а компонент уходит вместе с экраном. */
  it('уход со страницы снимает слушателей', async () => {
    const { panel } = panelWith(false)

    await openPanel(panel)
    panel.unmount()

    expect(() => document.body.click()).not.toThrow()
  })
})

describe('аккаунт с логином', () => {
  it('вместо формы предлагает выход', async () => {
    const panel = await openPanel(panelWith(true).panel)

    expect(panel.find('.field').exists()).toBe(false)
    expect(panel.find('.btn-wide').text()).toContain('Выйти')
  })

  it('гасит сессию и уводит на экран входа', async () => {
    const { panel, session } = panelWith(true)

    await openPanel(panel)
    await panel.find('.btn-wide').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(session.user).toBeNull()
    // Без перехода человек остался бы на экране комнаты, откуда его вот-вот
    // выставит маршрутизатор.
    expect(push).toHaveBeenCalledWith('/hello')
  })

  /** Сеть могла отвалиться ровно на выходе — себя всё равно забываем. */
  it('забывает себя, даже если сервер не ответил', async () => {
    post.mockRejectedValue(new Error('сеть'))
    const { panel, session } = panelWith(true)

    await openPanel(panel)
    await panel.find('.btn-wide').trigger('click')
    await flushPromises()

    expect(session.user).toBeNull()
    expect(push).toHaveBeenCalledWith('/hello')
  })
})

describe('незнакомцу', () => {
  it('не показывает ничего: привязывать логин ещё не к чему', () => {
    const panel = mount(AccountPanel)

    expect(panel.find('.icon').exists()).toBe(false)
  })
})
