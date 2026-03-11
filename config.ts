// ============================================
// supabase-lingo — Config Loader
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { LingoConfig, DEFAULT_LOCALES } from './types';

dotenv.config();

export function defineConfig(config: LingoConfig): LingoConfig {
  return config;
}

export function loadConfig(cwd: string = process.cwd()): LingoConfig {
  // Try loading supabase-lingo.config.ts or .js
  const configPaths = [
    path.join(cwd, 'supabase-lingo.config.ts'),
    path.join(cwd, 'supabase-lingo.config.js'),
    path.join(cwd, 'supabase-lingo.config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      if (configPath.endsWith('.json')) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
      }
      // For .ts/.js we rely on env vars as fallback
    }
  }

  // Fallback: build config from environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const lingoApiKey = process.env.LINGO_API_KEY;

  if (!supabaseUrl || !supabaseKey || !lingoApiKey) {
    throw new Error(
      `Missing configuration. Either create supabase-lingo.config.ts or set env vars:\n` +
      `  SUPABASE_URL\n` +
      `  SUPABASE_SERVICE_KEY\n` +
      `  LINGO_API_KEY\n`
    );
  }

  const localesRaw = process.env.LINGO_LOCALES;
  const locales = localesRaw
    ? localesRaw.split(',').map(l => l.trim())
    : DEFAULT_LOCALES;

  return {
    supabaseUrl,
    supabaseKey,
    lingoApiKey,
    sourceLocale: process.env.LINGO_SOURCE_LOCALE || 'en',
    locales,
    batchSize: parseInt(process.env.LINGO_BATCH_SIZE || '10', 10),
  };
}

export function validateConfig(config: LingoConfig): void {
  if (!config.supabaseUrl) throw new Error('supabaseUrl is required');
  if (!config.supabaseKey) throw new Error('supabaseKey is required');
  if (!config.lingoApiKey) throw new Error('lingoApiKey is required');
  if (!config.locales || config.locales.length === 0) {
    throw new Error('At least one target locale is required');
  }
  if (config.locales.includes(config.sourceLocale)) {
    throw new Error('sourceLocale should not be in target locales list');
  }
}
