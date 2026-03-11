# AGENTS.md — supabase-lingo

This file is for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex).
Read this before touching any file in this repo.

---

## What This Project Does

`supabase-lingo` is an npm package that auto-translates Supabase database content
in real-time using Lingo.dev CLI. Developers mark DB columns with `@translatable`
comment, and the package handles everything else — triggers, edge functions,
translation, and storage.

---

## Project Structure

```
supabase-lingo/
├── packages/
│   └── core/                        ← The actual npm package
│       ├── src/
│       │   ├── cli.ts               ← CLI entrypoint (npx supabase-lingo)
│       │   ├── detect.ts            ← Scans DB for @translatable columns
│       │   ├── trigger.ts           ← Creates/removes Postgres triggers
│       │   ├── translate.ts         ← Calls Lingo.dev CLI for translation
│       │   ├── query.ts             ← Query helper SDK for devs
│       │   ├── config.ts            ← Config loader (supabase-lingo.config.ts)
│       │   └── types.ts             ← Shared TypeScript types
│       ├── package.json
│       └── tsconfig.json
├── supabase/
│   └── functions/
│       └── translate-handler/
│           └── index.ts             ← Supabase Edge Function
├── apps/
│   └── demo/                        ← Demo Next.js app (storefront)
│       ├── src/app/
│       └── supabase-lingo.config.ts
├── AGENTS.md                        ← You are here
├── README.md
└── package.json
```

---

## Core Concepts

### 1. @translatable Column Marker
Columns are marked via Postgres column comments:
```sql
COMMENT ON COLUMN products.name IS '@translatable';
```
`detect.ts` queries `information_schema.columns` joined with `pg_description`
to find these. Never use any other mechanism for detection.

### 2. Shadow Translations Table
NEVER modify original tables. All translations go into `_lingo_translations`:
```sql
CREATE TABLE _lingo_translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  column_name TEXT NOT NULL,
  locale      TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_name, row_id, column_name, locale)
);
```

### 3. Postgres Trigger → Edge Function Flow
```
INSERT/UPDATE on watched table
    → Trigger fires
    → Calls Supabase Edge Function via pg_net
    → Edge Function calls Lingo.dev CLI
    → Writes to _lingo_translations
```

### 4. Lingo.dev Integration
- Use `lingo.dev` CLI for translation via child_process exec
- Config lives in `i18n.json` at project root
- Always use `npx lingo.dev@latest i18n` command
- Never call OpenAI/Anthropic directly — always go through Lingo.dev

---

## Rules For AI Agents

### NEVER do this:
- Modify any original user table schema
- Drop or alter existing columns
- Use Google Translate, DeepL, or OpenAI directly
- Store translations in the original table
- Use `any` type in TypeScript
- Hardcode API keys anywhere

### ALWAYS do this:
- Use Lingo.dev CLI as the translation engine
- Store translations only in `_lingo_translations`
- Validate Supabase connection before any operation
- Show clear progress indicators in CLI output
- Handle errors gracefully with helpful messages
- Use TypeScript strict mode

---

## Key Files To Understand First

Before editing anything, read these in order:
1. `packages/core/src/types.ts` — understand all data shapes
2. `packages/core/src/config.ts` — understand configuration
3. `packages/core/src/detect.ts` — understand column detection
4. `packages/core/src/cli.ts` — understand command flow

---

## Environment Variables Required

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...     # service_role key, NOT anon key
LINGO_API_KEY=lingo_...
```

---

## Commands Reference

```bash
npx supabase-lingo init          # Full setup wizard
npx supabase-lingo scan          # List @translatable columns
npx supabase-lingo translate     # Manually trigger translation
npx supabase-lingo status        # Check translation coverage
npx supabase-lingo teardown      # Remove all supabase-lingo artifacts
```

---

## Translation Flow In Detail

```typescript
// 1. detect.ts finds columns
const columns = await detectTranslatableColumns(supabase);
// Returns: [{ table: 'products', column: 'name' }, ...]

// 2. trigger.ts creates postgres trigger
await createTrigger(supabase, 'products', columns);
// Creates: after_products_insert_lingo trigger

// 3. Edge Function receives payload
// { table: 'products', row_id: '123', column: 'name', value: 'Running Shoes' }

// 4. translate.ts calls Lingo.dev
await translateViaLingo(value, sourceLocale, targetLocales);
// Returns: { ja: 'ランニングシューズ', de: 'Laufschuhe', ... }

// 5. Results saved to _lingo_translations
```

---

## Demo App Context

The `apps/demo` is a Next.js 14 App Router storefront selling products.
It uses `supabase-lingo` to show products in the user's locale.
It should use Lingo.dev Compiler for UI strings AND supabase-lingo for DB content.
This demonstrates the full multilingual stack working together.

---

## Current Status

- [ ] packages/core/src/types.ts
- [ ] packages/core/src/config.ts
- [ ] packages/core/src/detect.ts
- [ ] packages/core/src/trigger.ts
- [ ] packages/core/src/translate.ts
- [ ] packages/core/src/query.ts
- [ ] packages/core/src/cli.ts
- [ ] supabase/functions/translate-handler/index.ts
- [ ] apps/demo (Next.js storefront)

---

## Lingo.dev Hackathon Context

This project was built for Lingo.dev Multilingual Hackathon #3.
Judging criteria:
- Execution & effort (40 pts)
- Presentation & socials (20 pts)
- Originality & real-world utility (40 pts)

Every design decision should maximize these scores.
The core insight: Lingo.dev covers UI translation. Nobody covers DB content translation.
supabase-lingo fills that gap using Lingo.dev as the engine.
