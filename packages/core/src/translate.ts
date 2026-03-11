import { LingoDotDevEngine } from 'lingo.dev/sdk';
import { TranslationResult } from './types';

export async function translateViaLingo(
  text: string,
  sourceLocale: string,
  targetLocales: string[],
  lingoApiKey: string
): Promise<TranslationResult> {
  const engine = new LingoDotDevEngine({ apiKey: lingoApiKey });
  const results: TranslationResult = {};

  await Promise.all(
    targetLocales.map(async (locale) => {
      try {
        const translated = await engine.localizeText(text, {
          sourceLocale,
          targetLocale: locale,
        });
        results[locale] = translated || text;
      } catch {
        results[locale] = text;
      }
    })
  );

  return results;
}

export async function batchTranslateViaLingo(
  items: Array<{ key: string; value: string }>,
  sourceLocale: string,
  targetLocales: string[],
  lingoApiKey: string
): Promise<{ [key: string]: TranslationResult }> {
  const engine = new LingoDotDevEngine({ apiKey: lingoApiKey });

  const sourceObj: Record<string, string> = {};
  for (const item of items) {
    sourceObj[item.key] = item.value;
  }

  const results: { [key: string]: TranslationResult } = {};
  for (const item of items) {
    results[item.key] = {};
  }

  await Promise.all(
    targetLocales.map(async (locale) => {
      try {
        const translated = await engine.localizeObject(sourceObj, {
          sourceLocale,
          targetLocale: locale,
        });

        for (const item of items) {
          results[item.key][locale] = (translated as Record<string, string>)[item.key] || item.value;
        }
      } catch {
        for (const item of items) {
          results[item.key][locale] = item.value;
        }
      }
    })
  );

  return results;
}