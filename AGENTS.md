# Agent Project Rules

These rules define how coding agents should work in this repository.

## Git Branching Model

- Never commit directly to `main` after the initial bootstrap commit.
- Create a branch for each unit of work.
- Branch naming:
  - `feat/<short-description>` for features
  - `fix/<short-description>` for bug fixes
  - `chore/<short-description>` for maintenance
  - `docs/<short-description>` for documentation
- Keep branches focused to one logical change.

## Commit and PR Rules

- Make small, coherent commits with clear messages.
- Run tests before committing (`npm test`).
- Open a PR to merge into `main`; do not fast-forward from a dirty branch.
- Include a short PR summary and testing notes.

## Agent Execution Rules

- Before starting work, check branch and status:
  - `git branch --show-current`
  - `git status --short`
- If on `main`, create and switch to a new branch before code changes.
- If there are unrelated local changes, do not revert them unless explicitly requested.

## Suggested Workflow

1. `git checkout -b fix/<topic>`
2. Implement changes
3. `npm test`
4. `git add -A && git commit -m "<message>"`
5. Push and open PR
