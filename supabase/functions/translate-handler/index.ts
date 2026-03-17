const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('nope', { status: 405, headers: CORS })

  try {
    const { table, row_id, column, value, source_locale, target_locales } = await req.json()
    const lingoApiKey = Deno.env.get('LINGO_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const translations: Record<string, string> = {}

    for (const locale of target_locales) {
      const r = await fetch(`https://engine.lingo.dev/localize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': lingoApiKey! },
        body: JSON.stringify({ sourceLocale: source_locale, targetLocale: locale, data: { v: value } }),
      })
      const d = await r.json()
      translations[locale] = d?.data?.v || value
    }

    const rows = Object.entries(translations).map(([locale, v]) => ({
      table_name: table, row_id, column_name: column, locale, value: v,
      updated_at: new Date().toISOString(),
    }))

    await fetch(`${supabaseUrl}/rest/v1/_lingo_translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey!, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})