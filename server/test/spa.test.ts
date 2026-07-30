import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { openDb, type Db } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

let app: FastifyInstance
let db: Db
let root: string

const INDEX = '<!DOCTYPE html><title>Счётчик очков</title><div id="app"></div>'

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'score-static-'))
  writeFileSync(join(root, 'index.html'), INDEX)
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)')

  db = openDb(':memory:')
  app = buildApp(db, { staticRoot: root })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('раздача собранного клиента', () => {
  it('отдаёт приложение с корня', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Счётчик очков')
  })

  it('отдаёт собранные файлы', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('console.log')
  })

  // Ссылка-приглашение — единственный способ позвать друга, и такого файла на
  // диске нет: без fallback она давала бы 404.
  it('открывает прямую ссылку на комнату', async () => {
    const res = await app.inject({ method: 'GET', url: '/room/ABC234' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Счётчик очков')
  })

  it('открывает прямую ссылку на разбор партии', async () => {
    const res = await app.inject({ method: 'GET', url: '/history/g-1' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Счётчик очков')
  })

  // Иначе опечатка в адресе API возвращала бы HTML, и клиент падал бы на разборе.
  it('на несуществующий маршрут API отвечает ошибкой, а не страницей', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/нет-такого' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('not_found')
    expect(res.body).not.toContain('<!DOCTYPE')
  })

  it('API продолжает работать', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('на POST в никуда не отдаёт страницу', async () => {
    const res = await app.inject({ method: 'POST', url: '/что-то' })

    expect(res.statusCode).toBe(404)
  })
})

describe('сервер без собранного клиента', () => {
  it('поднимается и отдаёт API, когда статики нет', async () => {
    const bare = openDb(':memory:')
    const bareApp = buildApp(bare)
    await bareApp.ready()

    const res = await bareApp.inject({ method: 'GET', url: '/api/health' })
    expect(res.json()).toEqual({ status: 'ok' })

    await bareApp.close()
    bare.close()
  })
})
