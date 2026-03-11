#!/usr/bin/env node
// ============================================
// supabase-lingo — CLI Entrypoint
// npx supabase-lingo <command>
// ============================================

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, validateConfig } from './config';
import { detectTranslatableColumns, translationsTableExists } from './detect';
import {
  CREATE_TRANSLATIONS_TABLE_SQL,
  CREATE_HELPER_FUNCTIONS_SQL,
  generateTriggerFunctionSQL,
  generateTeardownSQL,
  groupColumnsByTable,
} from './trigger';
import { batchTranslateViaLingo } from './translate';
import { getTranslationCoverage } from './query';
import * as readline from 'readline';

const program = new Command();

program
  .name('supabase-lingo')
  .description('Auto-translate your Supabase database content using Lingo.dev')
  .version('0.1.0');

// ─── INIT ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Set up supabase-lingo in your project')
  .action(async () => {
    console.log(chalk.bold.blue('\n🌍 supabase-lingo init\n'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

    try {
      let config;
      try {
        config = loadConfig();
        console.log(chalk.green('✓ Config loaded from environment\n'));
      } catch {
        console.log(chalk.yellow('No config found. Let\'s set it up.\n'));

        const supabaseUrl = await ask('Supabase URL: ');
        const supabaseKey = await ask('Supabase Service Role Key: ');
        const lingoApiKey = await ask('Lingo.dev API Key: ');
        const localesInput = await ask('Target locales (comma-separated, e.g. ja,de,fr): ');

        config = {
          supabaseUrl: supabaseUrl.trim(),
          supabaseKey: supabaseKey.trim(),
          lingoApiKey: lingoApiKey.trim(),
          sourceLocale: 'en',
          locales: localesInput.split(',').map(l => l.trim()),
        };
      }

      rl.close();
      validateConfig(config);

      const supabase = createClient(config.supabaseUrl, config.supabaseKey);

      // Step 1: Create translations table
      const spinner1 = ora('Creating _lingo_translations table...').start();
      const { error: tableError } = await supabase.rpc('lingo_exec_sql', {
        sql: CREATE_TRANSLATIONS_TABLE_SQL
      });
      if (tableError && !tableError.message.includes('already exists')) {
        spinner1.fail(`Failed: ${tableError.message}`);
        process.exit(1);
      }
      spinner1.succeed('Created _lingo_translations table');

      // Step 2: Create helper functions
      const spinner2 = ora('Creating helper functions...').start();
      await supabase.rpc('lingo_exec_sql', { sql: CREATE_HELPER_FUNCTIONS_SQL });
      spinner2.succeed('Created helper functions');

      // Step 3: Detect @translatable columns
      const spinner3 = ora('Scanning for @translatable columns...').start();
      const scanResult = await detectTranslatableColumns(supabase);
      spinner3.succeed(
        `Found ${chalk.bold(scanResult.totalColumns)} translatable columns ` +
        `across ${chalk.bold(scanResult.totalTables)} tables`
      );

      if (scanResult.columns.length === 0) {
        console.log(chalk.yellow('\n⚠️  No @translatable columns found.'));
        console.log('Mark columns like this:');
        console.log(chalk.gray("  COMMENT ON COLUMN products.name IS '@translatable';"));
        console.log('\nThen run: npx supabase-lingo init\n');
        process.exit(0);
      }

      // Step 4: Create triggers per table
      const tableGroups = groupColumnsByTable(scanResult.columns);
      const edgeFunctionUrl = `${config.supabaseUrl}/functions/v1`;

      for (const [table, columns] of tableGroups) {
        const spinner = ora(`Creating trigger for ${chalk.bold(table)}...`).start();
        const sql = generateTriggerFunctionSQL(
          table,
          columns,
          edgeFunctionUrl,
          config.sourceLocale,
          config.locales
        );
        await supabase.rpc('lingo_exec_sql', { sql });
        spinner.succeed(`Trigger created for ${chalk.bold(table)} (columns: ${columns.join(', ')})`);
      }

      // Done!
      console.log(chalk.bold.green('\n✅ supabase-lingo is ready!\n'));
      console.log('Your database will now auto-translate content into:');
      console.log(chalk.cyan(`  ${config.locales.join(', ')}\n`));
      console.log('Query translated content:');
      console.log(chalk.gray(`  import { createLingoClient } from 'supabase-lingo';`));
      console.log(chalk.gray(`  const lingo = createLingoClient(supabase);`));
      console.log(chalk.gray(`  const products = await lingo.from('products').select('*').locale('ja');\n`));

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n❌ Init failed: ${message}\n`));
      process.exit(1);
    }
  });

// ─── SCAN ────────────────────────────────────────────────────────────────────
program
  .command('scan')
  .description('List all @translatable columns in your database')
  .action(async () => {
    console.log(chalk.bold.blue('\n🔍 Scanning for @translatable columns...\n'));

    try {
      const config = loadConfig();
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      const { columns, totalTables, totalColumns } = await detectTranslatableColumns(supabase);

      if (totalColumns === 0) {
        console.log(chalk.yellow('No @translatable columns found.'));
        return;
      }

      console.log(chalk.green(`Found ${totalColumns} columns across ${totalTables} tables:\n`));

      const byTable = groupColumnsByTable(columns);
      for (const [table, cols] of byTable) {
        console.log(chalk.bold(`  📋 ${table}`));
        cols.forEach(col => console.log(chalk.gray(`     ↳ ${col}`)));
      }

      console.log();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n❌ ${message}\n`));
      process.exit(1);
    }
  });

