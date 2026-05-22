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

## Automated Review Workflow

- Keep PRs small and focused so automated comments stay high-signal.
- Treat automated review as first-pass feedback:
  - fix clear correctness and safety issues directly
  - add a short PR reply when intentionally keeping current behavior
  - track any deferred fixes as follow-up items
- Include evidence in PRs for behavior changes:
  - `npm test` result
  - `npm run eval:conversations` summary when conversation logic changes
- Follow the PR quality checklist in `.github/pull_request_template.md` for every PR.

## Public Scorecard Page

- This repo includes a minimal public dashboard for conversation-eval trends.
- The page reads `public/metrics.json` and charts:
  - success rate
  - median turns
  - safety violations
- Generate metrics from local run outputs:

```bash
npm run eval:metrics
```

- `public/metrics.json` is the canonical published trend history. Commit it after local eval runs.

- Local eval workflow:

```bash
npm run dev
npm run eval:conversations
npm run eval:metrics
```

- The `Deploy Scorecard Page` GitHub Actions workflow publishes `public/` to GitHub Pages on pushes to `main`.
- CI does not regenerate metrics from `docs/runs/`; this avoids silent history resets in clean checkouts.
