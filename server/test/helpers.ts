import type { FastifyInstance } from 'fastify'
import type { PublicUser } from '@score/shared'
import { openDb, type Db } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

export type TestApp = { app: FastifyInstance; db: Db }

export async function makeApp(): Promise<TestApp> {
  const db = openDb(':memory:')
  const app = buildApp(db)
  await app.ready()
  return { app, db }
}

export async function closeApp({ app, db }: TestApp): Promise<void> {
  await app.close()
  db.close()
}

export type Guest = { token: string; user: PublicUser }

export async function createGuestSession(app: FastifyInstance, nickname: string): Promise<Guest> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { nickname },
  })
  if (res.statusCode !== 200) {
    throw new Error(`не удалось создать гостя: ${res.statusCode} ${res.body}`)
  }
  return res.json() as Guest
}

export function bearer(guest: Guest): Record<string, string> {
  return { authorization: `Bearer ${guest.token}` }
}
