# supabase-lingo 🌍

[![npm version](https://img.shields.io/npm/v/supabase-lingo.svg)](https://www.npmjs.com/package/supabase-lingo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Lingo.dev](https://img.shields.io/badge/Powered%20by-Lingo.dev-blue)](https://lingo.dev)
[![Supabase](https://img.shields.io/badge/Built%20for-Supabase-green)](https://supabase.com)

> **Auto-translate your Supabase database content in real-time using Lingo.dev. Mark any column as `@translatable` — the rest is automatic.**

---

## The Problem

Your app is perfectly translated. UI is in Japanese. But your **database content** — product names, descriptions, blog posts, categories — is still English.

```
Japanese user opens your "translated" app:

Product Name → "Running Shoes Pro Max"     ← still English
Description  → "Best shoes for marathon"   ← still English  
Category     → "Sports & Outdoors"         ← still English
```

**Every e-commerce app, marketplace, and content platform has this problem. Until now.**

---

## The Solution

```bash
npx supabase-lingo init
```

That's it. Mark your columns. Everything else is automatic.

```sql
-- Mark any column as translatable
COMMENT ON COLUMN products.name IS '@translatable';
COMMENT ON COLUMN products.description IS '@translatable';
```

Now when you insert a row:

```sql
INSERT INTO products (name, description) 
VALUES ('Running Shoes', 'Best shoes for marathon');
```

`supabase-lingo` automatically:

1. 🔍 Detects the new row
2. 🌍 Calls Lingo.dev to translate into 10 languages
3. 💾 Saves all translations instantly
4. ✅ Your app serves the right language to every user

---

## How It Works

```
You insert English data
        ↓
Supabase Postgres Trigger fires
        ↓
Supabase Edge Function runs
        ↓
Lingo.dev CLI translates to 10 languages
        ↓
Translations saved to shadow table
        ↓
Your app queries the right language
```

**Your original data is never touched. Always safe. Always the source of truth.**

---

## Installation

```bash
npm install supabase-lingo
```

### 1. Initialize

```bash
npx supabase-lingo init
```

This will:
- Scan your Supabase DB for `@translatable` columns
- Auto-create a `translations` shadow table
- Deploy a Supabase Edge Function
- Set up Postgres triggers on your tables
- Configure Lingo.dev CLI as the translation engine

### 2. Mark Your Columns

```sql
COMMENT ON COLUMN products.name IS '@translatable';
COMMENT ON COLUMN products.description IS '@translatable';
COMMENT ON COLUMN blog_posts.content IS '@translatable';
```

### 3. Configure

Create `supabase-lingo.config.ts` in your project root:

```typescript
import { defineConfig } from 'supabase-lingo';

export default defineConfig({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  lingoApiKey: process.env.LINGO_API_KEY!,
  locales: ['ja', 'ar', 'hi', 'de', 'fr', 'es', 'zh', 'ko', 'pt', 'ru'],
  sourceLocale: 'en',
});
```

### 4. Query Translations

Use our query helper to get content in any language:

```typescript
import { createLingoClient } from 'supabase-lingo';

const lingo = createLingoClient(supabase);

// Get products in Japanese
const products = await lingo
  .from('products')
  .select('*')
  .locale('ja');

// Returns:
// { name: 'ランニングシューズ', description: 'マラソンに最適なシューズ' }
```

---

## What Gets Created

### Shadow Translations Table (auto-created)

```sql
CREATE TABLE _lingo_translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  column_name TEXT NOT NULL,
  locale      TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Your original tables are never modified.**

---

## Real-World Example

### Before `supabase-lingo`

```
🇯🇵 Japanese user sees:
  Product: "Wireless Headphones"
  Price: "$99"
  Description: "Crystal clear sound quality"
```

### After `supabase-lingo`

```
🇯🇵 Japanese user sees:
  Product: "ワイヤレスヘッドフォン"
  Price: "$99"
  Description: "クリスタルクリアな音質"
```

---

## Supported Lingo.dev Tools

| Tool | Used For |
|---|---|
| **Lingo.dev CLI** | Core translation engine |
| **Lingo.dev CI/CD** | Re-translate on content updates |
| **i18n.json config** | Locale configuration |

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Your Application              │
│                                         │
│  INSERT INTO products (name, desc)      │
│         VALUES ('Shoes', 'Great')       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         Postgres Trigger                │
│      (auto-created by supabase-lingo)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Supabase Edge Function             │
│   supabase-lingo/translate-handler      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│           Lingo.dev CLI                 │
│   Translates to 10 languages via AI    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│       _lingo_translations table         │
│  ja: ランニングシューズ                    │
│  ar: أحذية الجري                        │
│  hi: रनिंग शूज़                          │
│  de: Laufschuhe                         │
│  ... 6 more locales                     │
└─────────────────────────────────────────┘
```

---

## CLI Commands

```bash
# Initialize supabase-lingo in your project
npx supabase-lingo init

# Scan and list all @translatable columns
npx supabase-lingo scan

# Manually trigger translation for a table
npx supabase-lingo translate --table products

# Check translation status
npx supabase-lingo status

# Remove supabase-lingo from your project
npx supabase-lingo teardown
```

---

## Why Lingo.dev?

Unlike Google Translate or DeepL, **Lingo.dev understands context**. It knows the difference between translating a product name vs a full blog post. It preserves formatting, handles pluralization, and produces translations that feel native — not robotic.

---

## Demo

> 🎬 Demo video coming soon

---

## Built With

- [Lingo.dev CLI](https://lingo.dev) — AI translation engine
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) — Serverless translation handler
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) — Live trigger system
- [TypeScript](https://www.typescriptlang.org/) — Type-safe SDK

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT © [Shivam Chavan](https://github.com/ShivamChavan01)

---

<p align="center">
  Built for the <a href="https://lingo.dev">Lingo.dev</a> Multilingual Hackathon #3 🏆
</p>