// ============================================
// supabase-lingo — Public API
// ============================================

export { defineConfig, loadConfig } from './config';
export { detectTranslatableColumns, getMarkColumnSQL } from './detect';
export { createLingoClient, getTranslationCoverage } from './query';
export { translateViaLingo, batchTranslateViaLingo } from './translate';
export * from './types';
