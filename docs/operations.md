# Operations

## Основные команды

Статус:

```bash
sudo systemctl status figma-gateway.service --no-pager
```

Рестарт:

```bash
sudo systemctl restart figma-gateway.service
```

Остановить:

```bash
sudo systemctl stop figma-gateway.service
```

Запустить:

```bash
sudo systemctl start figma-gateway.service
```

Логи:

```bash
sudo journalctl -u figma-gateway.service -n 200 --no-pager
sudo journalctl -u figma-gateway.service -f
```

Локальная smoke-проверка:

```bash
cd /home/figma-gateway.vazovski.art
npm run self-check
```

Полное обновление:

```bash
cd /home/figma-gateway.vazovski.art
bash deploy/scripts/deploy.sh
```

## Операционный чек-лист после релиза

1. `systemctl status` не показывает crash loop.
2. `npm run self-check` проходит.
3. Снаружи отвечает `https://figma-gateway.vazovski.art/health`.
4. Read-only GPT schema импортируется без ошибок.
5. `ENABLE_WRITE_ACTIONS=false`, если не было отдельного осознанного переключения.

## Ротация токенов

### Figma token

1. Выпустить новый token в Figma.
2. Обновить `FIGMA_TOKEN` в `/home/figma-gateway.vazovski.art/.env`.
3. Перезапустить сервис:
```bash
sudo systemctl restart figma-gateway.service
```
4. Прогнать:
```bash
cd /home/figma-gateway.vazovski.art
npm run self-check
```
5. Проверить реальный read-path вызов к Figma.
6. Отозвать старый token.

### API bearer token

1. Сгенерировать новый `API_BEARER_TOKEN`.
2. Обновить `/home/figma-gateway.vazovski.art/.env`.
3. Обновить токен в GPT Actions, MCP clients и других интеграциях.
4. Перезапустить сервис.
5. Проверить `401/403/200` сценарии.

## Изменение write-доступа

По умолчанию:

- `ENABLE_WRITE_ACTIONS=false`

Если write нужно включить:

1. Обновить `ENABLE_WRITE_ACTIONS=true` в `.env`.
2. Ограничить `WRITE_ALLOWED_OPERATIONS`.
3. Перезапустить сервис.
4. Проверить audit trail.

Не включать write-доступ без отдельного контролируемого процесса.
