/**
 * マイグレーション適用（正典 §14）。
 * ★接続文字列は環境ファイルから読み、**出力に出さない**。
 * ★1ファイル = 1トランザクション（SQL 側の begin/commit）。途中で落ちれば全部戻ります。
 *
 * 【★適用済みの追跡を入れた理由（2026-08-11）】
 *   追跡表が無く、**毎回すべてのファイルを流していました。**
 *   0001〜0009 は空の staging に一度通っただけで、`0010` を足して流し直したら
 *   `0002` が「policy が既に存在する」で落ちました。
 *
 *   ★問題は落ちたことではなく、**「適用済みかどうかを DB から知る術が無い」**ことです。
 *     ファイルの中身は `if not exists` で概ね冪等ですが、
 *     `create policy` のように冪等に書けないものが混ざっており、
 *     **どこまで当たっているかは人の記憶にしか無い**状態でした。
 *
 *   → `schema_migrations` に記録します。併せて**チェックサム**を持ちます。
 *     適用済みのファイルが**後から書き換えられた**場合、それは
 *     「DB とリポジトリが食い違っている」ので、黙って通さず落とします。
 *
 * 実行:
 *   npx tsx tools/migrate.mjs                    # 本番（既定）・未適用のみ
 *   npx tsx tools/migrate.mjs --env staging      # staging・未適用のみ
 *   npx tsx tools/migrate.mjs --env staging 0010 # 指定ファイルだけ
 *   npx tsx tools/migrate.mjs --env staging --baseline 0009
 *       ★既に手で当たっている DB に「0009 までは適用済み」と**記録だけ**する（実行しない）
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

/**
 * ★接続先を選べるようにする（2026-08-11）。
 *   `--env staging` で `secrets.staging.env` を使います。**既定は本番のまま**です。
 *   ⚠️ 既定を staging にしません。**「いつもの手順」で本番に当たらなくなる**ほうが危険です
 *      （マイグレーションは本番に当てるのが目的の運用ツール・R-24 の PRODUCTION_OPS）。
 */
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const envName = flag('env') ?? 'local';
if (envName !== 'local' && envName !== 'staging') {
  throw new Error(`--env は local か staging です（受け取った値: ${envName}）`);
}
const envFile = envName === 'staging' ? 'secrets.staging.env' : 'secrets.local.env';
const baseline = flag('baseline');
/** フラグでない最初の引数 = 特定ファイルの前方一致指定 */
const only = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))[0] ?? null;

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
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log('接続しました');

// ★追跡表そのものは、どのマイグレーションよりも先に要る（ここで作る）
await client.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query('select filename, checksum from schema_migrations');
const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

// ★適用済みのファイルが書き換えられていないか。ここは黙って通さない
let drift = 0;
for (const f of files) {
  const want = applied.get(f);
  if (want === undefined) continue;
  const got = sha(readFileSync(`db/migrations/${f}`, 'utf8'));
  if (got !== want) {
    console.error(`  ★${f}: 適用済みだが内容が変わっています（DB とリポジトリが食い違っている）`);
    drift += 1;
  }
}
if (drift > 0) {
  console.error(`\n★${drift} 件が食い違っています。適用済みのファイルを書き換えず、新しい番号で足してください`);
  await client.end();
  process.exit(1);
}

// ── --baseline: 実行せず「適用済み」とだけ記録する ────────────────
if (baseline !== null) {
  // ★番号の前方一致で比較する（'0001' <= '0009' は真 / '0010' <= '0009' は偽）
  const upTo = files.filter((f) => f.slice(0, baseline.length) <= baseline);
  console.log(`★--baseline ${baseline}: 以下を**実行せず**適用済みとして記録します`);
  for (const f of upTo) {
    if (applied.has(f)) { console.log(`  ${f} ... 記録済み`); continue; }
    await client.query(
      'insert into schema_migrations (filename, checksum) values ($1, $2) on conflict (filename) do nothing',
      [f, sha(readFileSync(`db/migrations/${f}`, 'utf8'))],
    );
    console.log(`  ${f} ... 記録しました（未実行）`);
  }
  await client.end();
  console.log('完了');
  process.exit(0);
}

const candidates = only ? files.filter((f) => f.startsWith(only)) : files;
if (candidates.length === 0) throw new Error(`適用対象がありません（指定: ${only ?? 'すべて'}）`);
const target = candidates.filter((f) => !applied.has(f));

if (target.length === 0) {
  console.log(`★未適用のものはありません（${candidates.length} 件はすべて適用済み）`);
  await client.end();
  process.exit(0);
}
console.log(`未適用 ${target.length} 件 / 全 ${files.length} 件`);

for (const f of target) {
  const sql = readFileSync(`db/migrations/${f}`, 'utf8');
  process.stdout.write(`  ${f} ... `);
  try {
    await client.query(sql);
    // ★記録は適用の**後**。先に書くと、失敗したものが適用済みになります
    await client.query(
      'insert into schema_migrations (filename, checksum) values ($1, $2)',
      [f, sha(sql)],
    );
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
