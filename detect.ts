// ============================================
// supabase-lingo — Column Detector
// Finds all columns marked with @translatable
// ============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { TranslatableColumn, ScanResult, MARKER } from './types';

/**
 * Queries Postgres system tables to find all columns
 * that have been marked with @translatable in their comment.
 *
 * Developers mark columns like this:
 *   COMMENT ON COLUMN products.name IS '@translatable';
 */
export async function detectTranslatableColumns(
  supabase: SupabaseClient
): Promise<ScanResult> {

  // Query pg_description joined with information_schema to find @translatable columns
  const { data, error } = await supabase.rpc('lingo_detect_translatable_columns');

  if (error) {
    // RPC might not exist yet — fall back to raw SQL
    return await detectViaRawQuery(supabase);
  }

  const columns: TranslatableColumn[] = (data || []).map((row: any) => ({
    table: row.table_name,
    column: row.column_name,
    schema: row.table_schema || 'public',
  }));

  return {
    columns,
    totalTables: new Set(columns.map(c => c.table)).size,
    totalColumns: columns.length,
  };
}

/**
 * Fallback: direct SQL query when RPC doesn't exist yet
 */
async function detectViaRawQuery(
  supabase: SupabaseClient
): Promise<ScanResult> {

  const query = `
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      pgd.description
    FROM
      information_schema.columns c
      JOIN pg_class pgc ON pgc.relname = c.table_name
      JOIN pg_description pgd ON pgd.objoid = pgc.oid
        AND pgd.objsubid = c.ordinal_position
    WHERE
      c.table_schema = 'public'
      AND pgd.description LIKE '%${MARKER}%'
    ORDER BY
      c.table_name, c.column_name;
  `;

  const { data, error } = await supabase.rpc('lingo_raw_query', { sql: query });

  if (error) {
    throw new Error(
      `Could not detect @translatable columns.\n` +
      `Make sure you have run: npx supabase-lingo init\n` +
      `Error: ${error.message}`
    );
  }

  const columns: TranslatableColumn[] = (data || []).map((row: any) => ({
    table: row.table_name,
    column: row.column_name,
    schema: row.table_schema || 'public',
  }));

  return {
    columns,
    totalTables: new Set(columns.map(c => c.table)).size,
    totalColumns: columns.length,
  };
}

/**
 * Check if the translations table exists
 */
export async function translationsTableExists(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('_lingo_translations')
    .select('id')
    .limit(1);

  return !error;
}

/**
 * Get SQL to mark a column as translatable
 * Useful for displaying instructions to users
 */
export function getMarkColumnSQL(table: string, column: string): string {
  return `COMMENT ON COLUMN ${table}.${column} IS '${MARKER}';`;
}
