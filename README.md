# Tscaradeep Lab catalog

Каталог в стиле lab-board с формой заказа. Заказы отправляются в Telegram через Telegram Bot API, а товары можно брать из Notion, Airtable или локального JSON.

## Запуск

```bash
npm run dev
```

Откройте `http://localhost:3000`.

## Настройка Telegram

1. Создайте бота через `@BotFather` и получите токен.
2. Узнайте `chat_id` нужного чата или личного диалога.
3. Создайте `.env` рядом с `server.js`:

```bash
HOST=127.0.0.1
PORT=3000
TELEGRAM_BOT_TOKEN=ваш_токен
TELEGRAM_CHAT_ID=ваш_chat_id
```

Если `.env` не настроен, форма работает в демо-режиме: заказ выводится в терминал, но не отправляется в Telegram.

## CMS

По умолчанию без `.env` каталог берет товары из `data/products.json`.

Чтобы подключить Notion:

```bash
CMS_PROVIDER=notion
NOTION_TOKEN=secret...
NOTION_DATABASE_ID=...
```

`NOTION_DATABASE_ID` проще всего взять из URL страницы с базой. Если используете новый Notion API и знаете data source id, можно указать его вместо database id:

```bash
NOTION_DATA_SOURCE_ID=...
```

Рекомендуемые поля для Notion:

```text
Name
Slug
SKU
Price
Description
Status
Image
Published
Order
Layout X
Layout Y
Layout W
Layout H
```

`Image` можно оставить пустым: тогда сайт покажет чистый блок-заготовку под картинку.

Чтобы подключить Airtable:

```bash
CMS_PROVIDER=airtable
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_TABLE_NAME=Products
AIRTABLE_VIEW=Published
```

## Товары

Цена хранится на сервере и не берется из формы, чтобы клиент не мог подменить сумму.
