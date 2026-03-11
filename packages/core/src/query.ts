// ============================================
// supabase-lingo — Query Helper SDK
// Drop-in helper for querying translated content
// ============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { TRANSLATIONS_TABLE } from './types';

/**
 * Creates a Lingo-aware Supabase query builder.
 * 
 * Usage:
 *   const lingo = createLingoClient(supabase);
 *   const products = await lingo.from('products').select('*').locale('ja');
 */
export function createLingoClient(supabase: SupabaseClient) {
  return {
    from: (table: string) => new LingoQueryBuilder(supabase, table),
  };
}

class LingoQueryBuilder {
  private supabase: SupabaseClient;
  private table: string;
  private selectColumns: string = '*';
  private filters: Array<{ column: string; value: unknown }> = [];
  private targetLocale: string = 'en';
  private limitValue?: number;
  private orderColumn?: string;
  private orderAsc: boolean = true;

  constructor(supabase: SupabaseClient, table: string) {
    this.supabase = supabase;
    this.table = table;
  }

  select(columns: string): this {
    this.selectColumns = columns;
    return this;
  }

  locale(locale: string): this {
    this.targetLocale = locale;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  order(column: string, ascending: boolean = true): this {
    this.orderColumn = column;
    this.orderAsc = ascending;
    return this;
  }

  async execute(): Promise<{ data: Record<string, unknown>[] | null; error: Error | null }> {
    try {
      // 1. Fetch original rows
      let query = this.supabase
        .from(this.table)
        .select(this.selectColumns);

      for (const filter of this.filters) {
        query = query.eq(filter.column, filter.value as string);
      }

      if (this.limitValue) query = query.limit(this.limitValue);
      if (this.orderColumn) query = query.order(this.orderColumn, { ascending: this.orderAsc });

      const { data: rows, error: rowsError } = await query;

      if (rowsError || !rows || rows.length === 0) {
        return { data: rows as unknown as Record<string, unknown>[] | null, error: rowsError };
      }

      // 2. If requesting source locale, return as-is
      if (this.targetLocale === 'en') {
        return { data: rows as unknown as Record<string, unknown>[], error: null };
      }

      // 3. Fetch translations for these rows
      const rowIds = rows.map((r) => String((r as unknown as Record<string, unknown>).id));

      const { data: translations } = await this.supabase
        .from(TRANSLATIONS_TABLE)
        .select('row_id, column_name, value')
        .eq('table_name', this.table)
        .eq('locale', this.targetLocale)
        .in('row_id', rowIds);

      if (!translations || translations.length === 0) {
        return { data: rows as unknown as Record<string, unknown>[], error: null };
      }

      // 4. Build translation lookup map
      const translationMap = new Map<string, Record<string, string>>();

      for (const t of translations) {
        if (!translationMap.has(t.row_id)) {
          translationMap.set(t.row_id, {});
        }
        translationMap.get(t.row_id)![t.column_name] = t.value;
      }

      // 5. Merge translations into rows
      const mergedRows = rows.map((row) => {
        const rowObj = row as unknown as Record<string, unknown>;
        const rowTranslations = translationMap.get(String(rowObj.id));
        if (!rowTranslations) return rowObj;
        return { ...rowObj, ...rowTranslations };
      });

      return { data: mergedRows, error: null };

    } catch (err) {
      return { data: null, error: err as Error };
    }
  }

  // Make it awaitable directly
  then(
    resolve: (value: { data: Record<string, unknown>[] | null; error: Error | null }) => void,
    reject: (reason: unknown) => void
  ) {
    return this.execute().then(resolve, reject);
  }
}

/**
 * Get translation coverage stats for a table
 */
export async function getTranslationCoverage(
  supabase: SupabaseClient,
  table: string,
  targetLocales: string[]
): Promise<{ [locale: string]: number }> {

  const { count: totalRows } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (!totalRows || totalRows === 0) return {};

  const coverage: { [locale: string]: number } = {};

  for (const locale of targetLocales) {
    const { count: translatedRows } = await supabase
      .from('_lingo_translations')
      .select('*', { count: 'exact', head: true })
      .eq('table_name', table)
      .eq('locale', locale);

    const pct = Math.round(((translatedRows ?? 0) / totalRows) * 100);
    coverage[locale] = Math.min(100, Math.max(0, pct));
  }

  return coverage;
}
