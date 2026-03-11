// ============================================
// supabase-lingo — Edge Function
// Deployed to Supabase, called by Postgres trigger
// Receives row data, calls Lingo.dev, saves translations
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRANSLATIONS_TABLE = '_lingo_translations';

interface TriggerPayload {
  table: string;
  row_id: string;
  column: string;
  value: string;
  source_locale: string;
  target_locales: string[];
}

Deno.serve(async (req: Request) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', service: 'supabase-lingo' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload: TriggerPayload = await req.json();
    const { table, row_id, column, value, source_locale, target_locales } = payload;

    if (!value || value.trim() === '') {
      return new Response(JSON.stringify({ skipped: true, reason: 'empty value' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const lingoApiKey = Deno.env.get('LINGO_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!lingoApiKey) {
      throw new Error('LINGO_API_KEY environment variable not set');
    }

    // Call Lingo.dev API for translation
    const translations = await translateWithLingo(
      value,
      source_locale,
      target_locales,
      lingoApiKey
    );

    // Save translations to Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    const upsertData = Object.entries(translations).map(([locale, translatedValue]) => ({
      table_name: table,
      row_id,
      column_name: column,
      locale,
      value: translatedValue,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from(TRANSLATIONS_TABLE)
      .upsert(upsertData, {
        onConflict: 'table_name,row_id,column_name,locale',
      });

    if (error) {
      throw new Error(`Failed to save translations: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        table,
        row_id,
        column,
        locales: Object.keys(translations),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('supabase-lingo edge function error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Calls Lingo.dev SDK for translation
 * Uses their REST API directly from the Edge Function
 */
async function translateWithLingo(
  text: string,
  sourceLocale: string,
  targetLocales: string[],
  apiKey: string
): Promise<Record<string, string>> {

  const results: Record<string, string> = {};

  // Call Lingo.dev translation API for each locale
  // Batched for efficiency
  const promises = targetLocales.map(async (locale) => {
    try {
      const response = await fetch('https://api.lingo.dev/v1/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          source_locale: sourceLocale,
          target_locale: locale,
          content: { value: text },
        }),
      });

      if (!response.ok) {
        console.warn(`Lingo.dev translation failed for ${locale}: ${response.status}`);
        results[locale] = text; // fallback to source
        return;
      }

      const data = await response.json();
      results[locale] = data?.content?.value || text;

    } catch (err) {
      console.warn(`Translation error for ${locale}:`, err);
      results[locale] = text; // fallback to source
    }
  });

  await Promise.all(promises);
  return results;
}
