import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

/**
 * Раздача собранного клиента тем же процессом.
 *
 * Один домен на статику и API — значит нет CORS, нет второго контейнера и один
 * деплой. В разработке каталога сборки нет: тогда плагин ничего не делает, а фронт
 * живёт на Vite со своим прокси.
 *
 * Отдачей ненайденных маршрутов занимается обработчик в plugins/errors.ts: Fastify
 * разрешает только один такой обработчик на инстанс, и держать его в одном месте
 * честнее, чем делить между плагинами.
 */

/** Каталог со сборкой или null, если её нет. */
export function resolveAppShell(root: string | undefined): string | null {
  if (root === undefined) return null
  return existsSync(join(root, 'index.html')) ? root : null
}

export default fp(async (app, options: { root: string }) => {
  await app.register(fastifyStatic, { root: options.root, wildcard: false })
})
