import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GameScreen from '../src/components/GameScreen.vue'
import EntriesLog from '../src/components/EntriesLog.vue'
import WaitingRoom from '../src/components/WaitingRoom.vue'
import VictoryScreen from '../src/components/VictoryScreen.vue'
import { ANYA, BORIS, entry, game, roomState } from './fixtures.js'

/**
 * Экраны собираются из настоящих ответов сервера.
 *
 * На сервере 103 теста дёргали ручки поодиночке и пропустили, что клиент физически
 * не может нарисовать табло. Здесь проверяется обратное: что из RoomState экран
 * рисуется целиком и в нём не проступают идентификаторы вместо имён.
 */

const UUID_LIKE = /\bu-[a-z]+\b|[0-9a-f]{8}-[0-9a-f]{4}/i

describe('табло', () => {
  const state = roomState({ online: [ANYA.id] })
  const current = game({ entries: [entry({ points: 15 }), entry({ id: 'e-2', userId: BORIS.id, points: 40 })] })

  it('показывает имена и счёт всех игроков', () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })
    const text = screen.text()

    expect(text).toContain('Аня')
    expect(text).toContain('Борис')
    expect(text).toContain('15')
    expect(text).toContain('40')
  })

  it('не выпускает идентификаторы на экран', () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })

    expect(screen.text()).not.toMatch(UUID_LIKE)
  })

  it('помечает, кто в сети и кто это вы', () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })

    expect(screen.findAll('.dot.on')).toHaveLength(1)
    expect(screen.text()).toContain('вы')
  })

  it('даёт хосту записать очки любому', async () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })

    await screen.findAll('.card-root')[1].trigger('click')

    expect(screen.find('.points-input').exists()).toBe(true)
    expect(screen.find('.for-whom').text()).toBe('Борис')
  })

  // Обычный игрок пишет только себе — как и разрешает сервер.
  it('не даёт обычному игроку выбрать чужую карточку', async () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: BORIS.id, busy: false },
    })

    await screen.findAll('.card-root')[0].trigger('click')
    expect(screen.find('.points-input').exists()).toBe(false)

    await screen.findAll('.card-root')[1].trigger('click')
    expect(screen.find('.points-input').exists()).toBe(true)
  })

  it('сообщает наружу, кому и сколько записали', async () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })

    await screen.findAll('.card-root')[0].trigger('click')
    await screen.find('.points-input').setValue('25')
    await screen.find('.btn-add').trigger('click')

    expect(screen.emitted('addPoints')).toEqual([[ANYA.id, 25]])
  })

  it('не пропускает ноль и минус', async () => {
    const screen = mount(GameScreen, {
      props: { state, game: current, meId: ANYA.id, busy: false },
    })
    await screen.findAll('.card-root')[0].trigger('click')

    await screen.find('.points-input').setValue('0')
    await screen.find('.btn-add').trigger('click')
    await screen.find('.points-input').setValue('-5')
    await screen.find('.btn-add').trigger('click')

    expect(screen.emitted('addPoints')).toBeUndefined()
  })
})

