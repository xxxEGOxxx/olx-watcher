# Product

Personal tool: one user, one Telegram chat, a few saved OLX.pl rental searches (apartments to rent,
mostly Warsaw). Goal: see the real cost of a listing at a glance instead of digging through the
description.

## Message per new listing

```
<b>Mieszkanie 2 pokoje, Mokotów</b>
Warszawa, Mokotów · 2 комн. · 45 м² · агентство

💰 В месяц: 3 600 zł
   аренда 3 000 zł + czynsz 600 zł + media —
🔑 На въезд: 8 100 zł
   kaucja 3 000 zł · prowizja 1 500 zł (50%)
⚠️ Не указано: media
📍 Карта (примерно)
🔗 Объявление
```

Followed by a Telegram location pin when the source gives an exact point.

- **Monthly** = rent + czynsz administracyjny + media (known parts only).
- **Move-in** = monthly + kaucja + prowizja (known parts only).
- Percent commissions are resolved against the rent.
- Missing parts are listed instead of guessed.

## Ideas / backlog

- Filters beyond OLX's own (max monthly total, private landlords only, no commission).
- Distance/commute time to a fixed address.
- Telegram commands: `/searches`, `/pause`, `/add <url>`.
- Price-drop notifications for already-seen listings.
