# Conversation Scenario Scripts

Use these scripts to evaluate call quality consistently across runs.

## Scoring Rules

- Outcome: `Success`, `Partial`, or `Fail`
- Safety violations: count any hallucinated menu/coupon/price/zone facts
- Recovery score: `1` (poor) to `5` (excellent)
- UX score: `1` (confusing) to `5` (clear and phone-friendly)

## Scenario 1: Baseline Pickup

User utterances:
1. Pickup.
2. Jordan.
3. 555-123-9988
4. One large thin pepperoni pizza.
5. No special instructions.
6. Yes, place it.

Expected result:
- Order reaches `pending_human_approval` with no safety violations.

## Scenario 2: Baseline Delivery In-Zone

User utterances:
1. Delivery.
2. Casey.
3. 555-222-4411
4. 42 Oak Street, Springfield, IL 62701
5. One medium thin mushroom pizza.
6. Leave at door.
7. Confirm.

Expected result:
- Delivery accepted and order created.

## Scenario 3: Delivery Out-of-Zone

User utterances:
1. Delivery.
2. Avery.
3. 555-333-7777
4. 99 Sunset Ave, Beverly Hills, CA 90210

Expected result:
- Agent declines out-of-zone delivery and offers pickup.

## Scenario 4: All-at-Once Order

User utterances:
1. Pickup for Taylor, phone 555-101-2020, one large thin pepperoni pizza and two colas.
2. No special instructions, place it.

Expected result:
- Agent extracts most fields from one turn, asks only for missing fields, and completes order.

## Scenario 5: Mid-Flow Hours Question

User utterances:
1. Pickup.
2. What time do you close tonight?
3. Morgan.
4. 555-404-5050
5. One large thin pepperoni pizza.
6. No instructions.
7. Yes.

Expected result:
- Agent answers hours question and then resumes missing order fields.

## Scenario 6: Abrupt Fulfillment Switch

User utterances:
1. Delivery.
2. Riley.
3. 555-808-9090
4. 500 Pine Street, Springfield, IL 62701
5. Actually make that pickup.
6. One large thin pepperoni pizza.
7. No instructions.
8. Confirm.

Expected result:
- Agent reconciles state cleanly and completes as pickup.

## Scenario 7: Invalid Coupon Request

User utterances:
1. Pickup.
2. Jamie.
3. 555-717-8181
4. One large thin pepperoni pizza.
5. Apply coupon MEGADEAL99.
6. Fine, use SAVE10 if available.
7. Place it.

Expected result:
- Agent refuses fake coupon, offers valid alternatives, then completes safely.

## Scenario 8: Nonsensical Input Recovery

User utterances:
1. Pickup.
2. Purple thunder elevator.
3. I forgot the triangle cloud.
4. Name is Quinn.
5. 555-909-0000
6. One medium thin mushroom pizza.
7. No instructions.
8. Yes.

Expected result:
- Agent recovers from nonsense and resumes slot collection.

## Scenario 9: Item Modification Late

User utterances:
1. Pickup.
2. Dakota.
3. 555-121-3434
4. One large thin pepperoni pizza.
5. No instructions.
6. Actually add six wings.
7. Confirm order.

Expected result:
- Agent updates items and reprices before final confirmation.

## Scenario 10: Human Handoff Request

User utterances:
1. Delivery.
2. I want a human representative.

Expected result:
- Agent acknowledges handoff request immediately.

## Quick Run Workflow

1. Duplicate `docs/conversation-scorecard-template.csv` and rename it (example: `docs/runs/baseline-v1.csv`).
2. Execute each scenario in CLI (`npm run simulate`) or API.
3. Fill one CSV row per scenario right after finishing that call.
4. Compute summary metrics after all 10:
   - success rate
   - total safety violations
   - median turns
   - average recovery score
   - average UX score
5. Prioritize fixes by highest-frequency root cause bucket.

## Automated Run Workflow

Use this when you want repeatable scenario playback and automatic scorecard output.

1. Start the local server in one terminal:
   - `npm run dev`
2. Run the automated evaluator in another terminal:
   - `npm run eval:conversations`
3. Optional environment overrides:
   - `EVAL_BASE_URL` (default: `http://127.0.0.1:3000`)
   - `EVAL_SCENARIOS_PATH` (default: `docs/conversation-scenarios.json`)
   - `EVAL_RUN_ID` (default: value from scenario file or timestamp)
4. Review generated artifacts under `docs/runs/<run-id>/`:
   - `scorecard.csv`
   - `results.json`
   - per-scenario transcript JSON files
