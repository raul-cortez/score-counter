import { describe, it, expect } from 'vitest'
import {
  canAddEntryFor,
  canVoidEntry,
  canStartGame,
  type PermissionContext,
} from '../../src/domain/permissions.js'

const ctx: PermissionContext = {
  actorId: 'anya',
  hostId: 'anya',
  playerIds: ['anya', 'boris'],
}

const asBoris: PermissionContext = { ...ctx, actorId: 'boris' }
const asStranger: PermissionContext = { ...ctx, actorId: 'chuzhoj' }

describe('canAddEntryFor', () => {
  it('разрешает записывать очки себе', () => {
    expect(canAddEntryFor(asBoris, 'boris')).toBe(true)
  })

  it('запрещает обычному игроку записывать очки другому', () => {
    expect(canAddEntryFor(asBoris, 'anya')).toBe(false)
  })

  it('разрешает хосту записывать очки другому', () => {
    expect(canAddEntryFor(ctx, 'boris')).toBe(true)
  })

  it('запрещает тому, кто не в составе игры', () => {
    expect(canAddEntryFor(asStranger, 'chuzhoj')).toBe(false)
  })

  it('запрещает запись очков тому, кого нет в составе', () => {
    expect(canAddEntryFor(ctx, 'chuzhoj')).toBe(false)
  })
})

describe('canVoidEntry', () => {
  it('разрешает отменить свою запись', () => {
    expect(canVoidEntry(asBoris, 'boris')).toBe(true)
  })

  it('запрещает обычному игроку отменять чужую запись', () => {
    expect(canVoidEntry(asBoris, 'anya')).toBe(false)
  })

  it('разрешает хосту отменить чужую запись', () => {
    expect(canVoidEntry(ctx, 'boris')).toBe(true)
  })

  it('запрещает постороннему', () => {
    expect(canVoidEntry(asStranger, 'anya')).toBe(false)
  })
})

describe('canStartGame', () => {
  it('разрешает хосту', () => {
    expect(canStartGame(ctx)).toBe(true)
  })

  it('запрещает не-хосту', () => {
    expect(canStartGame(asBoris)).toBe(false)
  })
})
