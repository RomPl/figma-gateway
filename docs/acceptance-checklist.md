# Acceptance checklist — Figma Gateway

Дата приемки: 2026-04-15
Статус: ACCEPTED

## Scope

Проверка выполнена по реальным сценариям:

- REST read-only
- MCP read-only
- GPT Actions read-only
- dry-run write
- auth/security
- production deployment / public gateway

## Automated smoke tests

Добавлен smoke test:

- `tests/smoke/acceptance-smoke.test.ts`

Покрытие smoke:

- `/`
- `/health`
- authenticated REST read-only request
- GPT Actions CORS preflight
- MCP tool registration and read-only execution
- MCP dry-run write without adapter call
- 401 / 403 / 429 сценарии
- audit trail for REST + MCP

Запуск:

```bash
npm test
```

Результат:

- `npm test` → **45/45 PASS**

## Final public end-to-end acceptance results

### 1) REST read-only

#### Scenario
- `GET /`
- `GET /health`
- `GET /version`
- authenticated `GET /api/aliases?project=marketing-site&limit=10`
- authenticated `POST /api/resolve-alias`

#### Result
- **PASS**

#### Evidence
- `/` -> `200`
- `/health` -> `200`
- `/version` -> `200`
- authenticated aliases list -> `200`
- authenticated alias resolve -> `200`

---

### 2) MCP read-only

#### Scenario
- register MCP tools
- execute `figma_get_file`
- verify MCP output format

#### Result
- **PASS**

#### Notes
- confirmed by automated smoke
- audit trail for MCP confirmed in tests

---

### 3) GPT Actions read-only

#### Scenario
- verify public root endpoint
- verify `/health` and `/version`
- verify CORS preflight for `https://chat.openai.com`
- verify CORS preflight for `https://chatgpt.com`

#### Result
- **PASS**

#### Evidence
- both public OPTIONS preflight requests now return `204`
- `Access-Control-Allow-Origin` is returned for both allowed origins

---

### 4) dry-run write

#### Scenario
- execute public authenticated dry-run write
- confirm safe non-live behavior

#### Result
- **PASS**

#### Evidence
- public dry-run write returns `200`
- response confirms `performed: false`, `dryRun: true`

#### Notes
- dry-run is allowed safely even while live write actions remain disabled

---

### 5) auth / security

#### Scenario
- request without bearer token
- request with invalid bearer token
- authenticated request
- rate limit headers
- CORS preflight

#### Result
- **PASS**

#### Evidence
- 401 without token
- 403 with invalid token
- authenticated requests work
- rate limit headers are returned
- public CORS preflight works for GPT Actions origins

---

### 6) Production deployment / public gateway

#### Scenario
- verify systemd unit
- verify self-check
- verify public HTTPS
- verify edge proxy path

#### Result
- **PASS**

#### Notes
- `figma-gateway.service` is stable
- backend moved to free port `3100`
- LiteSpeed proxies to `127.0.0.1:3100`
- DNS points to `77.105.164.183`
- `vps183` proxies `443` through VPN to `10.8.0.2:443`
- `:80` redirects to HTTPS

## Passed summary

| Area | Status | Comment |
|---|---|---|
| REST read-only | PASS | Public domain verified |
| MCP read-only | PASS | Smoke verified |
| GPT Actions read-only | PASS | Public CORS verified |
| dry-run write | PASS | Safe dry-run behavior confirmed |
| auth/security | PASS | 401/403/rate-limit/CORS verified |
| production deployment | PASS | systemd + proxy path fixed |
| public gateway readiness | PASS | DNS + VPS proxy + local backend aligned |

## What was fixed during acceptance

### 1. Wrong backend port / restart loop
- old state: service tried self-check on `127.0.0.1:3000`
- issue: `3000` already belonged to `nghttpx`
- fix: gateway moved to **free port `3100`**

### 2. Missing reverse proxy for figma-gateway vhost
- old state: LiteSpeed returned `404` for `/health` and `/`
- fix: vhost switched to proxy mode -> `127.0.0.1:3100`

### 3. Fragile self-check
- old state: `ExecStartPost` failed too early
- fix: self-check now uses `.env` values and retry logic

### 4. SQLite write permissions
- old state: audit writes failed with readonly database errors
- fix: ownership/permissions corrected for runtime user `figma5001`

### 5. Browser root route missing
- old state: `GET /` returned `ROUTE_NOT_FOUND`
- fix: root endpoint added with browser-friendly JSON payload

### 6. Public DNS / edge path mismatch
- old state: public DNS pointed to wrong external route
- fix: `figma-gateway.vazovski.art` redirected to `77.105.164.183`
- fix: `vps183` explicitly redirects `figma-gateway.vazovski.art:80` -> HTTPS

### 7. Public CORS mismatch through LiteSpeed
- old state: public GPT Actions preflight returned `403 CORS_FORBIDDEN`
- root cause: proxied requests could arrive with duplicated comma-separated `Origin` header values
- fix: CORS middleware now normalizes and validates comma-separated origin headers safely

### 8. Production acceptance fixtures absent
- old state: canonical alias fixtures were absent in production
- fix: acceptance aliases `hero-primary` and `footer-contact` were inserted into the production alias registry

### 9. Public dry-run blocked together with live writes
- old state: disabled live writes also blocked safe dry-run acceptance flows
- fix: safe `dryRun: true` execution is now allowed while real live writes remain disabled

## Current deployment topology

```text
figma-gateway.vazovski.art
  -> A record 77.105.164.183
  -> vps183 nginx :80 redirect to HTTPS
  -> vps183 nginx stream :443 -> 10.8.0.2:443
  -> web108 LiteSpeed vhost
  -> 127.0.0.1:3100
  -> figma-gateway.service
```

## Known issues

### 1. Public path depends on multi-hop chain

**Severity:** minor

**Notes:**
- delivery depends on `vps183` + VPN + local LiteSpeed/backend chain
- monitoring should cover all hops, not only local systemd status

### 2. Acceptance fixtures are synthetic

**Severity:** minor

**Notes:**
- production acceptance currently uses canonical seeded demo aliases
- for long-term governance it is preferable to document these fixtures explicitly in README/ops docs

## Final acceptance verdict

**ACCEPTED**

Итог:
- public HTTPS gateway works
- GPT Actions / REST / dry-run / auth-security scenarios are confirmed
- automated smoke tests pass
- production deployment is stable
