const TRANSLATIONS_TABLE = '_lingo_translations'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    const { table, row_id, column, value, source_locale, target_locales } = await req.json()

    if (!value?.trim()) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const lingoApiKey = Deno.env.get('LINGO_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!lingoApiKey) throw new Error('LINGO_API_KEY not set')

    const translations: Record<string, string> = {}

    // Translate to each locale sequentially to avoid timeout
    for (const locale of target_locales) {
      try {
        const res = await fetch(`https://api.lingo.dev/v1/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lingoApiKey}`,
          },
          body: JSON.stringify({
            source_locale,
            target_locale: locale,
            text: value,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          translations[locale] = data?.translation || data?.text || value
        } else {
          translations[locale] = value
        }
      } catch {
        translations[locale] = value
      }
    }

    // Save to Supabase
    const upsertData = Object.entries(translations).map(([locale, translatedValue]) => ({
      table_name: table,
      row_id,
      column_name: column,
      locale,
      value: translatedValue,
      updated_at: new Date().toISOString(),
    }))

    await fetch(`${supabaseUrl}/rest/v1/${TRANSLATIONS_TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(upsertData),
    })

    return new Response(
      JSON.stringify({ success: true, locales: Object.keys(translations) }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})