# pizza-phone-agent

Local-first TypeScript/Node prototype for an inbound pizza-ordering AI agent.

## MVP Guarantees

- AI discloses itself in greeting.
- LLM only handles conversation and intent.
- Deterministic code handles menu validation, pricing, tax, coupons, and delivery zone checks.
- No payment-card handling.
- No direct POS integration.
- Completed orders are saved as `pending_human_approval`.
- Human handoff is available.

## Stack

- Node.js + TypeScript
- Fastify API
- Zod schemas
- SQLite (`better-sqlite3`)
- Ollama-compatible LLM client (default `qwen3:14b`)

## Setup

```bash
cp .env.example .env
npm install
```

## Run API

```bash
npm run dev
```

Endpoints:

- `GET /health`
- `GET /menu`
- `POST /sessions`
- `POST /sessions/:id/message`
- `POST /orders/:id/approve`
- `POST /orders/:id/reject`

## Run CLI Simulation

```bash
npm run simulate
```

Starts with:

"Thanks for calling. I’m an AI assistant that can help take your order. Would you like pickup or delivery?"

Type `exit` to quit.

## Test

```bash
npm test
```

Includes tests for:

- invalid toppings
- invalid coupons
- delivery outside zone
- order total calculation
- pending order creation
- agent refusing non-existent coupon invention
