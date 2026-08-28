import { describe, it, expect } from 'vitest'
import { sessionCookie, readSessionCookie } from '../src/auth/cookies.js'

describe('sessionCookie', () => {
  it('заворачивает токен в HttpOnly-куку с большим сроком', () => {
    const header = sessionCookie('abc123')

    expect(header).toContain('sid=abc123')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Lax')
    expect(header).toMatch(/Max-Age=\d+/)
  })
})

describe('readSessionCookie', () => {
  it('достаёт токен из единственной куки', () => {
    expect(readSessionCookie('sid=abc123')).toBe('abc123')
  })

  it('достаёт нужную куку среди нескольких', () => {
    expect(readSessionCookie('theme=dark; sid=abc123; lang=ru')).toBe('abc123')
  })

  it('возвращает null, если заголовка нет', () => {
    expect(readSessionCookie(undefined)).toBeNull()
  })

  it('возвращает null, если искомой куки нет', () => {
    expect(readSessionCookie('theme=dark')).toBeNull()
  })
})
