/**
 * マイグレーション適用（正典 §14）。
 * ★接続文字列は環境ファイルから読み、**出力に出さない**。
 * ★1ファイル = 1トランザクション（SQL 側の begin/commit）。途中で落ちれば全部戻ります。
 */
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
if (!env.DATABASE_URL) throw new Error('DATABASE_URL が未設定です');

const files = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
const only = process.argv[2];
const target = only ? files.filter((f) => f.startsWith(only)) : files;
if (target.length === 0) throw new Error(`適用対象がありません（指定: ${only ?? 'すべて'}）`);

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('接続しました');
for (const f of target) {
  const sql = readFileSync(`db/migrations/${f}`, 'utf8');
  process.stdout.write(`  ${f} ... `);
  try {
    await client.query(sql);
    console.log('OK');
  } catch (e) {
    console.log('失敗');
    console.error(`    ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
await client.end();
console.log('完了');
