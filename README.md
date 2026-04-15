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

## MVP scope первой версии

Первая рабочая версия намеренно ограничена.

Поддерживается:

- React + TypeScript
- базовые layout-компоненты
- text
- buttons
- images
- sections / frames / groups
- colors
- typography
- spacing
- border radius
- auto layout

Не входит в первую версию:

- сложная бизнес-логика
- анимации
- сложные canvas/WebGL UI
- responsive diff всех брейкпоинтов сразу
- полный round-trip для любых технологий

Подробно: `docs/mvp-scope-v1.md`.

## Design tokens как общий слой истины

Проект теперь поддерживает registry design tokens как shared source of truth между кодом и Figma.

Поддерживаются категории:

- colors
- spacing
- typography
- radius
- shadows
- breakpoints

Токены могут маппиться одновременно на:

- code refs (`className`, `css var`, file/export)
- Figma refs (`variableId`, `styleId`, collection)

Подробно: `docs/design-tokens.md`.

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
