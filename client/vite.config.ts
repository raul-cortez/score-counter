// defineConfig берётся из vitest, иначе поле test не проходит проверку типов.
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@score/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist' },
  // В разработке фронт и API живут на разных портах; в проде их раздаёт один Fastify.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        // Поток событий держится часами — таймаут прокси его бы обрывал.
        timeout: 0,
        proxyTimeout: 0,
        /**
         * Без своего обработчика ошибка прокси всплывает наверх и роняет весь
         * dev-сервер: перезапуск API убивал бы и фронт. Отвечаем 502 и живём дальше —
         * клиент сам переподключится.
         */
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: 'api_unavailable', message: err.message }))
            } else {
              res.end?.()
            }
          })
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
