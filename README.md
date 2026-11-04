# olx-watcher

Смотрит поиски аренды на OLX.pl и присылает в Telegram каждое новое объявление с раскладкой:
аренда, czynsz administracyjny, media, kaucja, prowizja biura, итог в месяц и на въезд, точка на
карте.

> Статус: каркас. Источник объявлений ещё не выбран — OLX отдаёт 403 автоматическим клиентам
> (и с сервера, и из дома). Варианты: [docs/olx-access.md](docs/olx-access.md).

## Локально

```bash
npm ci
cp .env.example .env   # заполнить токен бота и chat id
npm run check          # линт + типы + тесты
npm run once           # один проход опроса
```

## Продакшен

Живёт на том же VPS, что и Flotana (`ssh flotana`), в `/opt/olx-watcher`, отдельным
compose-проектом без портов.

```bash
npm run server -- env-push   # первый раз: залить .env на сервер
npm run deploy:production    # релиз запушенного main
npm run server -- logs
```

Подробно: [docs/deploy.md](docs/deploy.md). Правила для агентов: [AGENTS.md](AGENTS.md).
