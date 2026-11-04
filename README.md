# olx-watcher

Смотрит поиски аренды на OLX.pl и otodom.pl каждые 15 минут. Каждое новое объявление присылает в
Telegram с раскладкой: аренда, czynsz administracyjny, media, kaucja, prowizja biura, итог в месяц
и на въезд, точка на карте.

Где что работает (подробно: [docs/access.md](docs/access.md)):

- **OLX** опрашивается на сервере (VPS Flotana) через обычный headless Chromium (Playwright).
- **otodom** блокирует IP дата-центров, включая наш сервер, поэтому его опрашивает домашний
  раннер на Маке (launchd). Он работает, пока Мак не спит.

## Локально

```bash
npm ci
npx playwright install --only-shell chromium   # один раз, для OLX
cp .env.example .env   # токен бота, chat id, ссылки поиска
npm run check          # линт + типы + тесты
npm run once           # один проход опроса
npm run parse -- https://www.olx.pl/d/oferta/...   # разбор одной ссылки (или otodom)
```

Ссылки поиска копируются прямо из адресной строки OLX или otodom вместе с фильтрами.

## Сервер (OLX)

Живёт на том же VPS, что и Flotana (`ssh flotana`): `/opt/olx-watcher`, отдельный
compose-проект без портов.

```bash
npm run server -- env-push   # залить .env (SOURCES=olx)
npm run deploy:production    # релиз запушенного main
npm run server -- logs
```

## Дом (otodom)

```bash
cp .env.example .env.home    # SOURCES=otodom, тот же бот и чат
npm run home -- install      # launchd-агент на Маке
npm run home -- logs
```

Когда домашний раннер работает, на сервере поставь `SKIP_OTODOM_COPIES=1`. Иначе квартиры с
otodom, продублированные на OLX, придут дважды.

Подробно: [docs/deploy.md](docs/deploy.md). Правила для агентов: [AGENTS.md](AGENTS.md).
