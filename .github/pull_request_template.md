## Summary

-

## Testing

-

## PR Quality Checklist

- [ ] Scope is focused to one logical change.
- [ ] Branch follows naming convention (`feat/*`, `fix/*`, `chore/*`, `docs/*`).
- [ ] Deterministic boundaries are preserved (no menu/pricing/coupon/zone hallucinations).
- [ ] New or changed behavior has test coverage or a clear rationale if not added.
- [ ] `npm test` passes locally.
- [ ] For conversation logic changes, `npm run eval:conversations` was run and results were reviewed.
- [ ] Automated review comments were triaged (fixed, explained, or tracked as follow-up).
