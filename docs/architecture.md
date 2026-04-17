# Architecture

## Цель

Backend и plugin-bridge для управляемого Figma Gateway, где синхронизация опирается не только на код и не только на Figma, а на отдельный слой реального browser render.

Фокус текущей архитектуры:

- React + TypeScript UI
- source mapping через code AST
- visual sync через rendered DOM/CSS snapshot
- design intent через design tokens
- design target через Figma snapshot
- безопасная обратная синхронизация визуальных изменений в код

Намеренно вне scope первой версии:

- сложная бизнес-логика
- анимации как baseline visual truth
- canvas/WebGL-heavy UI
- универсальный round-trip для любых технологий
- неконтролируемый захват приватных runtime state

## Источники истины

Целевая архитектура опирается на 4 разных источника, у каждого своя зона ответственности.

### 1. Code AST

Используется для:

- source mapping
- нахождения блока в коде
- безопасного patching
- сохранения ownership границ JSX

### 2. Rendered DOM/CSS snapshot

Используется для:

- visual truth
- фактического layout
- computed styles
- размеров, позиций и visibility
- реального состава иконок, изображений и background assets

### 3. Design tokens

Используются для:

- design intent
- нормализации raw visual values
- связывания code-side и figma-side решений с системными токенами

### 4. Figma snapshot

Используется для:

- design target
- editable design structure
- design-side representation и reconcile с макетом

## Приоритет источников

Система должна мыслить в следующем порядке:

- source mapping: Code AST
- visual truth: Rendered DOM
- design intent: Tokens
- design target: Figma

Главное правило: визуальная правда берётся из браузерного рендера, а не только из AST.

## Слои

- `src/index.ts` — bootstrap процесса и запуск HTTP сервера.
- `src/core` — app lifecycle, middleware, ошибки, snapshot/pipeline логика, reconcile и patching.
- `src/api` — HTTP routes и orchestration entrypoints.
- `src/config` — загрузка и валидация env-конфига.
- `src/utils` — инфраструктурные утилиты, включая logger.
- `src/mcp` — MCP integration surface.
- `src/types` — shared typings и декларации.

## Архитектурное правило visual sync

Любой visual sync должен опираться минимум на четыре согласованных представления:

1. Code AST — где находится блок и как его безопасно менять.
2. Rendered UI Snapshot — как блок реально выглядит после browser render.
3. Figma Snapshot — что находится в макете.
4. Design Tokens — какие системные решения стоят за этими значениями.

AST больше не должен считаться достаточным описанием визуального состояния интерфейса.

## Принципы

- Конфиг только из env.
- HTTP слой отделен от lifecycle и конфигурации.
- Логирование централизовано через Pino.
- Ошибки приводятся к единому JSON-формату.
- Shutdown обрабатывает `SIGINT` и `SIGTERM`.
- Visual truth определяется по real render snapshot, а не только по static code parsing.
- Code patching остаётся безопасным и ограниченным ownership границами.

## Текущие endpoint

- `GET /health` — состояние сервиса и uptime.
- `GET /version` — имя, версия и среда.

## Next architecture step

- Ввести runtime extractor для Rendered UI Snapshot.
- Связать render snapshot с `uiId`, code mapping и Figma mapping.
- Сделать render snapshot основным visual baseline для Code -> Figma, Figma -> Code, reconcile и token mapping.

## MVP contract

Сервис должен явно рекламировать scope первой версии через `/capabilities`, чтобы агент и клиенты не предполагали универсальную поддержку там, где её ещё нет.

## Identity-first, visual-second, planner-first layering

The gateway now moves toward an explicit four-step visual sync architecture:

1. stable identity and ownership from code or stable uiIds
2. rendered visual fragment tree from browser DOM/CSS
3. segmentation pass that converts raw rendered fragments into visual block boundaries
4. Figma composition planning that converts segmented visual blocks into editable Figma-native structure

Important compatibility rule:

- `uiId` remains the main durable cross-runtime identifier for reverse sync
- newer identity roles such as source identity, visual identity and figma ref are added in metadata first and should not break existing Figma -> code mapping
