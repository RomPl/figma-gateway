# Code Connect Integration Plan

## Зачем это нужно

Figma описывает Code Connect как мост между кодовой базой и Dev Mode. Это позволяет связывать design components с реальными компонентами репозитория и повышает точность MCP/codegen-сценариев за счет ссылок на настоящий production code.

Официальные источники:

- Introduction: https://developers.figma.com/docs/code-connect/
- Code Connect overview: https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect
- Code Connect UI setup: https://developers.figma.com/docs/code-connect/code-connect-ui-setup/

## Граница ответственности gateway

На этом этапе gateway делает только read-model:

- читает mapping files из репозитория
- валидирует формат
- отдает связи design component ↔ code component внутренним сервисам следующего этапа

Gateway не делает:

- генерацию кода
- запись mapping обратно в Figma
- синхронизацию через CLI/UI Code Connect

## Где хранить mapping files

Рекомендуемая директория:

- `code-connect/mappings/`

Рекомендуемая структура:

- `code-connect/mappings/react/`
- `code-connect/mappings/html/`
- `code-connect/mappings/ios/`
- `code-connect/mappings/android/`

Каждый файл:

- JSON
- один mapping или массив mappings
- одна предметная область или один component family на файл

Пример имени файла:

- `code-connect/mappings/react/button.json`
- `code-connect/mappings/react/modal.json`
- `code-connect/mappings/html/card.json`

## Формат mapping

Read-model ожидает JSON следующего вида:

```json
{
  "id": "ds-button-primary",
  "status": "active",
  "figma": {
    "fileKey": "abc123",
    "nodeId": "1:2",
    "componentKey": "figma-component-key",
    "name": "Button / Primary",
    "libraryName": "Design System",
    "variantProperties": {
      "Size": "md",
      "Kind": "primary"
    }
  },
  "code": {
    "repository": "github.com/acme/frontend",
    "path": "src/components/Button/Button.tsx",
    "exportName": "Button",
    "framework": "react",
    "language": "typescript",
    "storybookUrl": "https://storybook.acme.dev/?path=/docs/components-button",
    "docsUrl": "https://docs.acme.dev/components/button",
    "propsType": "ButtonProps",
    "examples": [
      "<Button variant=\"primary\" size=\"md\">Buy now</Button>"
    ]
  },
  "propMappings": {
    "Variant": "variant",
    "Size": "size",
    "Disabled": "disabled"
  },
  "notes": [
    "Use Button from design system, not raw <button>."
  ],
  "tags": ["design-system", "button"],
  "owners": ["frontend-platform"],
  "updatedAt": "2026-04-15T00:00:00.000Z"
}
```

## Naming rules

### Mapping id

- формат: `domain-component-variant`
- должен быть стабильным
- не использовать случайные UUID без необходимости

Примеры:

- `ds-button-primary`
- `marketing-hero-card`

### Figma component

- `figma.componentKey` использовать как главный внешний идентификатор
- `fileKey + nodeId` хранить как резервную привязку
- `figma.name` хранить только как удобочитаемое поле, не как стабильный ключ

### Code component

- `repository + path + exportName` считать стабильной связкой
- `path` всегда хранить относительно корня репозитория
- `exportName` всегда явно указывать, даже если файл экспортирует один компонент

## Conventions

### Один design component → один production component

Основное правило:

- mapping должен вести к production component из design system, а не к локальной обертке фичи

### Варианты и props

- `figma.variantProperties` фиксирует канонический вариант из Figma
- `propMappings` хранит соответствие Figma property → code prop

### Notes

- `notes` использовать только для implementation guidance
- не дублировать то, что уже видно из имени компонента или props

### Status

- `draft` — еще не использовать агентам по умолчанию
- `active` — нормальный production mapping
- `deprecated` — читать можно, но для новых реализаций не выбирать

## Repository scan strategy

Следующий этап интеграции должен идти так:

1. Сканировать `code-connect/mappings/**/*.json`.
2. Валидировать каждый файл через registry schema.
3. Собрать in-memory индекс по:
   - `figma.componentKey`
   - `code.path + exportName`
   - `tags`
   - `framework`
4. При конфликте по одному `figma.componentKey` падать с явной ошибкой валидации.
5. `deprecated` mappings не использовать в automatic selection, но оставлять в read-model.

## Отдельность от alias registry

Code Connect mappings не должны смешиваться с alias registry.

Разделение:

- alias registry: человекочитаемые ссылки на конкретные блоки в Figma
- code connect registry: связь design system components с кодовыми компонентами

Это разные сущности, разный lifecycle и разные владельцы.

## Что уже подготовлено

Read-only модуль:

- [src/core/code-connect-registry.ts](/home/figma-gateway.vazovski.art/src/core/code-connect-registry.ts)

Он умеет:

- читать mapping files с диска
- валидировать формат
- строить read-model
- искать по `figma.componentKey`
- искать по `code.path/exportName`
- делать простой search/filter

## Что делать следующим этапом

Следующий этап интеграции:

1. Добавить env для директории mapping files.
2. Подключить registry в app startup.
3. Добавить read-only REST/MCP endpoints для поиска mappings.
4. Добавить проверку конфликтов и health diagnostics по mappings.
5. Интегрировать registry в design-context и будущие agent workflows.
