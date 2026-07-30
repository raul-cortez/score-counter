# Деплой

Один контейнер: Fastify отдаёт API, поток событий и собранный клиент. Панель не нужна — всё описано конфигами в репозитории.

Секретов нет. Токен сессии — случайные 32 байта, в базе лежит только его SHA-256, подписывать нечего.

## Что выбрать

Приложение слушает порт 3000 и о TLS ничего не знает. Наружу его выставляет обратный прокси, и от того, какой прокси уже стоит на машине, зависит выбор накладки.

| Накладка | Когда |
|---|---|
| `compose.traefik.yaml` | На машине уже работает Traefik и у него есть сертификат. Контейнер цепляется к его сети метками. Годится и тогда, когда Traefik поднят Coolify: сама панель при этом не нужна |
| `compose.port.yaml` | Впереди nginx, Caddy или Traefik с файловым провайдером. Контейнер слушает `127.0.0.1` и наружу не торчит |

Базовый `compose.yaml` наружу не смотрит вообще: без накладки до приложения не достучаться ниоткуда.

## Первый запуск

```bash
ssh vps
git clone <repo> /srv/score-counter && cd /srv/score-counter
cp .env.example .env && nano .env          # домен, имя сети прокси

# вариант с Traefik
docker compose -f compose.yaml -f compose.traefik.yaml up -d --build

# вариант с прокси на хосте
docker compose -f compose.yaml -f compose.port.yaml up -d --build
```

Имя сети Traefik подсматривается так:

```bash
docker inspect $(docker ps -qf name=traefik) --format '{{json .NetworkSettings.Networks}}'
```

У Coolify она обычно называется `coolify`.

**Том обязателен и уже описан в `compose.yaml`.** Он переживает `docker compose down`; чтобы стереть историю, нужно явное `down -v`. Не делайте так.

## Прокси на хосте

Для варианта с портом. nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # Ради потока событий: без этого обновления копятся в буфере и приходят
    # пачками через минуты, а выглядит это как «приложение тормозит».
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

Caddy:

```caddy
score.fastio.ru {
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}
```

`flush_interval -1` у Caddy — то же самое, что `proxy_buffering off` у nginx.

## Обновление

```bash
cd /srv/score-counter && git pull
docker compose -f compose.yaml -f compose.traefik.yaml up -d --build
```

Остановка корректная: сервер ловит `SIGTERM`, закрывает открытые потоки и снимает таймеры, поэтому контейнер гаснет сразу, а не по тайм-ауту. Клиенты переподключаются сами и догружают пропущенное.

Откатиться можно на предыдущий коммит тем же `git checkout` и пересборкой: образ метится переменной `TAG` из `.env`.

## Проверка после выкатки

```bash
curl https://score.fastio.ru/api/health          # {"status":"ok"}
curl -sI https://score.fastio.ru/room/ABC234     # 200, а не 404
```

Отдельно стоит убедиться, что поток не буферизуется, — это самая частая поломка за прокси:

```bash
# Должно печатать кадры по мере поступления, а не выдать всё разом в конце.
curl -N https://score.fastio.ru/api/rooms/КОД/events?ticket=…
```

Сервер уже отдаёт `X-Accel-Buffering: no` и `Cache-Control: no-transform`, и шлёт heartbeat раз в 25 секунд. Этого хватает для прокси с типичным тайм-аутом 30–60 секунд.

## Бэкап

```bash
# -w /app/server обязателен: better-sqlite3 лежит в node_modules сервера,
# из корня /app он не находится. Старый снимок надо убрать заранее:
# VACUUM INTO отказывается писать в существующий файл.
docker exec score-counter rm -f /data/backup.db
docker exec -w /app/server score-counter node -e "
  require('better-sqlite3')('/data/score.db').exec(\"VACUUM INTO '/data/backup.db'\")
"
docker cp score-counter:/data/backup.db ./score-$(date +%F).db
docker exec score-counter rm -f /data/backup.db
```

Именно так, а не копированием файла: база работает в режиме WAL, и обычное `cp` может поймать её на середине записи. `VACUUM INTO` делает согласованный снимок на работающей базе, останавливать контейнер не нужно.

Восстановление — через служебный контейнер, а не `docker cp`:

```bash
docker compose -f compose.yaml -f compose.traefik.yaml stop

docker run --rm -v score-counter_score-data:/data -v "$PWD":/backup alpine sh -c "
  cp /backup/score-2026-07-30.db /data/score.db &&
  rm -f /data/score.db-wal /data/score.db-shm &&
  chown 1000:1000 /data/score.db
"

docker compose -f compose.yaml -f compose.traefik.yaml start
```

`chown` здесь не формальность. `docker cp` кладёт файл с идентификатором пользователя с вашей машины, а приложение работает под `node` (uid 1000) — без смены владельца контейнер уходит в цикл перезапусков с `SQLITE_READONLY`. Файлы `-wal` и `-shm` удаляются потому, что они относятся к прежней базе и с восстановленной несовместимы.

## Локальная проверка

```bash
docker compose -f compose.yaml -f compose.port.yaml up -d --build
open http://127.0.0.1:3000
docker compose -f compose.yaml -f compose.port.yaml down
```
