// ============================================
// supabase-lingo — Translation Engine
// Calls Lingo.dev CLI to translate content
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execa } from 'execa';
import { TranslationResult } from './types';

/**
 * Translates a single string into multiple locales using Lingo.dev CLI.
 * 
 * Strategy:
 * 1. Write source string to a temp JSON file in Lingo.dev format
 * 2. Run `npx lingo.dev@latest i18n` against the temp file
 * 3. Read the translated output files
 * 4. Return as TranslationResult map
 */
export async function translateViaLingo(
  text: string,
  sourceLocale: string,
  targetLocales: string[],
  lingoApiKey: string
): Promise<TranslationResult> {

  // Create a temp directory for this translation job
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-lingo-'));

  try {
    // Create the source locale file
    const sourceFile = path.join(tmpDir, `${sourceLocale}.json`);
    fs.writeFileSync(sourceFile, JSON.stringify({ value: text }, null, 2));

    // Create i18n.json config for Lingo.dev
    const i18nConfig = {
      $schema: 'https://lingo.dev/schema/i18n.json',
      version: '1.10',
      locale: {
        source: sourceLocale,
        targets: targetLocales,
      },
      buckets: {
        json: {
          include: [`${tmpDir}/[locale].json`],
        },
      },
    };

    const configFile = path.join(tmpDir, 'i18n.json');
    fs.writeFileSync(configFile, JSON.stringify(i18nConfig, null, 2));

    // Run Lingo.dev CLI
    await execa('npx', ['lingo.dev@latest', 'i18n', '--config', configFile], {
      env: {
        ...process.env,
        LINGO_API_KEY: lingoApiKey,
      },
      cwd: tmpDir,
    });

    // Read translated files
    const results: TranslationResult = {};

    for (const locale of targetLocales) {
      const translatedFile = path.join(tmpDir, `${locale}.json`);
      
      if (fs.existsSync(translatedFile)) {
        const content = JSON.parse(fs.readFileSync(translatedFile, 'utf-8'));
        results[locale] = content.value || text;
      } else {
        // Fallback to source if translation failed
        results[locale] = text;
      }
    }

    return results;

  } finally {
    // Always cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Batch translate multiple strings at once (more efficient)
 * Groups them into a single Lingo.dev job
 */
export async function batchTranslateViaLingo(
  items: Array<{ key: string; value: string }>,
  sourceLocale: string,
  targetLocales: string[],
  lingoApiKey: string
): Promise<{ [key: string]: TranslationResult }> {

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-lingo-batch-'));

  try {
    // Build source JSON with all items
    const sourceObj: Record<string, string> = {};
    for (const item of items) {
      sourceObj[item.key] = item.value;
    }

    const sourceFile = path.join(tmpDir, `${sourceLocale}.json`);
    fs.writeFileSync(sourceFile, JSON.stringify(sourceObj, null, 2));

    const i18nConfig = {
      $schema: 'https://lingo.dev/schema/i18n.json',
      version: '1.10',
      locale: {
        source: sourceLocale,
        targets: targetLocales,
      },
      buckets: {
        json: {
          include: [`${tmpDir}/[locale].json`],
        },
      },
    };

    const configFile = path.join(tmpDir, 'i18n.json');
    fs.writeFileSync(configFile, JSON.stringify(i18nConfig, null, 2));

    await execa('npx', ['lingo.dev@latest', 'i18n', '--config', configFile], {
      env: {
        ...process.env,
        LINGO_API_KEY: lingoApiKey,
      },
      cwd: tmpDir,
    });

    // Build results map
    const results: { [key: string]: TranslationResult } = {};

    for (const item of items) {
      results[item.key] = {};
    }

    for (const locale of targetLocales) {
      const translatedFile = path.join(tmpDir, `${locale}.json`);

      if (fs.existsSync(translatedFile)) {
        const content = JSON.parse(fs.readFileSync(translatedFile, 'utf-8'));
        
        for (const item of items) {
          results[item.key][locale] = content[item.key] || item.value;
        }
      }
    }

    return results;

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
