import { describe, it, expect } from 'vitest'
import { loginProblem, normalizeLogin, passwordProblem } from '../src/credentials.js'

describe('логин', () => {
  it('принимает обычное слово и знаки, которые есть на любой клавиатуре', () => {
    expect(loginProblem('anya')).toBeNull()
    expect(loginProblem('anya.b_1-2')).toBeNull()
    expect(loginProblem('123')).toBeNull()
  })

  it('не пускает кириллицу: раскладку на телефоне переключают незаметно для себя', () => {
    expect(loginProblem('аня')).toBe('в логине только латиница, цифры и . _ -')
  })

  it('просит логин, если пусто или одни пробелы', () => {
    expect(loginProblem('')).toBe('нужен логин')
    expect(loginProblem('   ')).toBe('нужен логин')
  })

  it('бранит за длину', () => {
    expect(loginProblem('an')).toContain('короче')
    expect(loginProblem('a'.repeat(33))).toContain('длиннее')
  })

  /** Собака — ровно то, от чего уходили: её ещё надо найти на клавиатуре телефона. */
  it('не пускает почту и пробелы внутрь логина', () => {
    expect(loginProblem('anya@example.com')).toBe('в логине только латиница, цифры и . _ -')
    expect(loginProblem('anya b')).toBe('в логине только латиница, цифры и . _ -')
  })

  it('пробелы по краям не считает ошибкой: их ставит автозамена', () => {
    expect(loginProblem('  anya  ')).toBeNull()
  })
})

describe('пароль', () => {
  it('принимает восемь символов и больше', () => {
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem('очень-секретно')).toBeNull()
  })

  it('бранит за пустоту и короткость', () => {
    expect(passwordProblem('')).toBe('нужен пароль')
    expect(passwordProblem('1234567')).toBe('пароль короче восьми символов')
  })

  /** Пробел — законный символ пароля, обрезать его значило бы менять секрет. */
  it('не трогает пробелы внутри и по краям', () => {
    expect(passwordProblem('  восемь  ')).toBeNull()
  })
})

describe('приведение логина', () => {
  it('убирает пробелы по краям и опускает регистр', () => {
    expect(normalizeLogin('  AnYa  ')).toBe('anya')
  })
})
