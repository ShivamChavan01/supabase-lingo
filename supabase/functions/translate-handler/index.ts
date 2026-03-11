import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { table, row_id, column, value, source_locale, target_locales } = await req.json();

    if (!table || !row_id || !column || !value) {
      throw new Error('Missing required fields: table, row_id, column, value');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lingoApiKey = Deno.env.get('LINGO_API_KEY')!;

    if (!supabaseUrl || !supabaseKey || !lingoApiKey) {
      throw new Error('Missing environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const translations: Record<string, string> = {};

    for (const locale of target_locales) {
      const cmd = new Deno.Command('npx', {
        args: [
          'lingo.dev@latest',
          'i18n',
          'translate',
          '--source', source_locale,
          '--target', locale,
          '--text', value,
        ],
        env: { LINGO_API_KEY: lingoApiKey },
      });

      const { code, stdout, stderr } = await cmd.output();

      if (code === 0) {
        const result = new TextDecoder().decode(stdout).trim();
        translations[locale] = result;
      } else {
        console.error('Lingo translation error:', new TextDecoder().decode(stderr));
        translations[locale] = value;
      }
    }

    const upsertData = Object.entries(translations).map(([locale, translatedValue]) => ({
      table_name: table,
      row_id: String(row_id),
      column_name: column,
      locale,
      value: translatedValue,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('_lingo_translations')
      .upsert(upsertData, {
        onConflict: 'table_name,row_id,column_name,locale',
      });

    if (upsertError) {
      throw new Error(`Failed to save translations: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, translations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
