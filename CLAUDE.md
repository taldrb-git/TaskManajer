# Task manager: working rules

Personal task app (React + Vite + TS PWA, local-first, optional Supabase sync). Hebrew RTL UI.
Code overview: docs/architecture.md.

## Documentation is mandatory (user requirement)

Every change to the system must update the documentation in the same piece of work. A change is not done until its docs are updated:

- **CHANGELOG.md**: add an entry for every change (Added / Changed / Fixed / Removed), under a new version + date or an "Unreleased" section.
- **docs/user-guide.md**: any user-visible behaviour (screens, shortcuts, settings, data handling).
- **docs/setup-and-deploy.md**: commands, env vars, dependencies, Supabase/hosting setup, troubleshooting.
- **docs/architecture.md**: files/modules, data model, sync logic, design decisions and known limitations.
- **supabase/schema.sql**: schema changes must be idempotent and noted in the changelog (users re-run it manually).
- **README.md**: only when the doc index or the quick start changes.

All docs are written in Hebrew for the owner. When finishing a task, tell the user which docs were updated.

## Conventions

- Verify with `npm run build` (type-check + build) before reporting done.
- Free services only (GitHub Pages, Supabase Free tier).
- All persistence goes through `src/store.ts` (`commit()` → localStorage + dirty queue + sync). Use soft delete (`deleted = true`), never hard delete.
