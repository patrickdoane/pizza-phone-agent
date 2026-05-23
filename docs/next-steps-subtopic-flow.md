# Next Steps: Subtopic Targeted Edit Flow

This plan starts after merging `feat/probabilistic-reply-composer`.

## Objective

Allow callers to intentionally pivot into a specific subtopic (toppings, crust, size), update the correct pizza group, and resume normal order completion without losing context.

## Branch

- `feat/subtopic-targeted-edit-flow`

## Scope

- Add deterministic topic pivot detection for `toppings`, `crust`, `size`.
- Add deterministic target detection for grouped lines (`all`, `3 cheese`, `2 supreme`).
- Add disambiguation when target is missing/ambiguous.
- Apply edits only to selected `pizzaLines`.
- Resume with the correct next-step prompt after successful edits.

## Out of Scope

- Expanding LLM ownership of business logic.
- Pricing model changes.
- Non-pizza catalog parsing improvements beyond small deterministic alias handling.

## Implementation Checklist

1. Add `focusTopic` and `focusTarget` to session state.
2. Create `src/agent/subtopicRouter.ts` with:
   - topic detection
   - target detection
   - edit extraction for toppings/crust/size
3. Integrate router into `runAgentTurn` before unclear fallback.
4. Add mutation helpers for `pizzaLines`:
   - apply toppings add/remove
   - apply crust update
   - apply size update
5. Add precise disambiguation prompts when needed.
6. Ensure resume prompt points to missing slots after subtopic updates.
7. Add tests for:
   - ambiguous target -> disambiguation
   - targeted edits affect only selected group
   - resume prompt correctness after edits

## Validation

- `npm test`
- `npm run build`
- `npm run eval:conversations`

## Success Criteria

- No guessing when target is ambiguous.
- Group edits are precise and deterministic.
- Resume flow remains coherent after subtopic detours.
- Safety violations remain zero.
