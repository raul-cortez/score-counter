import { describe, it, expect } from 'vitest'
import { nextHost } from '../../src/domain/host.js'

describe('выбор нового хоста', () => {
  it('берёт первого онлайн-участника в порядке мест за столом', () => {
    expect(nextHost(['host', 'anna', 'boris'], ['boris', 'anna'], 'host')).toBe('anna')
  })

  it('не отдаёт роль самому хосту', () => {
    expect(nextHost(['host', 'anna'], ['host', 'anna'], 'host')).toBe('anna')
  })

  it('возвращает null, когда передавать некому', () => {
    expect(nextHost(['host', 'anna'], [], 'host')).toBeNull()
    expect(nextHost(['host', 'anna'], ['host'], 'host')).toBeNull()
  })

  // Онлайн может числиться тот, кто уже вышел из комнаты: реестр соединений
  // и состав комнаты живут порознь.
  it('игнорирует онлайн-пользователей, не состоящих в комнате', () => {
    expect(nextHost(['host', 'anna'], ['stranger'], 'host')).toBeNull()
  })
})
