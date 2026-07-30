import { describe, it, expect } from 'vitest'
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../../src/domain/code.js'

describe('generateRoomCode', () => {
  it('возвращает шесть символов', () => {
    expect(generateRoomCode()).toHaveLength(6)
  })

  it('использует только символы алфавита без похожих знаков', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it('не содержит легко путаемых символов', () => {
    expect(ROOM_CODE_ALPHABET).not.toContain('O')
    expect(ROOM_CODE_ALPHABET).not.toContain('0')
    expect(ROOM_CODE_ALPHABET).not.toContain('I')
    expect(ROOM_CODE_ALPHABET).not.toContain('1')
  })

  it('берёт символы из переданного источника случайности', () => {
    const code = generateRoomCode(() => 0)

    expect(code).toBe(ROOM_CODE_ALPHABET[0].repeat(6))
  })
})