describe('журнал раздач', () => {
  const state = roomState()
  const withVoided = game({
    entries: [
      entry({ id: 'e-1', points: 15 }),
      entry({ id: 'e-2', seq: 2, points: 30, voidedAt: 1, voidedBy: ANYA.id }),
    ],
  })

  const props = (meId: string) => ({
    state,
    game: withVoided,
    meId,
    nameOf: (id: string) => (id === ANYA.id ? 'Аня' : 'Борис'),
    busy: false,
  })

  it('показывает и отменённые записи тоже', () => {
    const log = mount(EntriesLog, { props: props(ANYA.id) })

    expect(log.findAll('.row')).toHaveLength(2)
    expect(log.text()).toContain('отменено')
  })

  it('не предлагает трогать уже отменённую запись', () => {
    const log = mount(EntriesLog, { props: props(ANYA.id) })
    const voided = log.findAll('.row').find((row) => row.classes('voided'))!

    expect(voided.findAll('.btn-tiny')).toHaveLength(0)
  })

  it('правит запись, сохраняя нового значения', async () => {
    const log = mount(EntriesLog, { props: props(ANYA.id) })
    const live = log.findAll('.row').find((row) => !row.classes('voided'))!

    await live.findAll('.btn-tiny')[0].trigger('click')
    await live.find('.edit-input').setValue('42')
    await live.findAll('.btn-tiny')[0].trigger('click')

    expect(log.emitted('replaceEntry')).toEqual([['e-1', 42]])
  })

  it('отменяет запись', async () => {
    const log = mount(EntriesLog, { props: props(ANYA.id) })
    const live = log.findAll('.row').find((row) => !row.classes('voided'))!

    await live.findAll('.btn-tiny')[1].trigger('click')

    expect(log.emitted('voidEntry')).toEqual([['e-1']])
  })

  it('не даёт обычному игроку править чужую запись', () => {
    const log = mount(EntriesLog, { props: props(BORIS.id) })
    const live = log.findAll('.row').find((row) => !row.classes('voided'))!

    expect(live.findAll('.btn-tiny')).toHaveLength(0)
  })
})

describe('зал ожидания', () => {
  it('показывает состав и приглашает начать хоста', () => {
    const screen = mount(WaitingRoom, {
      props: { state: roomState({ game: null }), meId: ANYA.id, defaultLimit: 100, busy: false },
    })

    expect(screen.text()).toContain('Аня')
    expect(screen.text()).toContain('Борис')
    expect(screen.text()).toContain('ABC234')
    expect(screen.find('.btn-primary').exists()).toBe(true)
  })

  it('обычному игроку кнопку старта не показывает', () => {
    const screen = mount(WaitingRoom, {
      props: { state: roomState({ game: null }), meId: BORIS.id, defaultLimit: 100, busy: false },
    })

    expect(screen.find('.btn-primary').exists()).toBe(false)
    expect(screen.text()).toContain('Ждём')
  })

  it('не даёт начать игру в одиночку', () => {
    const screen = mount(WaitingRoom, {
      props: {
        state: roomState({ members: [ANYA], game: null }),
        meId: ANYA.id,
        defaultLimit: 100,
        busy: false,
      },
    })

    expect(screen.find('.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('передаёт выбранный лимит наверх', async () => {
    const screen = mount(WaitingRoom, {
      props: { state: roomState({ game: null }), meId: ANYA.id, defaultLimit: 100, busy: false },
    })

    await screen.find('.limit-input').setValue('250')
    await screen.find('.btn-primary').trigger('click')

    expect(screen.emitted('start')).toEqual([[250]])
  })
})

describe('экран победы', () => {
  const finished = game({
    status: 'finished',
    winnerUserId: BORIS.id,
    finishedAt: 1,
    entries: [entry({ points: 30 }), entry({ id: 'e-2', userId: BORIS.id, points: 120 })],
  })

  it('называет победителя и выстраивает таблицу', () => {
    const screen = mount(VictoryScreen, {
      props: { state: roomState({ game: finished }), game: finished, meId: ANYA.id, busy: false },
    })

    expect(screen.find('.title').text()).toBe('Борис')
    expect(screen.findAll('.place')[0].text()).toContain('Борис')
    expect(screen.text()).not.toMatch(UUID_LIKE)
  })

  it('предлагает хосту сыграть ещё с прежним лимитом', async () => {
    const screen = mount(VictoryScreen, {
      props: { state: roomState({ game: finished }), game: finished, meId: ANYA.id, busy: false },
    })

    await screen.find('.btn-new').trigger('click')

    expect(screen.emitted('playAgain')).toEqual([[100]])
  })

  it('не показывает кнопку остальным', () => {
    const screen = mount(VictoryScreen, {
      props: { state: roomState({ game: finished }), game: finished, meId: BORIS.id, busy: false },
    })

    expect(screen.find('.btn-new').exists()).toBe(false)
  })
})
