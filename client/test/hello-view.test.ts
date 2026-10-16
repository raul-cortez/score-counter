import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HelloView from '../src/views/HelloView.vue'

/** Настоящих запросов в тесте не делаем: проверяется, что и когда экран зовёт. */
const post = vi.fn()
vi.mock('../src/api.js', () => ({
  api: {
    get: () => Promise.resolve(null),
    post: (...args: unknown[]) => post(...args),
  },
  setToken: () => undefined,
  describeError: () => 'не вышло',
}))

const replace = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ replace }),
  useRoute: () => ({ query: { next: '/room/ABC234' } }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  post.mockReset()
  post.mockResolvedValue({
    token: 't-1',
    user: { id: 'u-anya', nickname: 'Аня', hasLogin: false, activeRoomCode: null },
  })
  replace.mockReset()
})

const enterAsGuest = () => mount(HelloView)

async function openLoginForm() {
  const view = mount(HelloView)
  await view.find('.link').trigger('click')
  return view
}

describe('вход новым именем', () => {
  it('заводит гостя и возвращает по ссылке-приглашению, а не в лобби', async () => {
    const view = enterAsGuest()

    await view.find('.name-input').setValue('Аня')
    await view.find('.btn-primary').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/auth/guest', { nickname: 'Аня' })
    expect(replace).toHaveBeenCalledWith('/room/ABC234')
  })

  it('не отправляет пустое имя', async () => {
    const view = enterAsGuest()

    await view.find('.name-input').setValue('   ')
    await view.find('.btn-primary').trigger('click')

    expect(post).not.toHaveBeenCalled()
  })

  /** Гостевой вход остаётся входом по умолчанию: аккаунт заводить необязательно. */
  it('первым показывает поле имени, а форму логина — только по просьбе', async () => {
    const view = enterAsGuest()

    expect(view.findAll('.name-input')).toHaveLength(1)
    expect(view.text()).toContain('Как вас записать?')

    await view.find('.link').trigger('click')

    expect(view.findAll('.name-input')).toHaveLength(2)
    expect(view.text()).toContain('Вход по логину')
  })
})

describe('вход по логину', () => {
  it('входит и возвращает по ссылке-приглашению', async () => {
    const view = await openLoginForm()

    const fields = view.findAll('.name-input')
    await fields[0].setValue('Anya')
    await fields[1].setValue('очень-секретно')
    await view.find('.btn-primary').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/auth/login', { login: 'anya', password: 'очень-секретно' })
    expect(replace).toHaveBeenCalledWith('/room/ABC234')
  })

  it('не отправляет короткий пароль и объясняет, что не так', async () => {
    const view = await openLoginForm()

    const fields = view.findAll('.name-input')
    await fields[0].setValue('anya')
    await fields[1].setValue('корот')
    await view.find('.btn-primary').trigger('click')

    expect(post).not.toHaveBeenCalled()
    expect(view.text()).toContain('пароль короче восьми символов')
  })

  it('показывает отказ сервера', async () => {
    post.mockRejectedValue(new Error('нет'))
    const view = await openLoginForm()

    const fields = view.findAll('.name-input')
    await fields[0].setValue('anya')
    await fields[1].setValue('очень-секретно')
    await view.find('.btn-primary').trigger('click')
    await flushPromises()

    expect(view.text()).toContain('не вышло')
    expect(replace).not.toHaveBeenCalled()
  })

  it('возвращается к вводу имени и не тащит пароль обратно', async () => {
    const view = await openLoginForm()

    const fields = view.findAll('.name-input')
    await fields[1].setValue('очень-секретно')
    await view.find('.link').trigger('click')

    expect(view.findAll('.name-input')).toHaveLength(1)
    await view.find('.link').trigger('click')
    expect(view.findAll('.name-input')[1].element).toHaveProperty('value', '')
  })
})
