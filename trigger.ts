// ============================================
// supabase-lingo — Trigger Manager
// Creates Postgres triggers that fire Edge Functions
// when translatable content is inserted/updated
// ============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { TranslatableColumn } from './types';

const TRIGGER_PREFIX = 'lingo_translate_';

/**
 * Creates the _lingo_translations shadow table
 * This is where all translations are stored.
 * Original tables are NEVER modified.
 */
export const CREATE_TRANSLATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _lingo_translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  column_name TEXT NOT NULL,
  locale      TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT _lingo_translations_unique 
    UNIQUE(table_name, row_id, column_name, locale)
);

CREATE INDEX IF NOT EXISTS idx_lingo_table_row 
  ON _lingo_translations(table_name, row_id);

CREATE INDEX IF NOT EXISTS idx_lingo_locale 
  ON _lingo_translations(locale);
`;

/**
 * Creates the helper RPC functions used by the detector
 */
export const CREATE_HELPER_FUNCTIONS_SQL = `
CREATE OR REPLACE FUNCTION lingo_detect_translatable_columns()
RETURNS TABLE(table_schema TEXT, table_name TEXT, column_name TEXT, description TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    c.table_schema::TEXT,
    c.table_name::TEXT,
    c.column_name::TEXT,
    pgd.description::TEXT
  FROM
    information_schema.columns c
    JOIN pg_class pgc ON pgc.relname = c.table_name
    JOIN pg_description pgd ON pgd.objoid = pgc.oid
      AND pgd.objsubid = c.ordinal_position
  WHERE
    c.table_schema = 'public'
    AND pgd.description LIKE '%@translatable%'
  ORDER BY
    c.table_name, c.column_name;
$$;
`;

/**
 * Generates the trigger function SQL for a given table and its translatable columns
 */
export function generateTriggerFunctionSQL(
  table: string,
  columns: string[],
  edgeFunctionUrl: string,
  sourceLocale: string,
  targetLocales: string[]
): string {
  const columnsJson = JSON.stringify(columns);
  const targetLocalesJson = JSON.stringify(targetLocales);

  return `
CREATE OR REPLACE FUNCTION ${TRIGGER_PREFIX}${table}_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col_name TEXT;
  col_value TEXT;
  payload JSON;
BEGIN
  FOREACH col_name IN ARRAY ARRAY[${columns.map(c => `'${c}'`).join(', ')}]
  LOOP
    col_value := NEW::JSON->>col_name;
    
    IF col_value IS NOT NULL AND col_value != '' THEN
      payload := json_build_object(
        'table', TG_TABLE_NAME,
        'row_id', NEW.id::TEXT,
        'column', col_name,
        'value', col_value,
        'source_locale', '${sourceLocale}',
        'target_locales', '${targetLocalesJson}'::JSON
      );

      PERFORM net.http_post(
        url := '${edgeFunctionUrl}/translate-handler',
        headers := '{"Content-Type": "application/json"}'::JSONB,
        body := payload::TEXT
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ${TRIGGER_PREFIX}${table} ON ${table};

CREATE TRIGGER ${TRIGGER_PREFIX}${table}
  AFTER INSERT OR UPDATE ON ${table}
  FOR EACH ROW
  EXECUTE FUNCTION ${TRIGGER_PREFIX}${table}_fn();
`;
}

/**
 * Generates SQL to remove all supabase-lingo triggers from a table
 */
export function generateTeardownSQL(tables: string[]): string {
  return tables.map(table => `
DROP TRIGGER IF EXISTS ${TRIGGER_PREFIX}${table} ON ${table};
DROP FUNCTION IF EXISTS ${TRIGGER_PREFIX}${table}_fn();
  `).join('\n') + `
DROP TABLE IF EXISTS _lingo_translations;
DROP FUNCTION IF EXISTS lingo_detect_translatable_columns();
  `;
}

/**
 * Groups columns by table for trigger creation
 */
export function groupColumnsByTable(
  columns: TranslatableColumn[]
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  
  for (const col of columns) {
    if (!grouped.has(col.table)) {
      grouped.set(col.table, []);
    }
    grouped.get(col.table)!.push(col.column);
  }
  
  return grouped;
}
