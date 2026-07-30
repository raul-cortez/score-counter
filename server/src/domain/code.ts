import { randomInt } from 'node:crypto'

/** Без O/0 и I/1 — код диктуют голосом и вводят с телефона. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(pick: (max: number) => number = randomInt): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)]
  }
  return code
}
