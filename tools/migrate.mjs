/**
 * マイグレーション適用（正典 §14）。
 * ★接続文字列は環境ファイルから読み、**出力に出さない**。
 * ★1ファイル = 1トランザクション（SQL 側の begin/commit）。途中で落ちれば全部戻ります。
 */
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

/**
 * ★接続先を選べるようにする（2026-08-11）。
 *   `--env staging` で `secrets.staging.env` を使います。**既定は本番のまま**です。
 *   ⚠️ 既定を staging にしません。**「いつもの手順」で本番に当たらなくなる**ほうが危険です
 *      （マイグレーションは本番に当てるのが目的の運用ツール・R-24 の PRODUCTION_OPS）。
 */
const envIdx = process.argv.indexOf('--env');
const envName = envIdx >= 0 ? process.argv[envIdx + 1] : 'local';
const envFile = envName === 'staging' ? 'secrets.staging.env' : 'secrets.local.env';
console.log(`接続先: ${envFile}`);

const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
if (!env.DATABASE_URL) throw new Error('DATABASE_URL が未設定です');

const files = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
const only = process.argv[2] === '--env' ? process.argv[4] : process.argv[2];
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
