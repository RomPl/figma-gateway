# Figma Gateway

Минимальный production-ready каркас backend-сервиса на Node.js и TypeScript без бизнес-логики Figma.

## Требования

- Node.js 20+

## Быстрый старт

```bash
nvm use
cp .env.example .env
npm install
npm run dev
```

Production run:

```bash
nvm use
npm install
npm run build
npm start
```

## Runtime isolation

Для этого проекта не используется Python `venv`, так как это Node.js backend. Изоляция обеспечивается через локальные зависимости в `node_modules` и фиксированную версию Node в `.nvmrc`.

## Доступные endpoint

- `GET /health`
- `GET /version`

## Конфигурация

Все runtime-конфиги читаются только из переменных окружения.

| Переменная | Описание | Значение по умолчанию |
| --- | --- | --- |
| `NODE_ENV` | Среда запуска | `development` |
| `HOST` | Хост bind | `0.0.0.0` |
| `PORT` | Порт HTTP сервера | `3000` |
| `LOG_LEVEL` | Уровень логирования Pino | `info` |
| `APP_NAME` | Имя сервиса | `figma-gateway` |
| `APP_VERSION` | Версия сервиса | `0.1.0` |

## Скрипты

- `npm run dev` — запуск в dev-режиме
- `npm run build` — сборка TypeScript в `dist/`
- `npm start` — запуск production-сборки
- `npm run check` — проверка типов

## Структура

```text
src/
  api/
  config/
  core/
  mcp/
  types/
  utils/
docs/
openapi/
tests/
```