// ─── TRANSLATE ───────────────────────────────────────────────────────────────
program
  .command('translate')
  .description('Manually trigger translation for existing rows')
  .option('-t, --table <table>', 'Specific table to translate')
  .option('-f, --force', 'Re-translate already translated rows')
  .action(async (opts) => {
    console.log(chalk.bold.blue('\n🌍 Running manual translation...\n'));

    try {
      const config = loadConfig();
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      const { columns } = await detectTranslatableColumns(supabase);

      const targetColumns = opts.table
        ? columns.filter(c => c.table === opts.table)
        : columns;

      if (targetColumns.length === 0) {
        console.log(chalk.yellow('No @translatable columns found.'));
        return;
      }

      const tableGroups = groupColumnsByTable(targetColumns);

      for (const [table, cols] of tableGroups) {
        console.log(chalk.bold(`\n📋 Translating ${table}...`));

        // Fetch all rows
        const { data: rows, error } = await supabase.from(table).select('id, ' + cols.join(', '));

        if (error || !rows) {
          console.log(chalk.red(`  ❌ Failed to fetch rows: ${error?.message}`));
          continue;
        }

        const spinner = ora(`  Translating ${rows.length} rows × ${cols.length} columns × ${config.locales.length} locales...`).start();

        let translated = 0;

        for (const row of rows) {
          const rowData = row as unknown as Record<string, unknown>;
          const items = cols
            .filter(col => rowData[col])
            .map(col => ({ key: `${col}_${rowData.id}`, value: String(rowData[col]) }));

          if (items.length === 0) continue;

          const results = await batchTranslateViaLingo(
            items,
            config.sourceLocale,
            config.locales,
            config.lingoApiKey
          );

          // Save to _lingo_translations
          const upsertData = [];
          for (const item of items) {
            const col = item.key.split('_')[0];
            for (const locale of config.locales) {
              upsertData.push({
                table_name: table,
                row_id: String(rowData.id),
                column_name: col,
                locale,
                value: results[item.key]?.[locale] || item.value,
                updated_at: new Date().toISOString(),
              });
            }
          }

          await supabase.from('_lingo_translations').upsert(upsertData, {
            onConflict: 'table_name,row_id,column_name,locale',
          });

          translated++;
          spinner.text = `  Translating... ${translated}/${rows.length} rows done`;
        }

        spinner.succeed(`  ✅ Translated ${rows.length} rows in ${table}`);
      }

      console.log(chalk.bold.green('\n✅ Translation complete!\n'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n❌ ${message}\n`));
      process.exit(1);
    }
  });

// ─── STATUS ──────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Check translation coverage across your tables')
  .action(async () => {
    console.log(chalk.bold.blue('\n📊 Translation Status\n'));

    try {
      const config = loadConfig();
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      const { columns } = await detectTranslatableColumns(supabase);
      const tables = [...new Set(columns.map(c => c.table))];

      for (const table of tables) {
        const coverage = await getTranslationCoverage(supabase, table, config.locales);
        console.log(chalk.bold(`📋 ${table}`));

        for (const [locale, pct] of Object.entries(coverage)) {
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          const color = pct === 100 ? chalk.green : pct > 50 ? chalk.yellow : chalk.red;
          console.log(`  ${locale.padEnd(6)} ${color(bar)} ${pct}%`);
        }
        console.log();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n❌ ${message}\n`));
      process.exit(1);
    }
  });

// ─── TEARDOWN ────────────────────────────────────────────────────────────────
program
  .command('teardown')
  .description('Remove all supabase-lingo triggers and tables')
  .action(async () => {
    console.log(chalk.bold.red('\n⚠️  Teardown will remove ALL supabase-lingo artifacts.\n'));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(res =>
      rl.question('Type "yes" to confirm: ', res)
    );
    rl.close();

    if (answer.trim() !== 'yes') {
      console.log(chalk.gray('Cancelled.\n'));
      return;
    }

    try {
      const config = loadConfig();
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      const { columns } = await detectTranslatableColumns(supabase);
      const tables = [...new Set(columns.map(c => c.table))];

      const sql = generateTeardownSQL(tables);
      await supabase.rpc('lingo_exec_sql', { sql });

      console.log(chalk.green('\n✅ Teardown complete. All supabase-lingo artifacts removed.\n'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n❌ ${message}\n`));
      process.exit(1);
    }
  });

program.parse();
