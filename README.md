# olx-watcher

Смотрит поиски аренды на OLX.pl и otodom.pl каждые 15 минут. Каждое новое объявление присылает в
Telegram с раскладкой: аренда, czynsz administracyjny, media, kaucja, prowizja biura, итог в месяц
и на въезд, точка на карте.

Где что работает (подробно: [docs/access.md](docs/access.md)):

- **OLX** опрашивается на сервере (VPS Flotana) через обычный headless Chromium (Playwright).
- **otodom** блокирует IP нашего сервера (Hetzner), поэтому его опрашивает GitHub Actions по
  расписанию раз в 15 минут.

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

## GitHub Actions (otodom)

Workflow `.github/workflows/otodom.yml`. Секреты репозитория (значения не печатаются):

```bash
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
gh secret set SEARCH_URLS      # те же ссылки через |, нужны только otodom
gh workflow run otodom         # первый запуск вручную: «прогрев», без сообщений
gh run list -w otodom
```

Что уже отправлено, хранится в кэше Actions. Если кэш пропадёт, следующий проход будет тихим
«прогревом»: без дублей, но объявления за этот промежуток пропустятся.

Подробно: [docs/deploy.md](docs/deploy.md). Правила для агентов: [AGENTS.md](AGENTS.md).
