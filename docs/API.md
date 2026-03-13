# Backend API Reference

All services are containerized with Docker. Start with `docker compose up`.

## Mint/Burn Service (:3001)

### POST /api/mint
Request a token mint operation.

```json
{
  "mintAddress": "SSS...",
  "recipient": "7xK...",
  "amount": 1000000,
  "requestId": "mint-001"
}
```

### POST /api/burn
Request a token burn operation.

```json
{
  "mintAddress": "SSS...",
  "amount": 500000,
  "requestId": "burn-001"
}
```

### GET /api/requests/:id
Get request status.

---

## Indexer Service (:3002)

### GET /api/events
Query indexed events.

| Param | Type | Description |
|-------|------|-------------|
| `mint` | string | Filter by mint address |
| `type` | string | Filter by event type |
| `limit` | number | Max results (default: 50) |

### GET /api/audit-log
Query audit trail entries.

| Param | Type | Description |
|-------|------|-------------|
| `mint` | string | Filter by mint address |
| `action` | string | Filter by action type |
| `limit` | number | Max entries (default: 20) |

---

## Compliance Service (:3003) — SSS-2

### GET /api/blacklist
List blacklisted addresses.

### POST /api/blacklist/check
Batch check addresses against blacklist.

```json
{ "addresses": ["7xK...", "3bF..."] }
```

### POST /api/sanctions/screen
Sanctions screening integration.

```json
{ "address": "7xK...", "provider": "manual" }
```

### GET /api/audit/export
Export audit trail. Supports `format=json` (default) or `format=csv`.

---

## Webhook Service (:3004) — SSS-2

### POST /api/webhooks
Register a webhook.

```json
{
  "url": "https://example.com/webhook",
  "events": ["TokensMinted", "AddressBlacklisted"],
  "mint": "SSS..."
}
```

### GET /api/webhooks
List registered webhooks.

### DELETE /api/webhooks/:id
Remove a webhook.

### POST /api/webhooks/:id/test
Send a test event.

---

## Health Check

All services expose `GET /health`:

```json
{
  "service": "sss-mint-burn",
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "uptime": 3600
}
```
