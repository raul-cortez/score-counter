import fp from 'fastify-plugin'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Приводит все ошибки к виду { error, message }.
 * Клиент разбирает один формат, а не два: свой и фастифаевский.
 */
export default fp(async (app, options: { appShell?: boolean }) => {
  app.setNotFoundHandler(async (req, reply) => {
    /**
     * Ненайденный GET вне /api — это маршрут приложения, о котором знает только
     * браузер. Без такой отдачи прямая ссылка `/room/КОД`, единственный способ
     * позвать друга, возвращала бы 404. Запросы к API так не обрабатываются: иначе
     * опечатка в адресе вернула бы HTML и клиент упал бы на разборе.
     */
    if (options.appShell === true && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'not_found', message: 'маршрут не найден' })
  })

  app.setErrorHandler(async (err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const status = err.statusCode ?? 500

    // Ошибку могли оформить до нас — например, ограничитель частоты запросов.
    const shaped = err as Error & { error?: unknown }
    if (typeof shaped.error === 'string' && status < 500) {
      return reply.code(status).send({ error: shaped.error, message: err.message })
    }

    if (status >= 500) {
      // Наружу уходит только общее сообщение: детали сбоя — не дело клиента.
      req.log.error(err)
      return reply.code(500).send({
        error: 'internal_error',
        message: 'внутренняя ошибка сервера',
      })
    }

    const error =
      err.code === 'FST_ERR_VALIDATION' ? 'validation_failed' : (err.code ?? 'bad_request')
    return reply.code(status).send({ error, message: err.message })
  })
})
