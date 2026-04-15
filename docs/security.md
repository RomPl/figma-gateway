# Security

## Что включено

- bearer auth для всех `\/api/*`
- request id через `X-Request-Id`
- базовый in-memory rate limit по IP
- CORS allowlist
- production security headers
- redaction чувствительных данных в логах

## Env

- `API_BEARER_TOKEN` — обязательный bearer token для доступа к `\/api/*`
- `CORS_ALLOWED_ORIGINS` — список origins через запятую
- `RATE_LIMIT_WINDOW_MS` — окно rate limit
- `RATE_LIMIT_MAX_REQUESTS` — лимит запросов в окне

## Поведение auth

- без `Authorization: Bearer <token>` любой запрос к `\/api/*` получает `401`
- с неверным token любой запрос к `\/api/*` получает `403`
- `\/health` остается доступным без auth

## Поведение CORS

- запросы без `Origin` не блокируются
- браузерные запросы с origin вне allowlist получают `403`
- preflight `OPTIONS` для разрешенных origins завершается на middleware CORS

## Rate limit

- реализация базовая, in-memory
- подходит для одного инстанса
- для нескольких инстансов нужен внешний storage: Redis или API gateway limit

## Security headers

Проставляются:

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Cross-Origin-Resource-Policy`
- `Permissions-Policy`
- `X-DNS-Prefetch-Control`

## Логи

- `Authorization` редактируется
- поля `token`, `apiBearerToken`, `figmaToken` редактируются
- request logging не пишет заголовки запроса

## Ограничения

- auth сейчас один общий bearer token, без RBAC
- rate limit локальный и не разделяется между процессами
