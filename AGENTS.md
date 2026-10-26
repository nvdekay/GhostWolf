# Repository Guidelines

## Project Structure & Module Organization

Ghostwolf is a React 19 and TypeScript application built with Vite. Feature screens and their styles live in `src/features/<feature>/`; reusable UI, application providers, utilities, backend clients, and shared types live under `src/components`, `src/app`, `src/lib`, `src/services`, and `src/types`. Static assets belong in `public/`, while bundled fonts are under `src/app/fonts/`.

Supabase schema and RLS changes belong in `supabase/migrations/`. Edge Functions live in `supabase/functions/`; the framework-independent game engine is in `supabase/functions/_shared/engine` and is shared through the `@engine` alias. Tests are separated into `tests/unit`, `tests/integration`, and `tests/e2e`. Consult `docs/ruleset.md` before changing game behavior.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm run dev`: start Vite at `http://localhost:5173`.
- `npm run build`: type-check and build production files into `dist/`.
- `npm run typecheck`, `npm run lint`, `npm run format`: validate types, run ESLint, and apply Prettier.
- `npm test`: run unit tests once with Vitest.
- `npm run db:start` and `npm run functions:serve`: start local Supabase and the Edge Function; both are prerequisites for integration tests.
- `npm run test:integration`: test database policies, RPCs, realtime, and game lifecycle.
- `npm run test:e2e`: run single-worker Playwright scenarios; Vite starts automatically.

Copy `.env.example` to `.env.local` and use local Supabase values. Never commit secrets or generated `dist/` output.

## Coding Style & Naming Conventions

Use two-space indentation, UTF-8, LF endings, and a final newline. Prettier enforces no semicolons, single quotes, and a 100-character print width; ESLint applies TypeScript, React Hooks, and Vite refresh rules. Name React components and their files in PascalCase (`BoardScreen.tsx`), hooks with `use...`, and utilities/services in camelCase. Keep feature-specific CSS beside its feature.

## Testing Guidelines

Use Vitest `*.test.ts` files for unit and integration coverage and Playwright `*.spec.ts` files for browser flows. Add engine regressions to `tests/unit`; use integration tests for Supabase authorization, transactions, and realtime. E2E tests should cover only critical multi-device behavior. Run typecheck, lint, and the relevant test suites before submitting.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit pattern: `feat:`, `fix:`, `test:`, `docs:`, or scoped forms such as `feat(engine):`. Keep commits focused and messages imperative. Pull requests should explain user-visible behavior, identify schema or environment changes, link relevant issues, list verification commands, and include screenshots for UI changes.
