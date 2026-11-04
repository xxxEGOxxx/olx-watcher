# olx-watcher

Смотрит поиски аренды на otodom.pl (туда же дублируются объявления недвижимости с OLX) и присылает в Telegram каждое новое объявление с раскладкой:
аренда, czynsz administracyjny, media, kaucja, prowizja biura, итог в месяц и на въезд, точка на
карте.

> Статус: парсер otodom работает с домашнего IP. IP сервера otodom и OLX блокируют (403), поэтому
> где запускать опрос, ещё не решено: [docs/access.md](docs/access.md). Страницы OLX отдают 403
> любому не-браузерному клиенту.

## Локально

```bash
npm ci
cp .env.example .env   # заполнить токен бота и chat id
npm run check          # линт + типы + тесты
npm run once           # один проход опроса
npm run parse -- https://www.otodom.pl/pl/oferta/...   # разбор одной ссылки
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
