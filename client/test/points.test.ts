import { describe, it, expect } from 'vitest'
import { looksLikeSum, parsePoints } from '../src/points.js'

describe('разбор поля очков', () => {
  it('понимает обычное число', () => {
    expect(parsePoints('40')).toBe(40)
  })

  it('складывает набранное через плюс', () => {
    expect(parsePoints('35+56+12')).toBe(103)
  })

  it('вычитает через минус: очки иногда снимают', () => {
    expect(parsePoints('100-40')).toBe(60)
    expect(parsePoints('35+56-12')).toBe(79)
  })

  it('не спотыкается о пробелы', () => {
    expect(parsePoints(' 35 + 56 ')).toBe(91)
  })

  it('понимает минус в начале', () => {
    expect(parsePoints('-20')).toBe(-20)
  })

  it('не считает недописанное', () => {
    // «35+» — человек ещё набирает; записать 35 значило бы записать не то.
    expect(parsePoints('35+')).toBeNull()
    expect(parsePoints('+')).toBeNull()
  })

  it('отказывается от мусора вместо того, чтобы выхватить из него число', () => {
    expect(parsePoints('35abc')).toBeNull()
    expect(parsePoints('35*2')).toBeNull()
    expect(parsePoints('3,5')).toBeNull()
    expect(parsePoints('')).toBeNull()
    expect(parsePoints('   ')).toBeNull()
  })

  it('видит, где сумма, а где просто число', () => {
    expect(looksLikeSum('35+56')).toBe(true)
    expect(looksLikeSum('100-40')).toBe(true)
    expect(looksLikeSum('40')).toBe(false)
    expect(looksLikeSum('-20')).toBe(false)
  })
})
