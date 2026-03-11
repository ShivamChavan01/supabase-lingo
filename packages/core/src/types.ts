// ============================================
// supabase-lingo — Shared Types
// ============================================

export interface LingoConfig {
  supabaseUrl: string;
  supabaseKey: string; // Must be service_role key
  lingoApiKey: string;
  sourceLocale: string;
  locales: string[];
  batchSize?: number; // rows to translate at once, default 10
}

export interface TranslatableColumn {
  table: string;
  column: string;
  schema: string;
}

export interface TranslationRecord {
  id?: string;
  table_name: string;
  row_id: string;
  column_name: string;
  locale: string;
  value: string;
  created_at?: string;
  updated_at?: string;
}

export interface TranslationResult {
  [locale: string]: string;
}

export interface TriggerPayload {
  table: string;
  row_id: string;
  column: string;
  value: string;
  source_locale: string;
  target_locales: string[];
}

export interface ScanResult {
  columns: TranslatableColumn[];
  totalTables: number;
  totalColumns: number;
}

export interface StatusResult {
  table: string;
  column: string;
  totalRows: number;
  translatedRows: { [locale: string]: number };
  coverage: { [locale: string]: number }; // percentage
}

export interface InitOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  lingoApiKey?: string;
  locales?: string[];
}

export interface TranslateOptions {
  table?: string;
  column?: string;
  force?: boolean; // re-translate already translated rows
}

export type SupportedLocale =
  | 'ja' | 'ar' | 'hi' | 'de' | 'fr' | 'es'
  | 'zh' | 'ko' | 'pt' | 'ru' | 'it' | 'nl'
  | 'tr' | 'pl' | 'sv' | 'da' | 'fi' | 'no';

export const DEFAULT_LOCALES: SupportedLocale[] = [
  'ja', 'ar', 'hi', 'de', 'fr', 'es', 'zh', 'ko', 'pt', 'ru'
];

export const TRANSLATIONS_TABLE = '_lingo_translations';
export const MARKER = '@translatable';
