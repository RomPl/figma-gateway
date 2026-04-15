# Deploy

## Проверенные факты по серверу

- проект расположен в `/home/figma-gateway.vazovski.art`
- владелец проекта: `figma5001`
- `systemd` доступен
- `node`: `/usr/bin/node`
- `npm`: `/usr/bin/npm`
- `nginx` на сервере сейчас не установлен

Поэтому базовый путь деплоя в этом проекте:

- `systemd` unit
- приложение слушает локальный порт
- внешний домен проксируется отдельным reverse proxy слоем

## Production artifacts

Добавлены файлы:

- [deploy/systemd/figma-gateway.service](/home/figma-gateway.vazovski.art/deploy/systemd/figma-gateway.service)
- [deploy/scripts/start-prod.sh](/home/figma-gateway.vazovski.art/deploy/scripts/start-prod.sh)
- [deploy/scripts/self-check.sh](/home/figma-gateway.vazovski.art/deploy/scripts/self-check.sh)
- [deploy/scripts/deploy.sh](/home/figma-gateway.vazovski.art/deploy/scripts/deploy.sh)
- [deploy/env/figma-gateway.env.production.example](/home/figma-gateway.vazovski.art/deploy/env/figma-gateway.env.production.example)
- [deploy/reverse-proxy/figma-gateway.nginx.example.conf](/home/figma-gateway.vazovski.art/deploy/reverse-proxy/figma-gateway.nginx.example.conf)

## Рекомендуемая production конфигурация

Рекомендуемые значения:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3100`
- `ENABLE_WRITE_ACTIONS=false`

Локальный bind на `127.0.0.1` нужен для работы через reverse proxy и чтобы не торчать наружу напрямую.

## Пошаговый деплой

1. Подготовить `.env`:
   - взять за основу [deploy/env/figma-gateway.env.production.example](/home/figma-gateway.vazovski.art/deploy/env/figma-gateway.env.production.example)
   - сохранить как `/home/figma-gateway.vazovski.art/.env`
2. Установить зависимости и собрать проект:
```bash
cd /home/figma-gateway.vazovski.art
npm ci
npm run build
```
3. Установить systemd unit:
```bash
sudo cp /home/figma-gateway.vazovski.art/deploy/systemd/figma-gateway.service /etc/systemd/system/figma-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable figma-gateway.service
```
4. Запустить сервис:
```bash
sudo systemctl start figma-gateway.service
```
5. Проверить локально:
```bash
cd /home/figma-gateway.vazovski.art
npm run self-check
```
6. Настроить reverse proxy на `https://figma-gateway.vazovski.art/` к `http://127.0.0.1:3100`

## Команда обновления сервиса

Повторяемый путь обновления:

```bash
cd /home/figma-gateway.vazovski.art
bash deploy/scripts/deploy.sh
```

Скрипт делает:

- `npm ci`
- `npm run build`
- `npm run check`
- `npm test`
- `systemctl restart`
- `systemctl status`
- `npm run self-check`

## Reverse proxy notes

На текущем сервере `nginx` не найден, поэтому в репозитории лежит только reference config:

- [deploy/reverse-proxy/figma-gateway.nginx.example.conf](/home/figma-gateway.vazovski.art/deploy/reverse-proxy/figma-gateway.nginx.example.conf)

Если у домена уже есть другой reverse proxy слой, сохранить те же правила:

- proxy на `127.0.0.1:3100`
- передавать `Host`
- передавать `X-Forwarded-For`
- передавать `X-Forwarded-Proto`
- передавать `X-Request-Id`

## Startup self-check

После старта unit выполняет:

- `GET /health`
- `GET /version`

Если одна из проверок не проходит, `ExecStartPost` завершится с ошибкой.

## /metrics

Endpoint `/metrics` в этот этап не добавлялся. Это осознанно:

- критерий допускает его как опциональный
- в проекте пока нет выбранного формата метрик и backend для scraping
