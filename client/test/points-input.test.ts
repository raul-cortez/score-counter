import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GameScreen from '../src/components/GameScreen.vue'
import EntriesLog from '../src/components/EntriesLog.vue'
import { ANYA, entry, game, roomState } from './fixtures.js'

/**
 * Ввод суммы прямо в поле.
 *
 * За партию очки приходят кучками, и складывать их в уме над телефоном — ровно то
 * место, где ошибаются. Проверяется, что до сервера доезжает итог, а недописанное
 * не отправляется вовсе.
 */

const state = roomState({ online: [ANYA.id] })
const current = game()

function board() {
  return mount(GameScreen, { props: { state, game: current, meId: ANYA.id, busy: false } })
}

describe('сумма в поле очков', () => {
  it('записывает итог, а не первое слагаемое', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('35+56+12')
    await screen.find('.btn-add').trigger('click')

    expect(screen.emitted('addPoints')).toEqual([[ANYA.id, 103]])
  })

  it('показывает итог до нажатия, чтобы было видно, что посчиталось', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('35+56')

    expect(screen.find('.sum-hint').text()).toBe('= 91')
  })

  it('на обычном числе итог не показывает — это шум', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('40')

    expect(screen.find('.sum-hint').text()).toBe('')
  })

  it('не отправляет недописанное и говорит об этом', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('35+')
    await screen.find('.btn-add').trigger('click')

    expect(screen.emitted('addPoints')).toBeUndefined()
    expect(screen.find('.sum-hint').text()).toBe('так не посчитать')
  })

  it('плюс ставится кнопкой: на цифровой клавиатуре телефона его нет', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('35')
    await screen.find('.btn-plus').trigger('click')

    expect((screen.find('.points-input').element as HTMLInputElement).value).toBe('35+')

    // Второй раз подряд плюс не дублируется.
    await screen.find('.btn-plus').trigger('click')
    expect((screen.find('.points-input').element as HTMLInputElement).value).toBe('35+')
  })

  it('просит у телефона панель с плюсом, а не числовую', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    const field = screen.find('.points-input')

    // На числовой панели iOS плюса нет вовсе — вернуть numeric значит сломать ввод суммы.
    expect(field.attributes('inputmode')).toBe('tel')
    expect(field.attributes('type')).toBe('tel')
  })

  it('итог меньше единицы не отправляется', async () => {
    const screen = board()
    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('40-40')
    await screen.find('.btn-add').trigger('click')

    expect(screen.emitted('addPoints')).toBeUndefined()
  })
})

describe('сумма при правке записи', () => {
  it('исправляет запись итогом суммы', async () => {
    const log = mount(EntriesLog, {
      props: {
        state,
        game: game({ entries: [entry({ points: 15 })] }),
        meId: ANYA.id,
        nameOf: () => 'Аня',
        busy: false,
      },
    })

    await log.find('.title').trigger('click')
    await log.findAll('.btn-tiny')[0].trigger('click')
    await log.find('.edit-input').setValue('20+22')
    await log.findAll('.btn-tiny')[0].trigger('click')

    expect(log.emitted('replaceEntry')).toEqual([['e-1', 42]])
  })

  it('поле правки просит ту же панель с плюсом', async () => {
    const log = mount(EntriesLog, {
      props: {
        state,
        game: game({ entries: [entry({ points: 15 })] }),
        meId: ANYA.id,
        nameOf: () => 'Аня',
        busy: false,
      },
    })

    await log.find('.title').trigger('click')
    await log.findAll('.btn-tiny')[0].trigger('click')

    expect(log.find('.edit-input').attributes('inputmode')).toBe('tel')
  })
})
