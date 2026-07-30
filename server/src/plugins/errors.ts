import fp from 'fastify-plugin'

/**
 * Приводит все ошибки к виду { error, message }.
 * Клиент разбирает один формат, а не два: свой и фастифаевский.
 */
export default fp(async (app) => {
  app.setNotFoundHandler(async (_req, reply) => {
    await reply.code(404).send({ error: 'not_found', message: 'маршрут не найден' })
  })

  app.setErrorHandler(async (err, req, reply) => {
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
