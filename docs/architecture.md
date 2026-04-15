# Architecture

## Цель

Каркас backend-сервиса для будущего Figma Gateway без интеграции с внешними API на текущем этапе.

## Слои

- `src/index.ts` — bootstrap процесса и запуск HTTP сервера.
- `src/core` — app lifecycle, middleware, ошибки, graceful shutdown.
- `src/api` — HTTP routes и будущие контроллеры.
- `src/config` — загрузка и валидация env-конфига.
- `src/utils` — инфраструктурные утилиты, включая logger.
- `src/mcp` — зарезервировано под будущую MCP-интеграцию.
- `src/types` — shared typings и декларации.

## Принципы

- Конфиг только из env.
- HTTP слой отделен от lifecycle и конфигурации.
- Логирование централизовано через Pino.
- Ошибки приводятся к единому JSON-формату.
- Shutdown обрабатывает `SIGINT` и `SIGTERM`.

## Текущие endpoint

- `GET /health` — состояние сервиса и uptime.
- `GET /version` — имя, версия и среда.

## Следующий этап

- Добавить OpenAPI-спецификацию.
- Ввести отдельные controller/service модули.
- Подключить request-id и access logging.
- Добавить тесты smoke/integration.
