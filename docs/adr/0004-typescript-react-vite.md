# 4. TypeScript, React and Vite instead of hand-written DOM code

- Status: accepted
- Date: 2026-10-29

## Context

The first version was plain JavaScript with string-built HTML and one large module of mutable state. It worked and was tested at the engine level, but the UI code was hard to extend (each new view repeated rendering and event wiring) and gave no type safety across the engine boundary.

## Decision

Port the engine to strict TypeScript with explicit domain types (`src/engine/types.ts`), and rebuild the UI in React 19 with Vite. Keep dependencies few and deliberate: `react`, `cmdk` (command palette), `lucide-react` (icons). No CSS framework: design tokens in CSS custom properties. Unit tests move to Vitest; browser tests use Playwright.

## Consequences

- Type errors across the engine/UI boundary are caught at build time. The port surfaced several implicit `null` paths, now handled explicitly.
- Views are components with local state, so new views are cheap and consistent.
- A build step is required; CI builds and deploys `dist/` to Pages.
