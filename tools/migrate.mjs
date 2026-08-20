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

// ============================================================================
// ★接続先の環境を DB に確認する（§14.6 / A-7 の照合を、適用の前に行う）
//
//   【なぜ要るか（2026-08-20・Q-AUTH-07 の裁定）】
//     `--env` は「どの秘密ファイルを読むか」を選ぶだけで、
//     **その接続文字列が本当にその環境を指しているかは確かめていませんでした。**
//     接続文字列の取り違えは必ず起きる前提（`0001_init.sql` の app_environment の注記）なのに、
//     マイグレーションという**最も状態を変える操作**が、その前提の外にありました。
//
//   ★「向き先を確認する」を人間の注意力に任せない。ワーカー（env.ts の
//     assertEnvironmentMatches）が起動時にやっているのと同じ照合を、ここでも行う。
// ============================================================================
{
  const declared = env.STAR_ENV;
  if (!declared) throw new Error(`${envFile} に STAR_ENV がありません。接続先を確認できないため中止します（§14.6）`);
  const r = await client.query('select environment from app_environment');
  if (r.rows.length === 0) {
    throw new Error('DB に app_environment がありません。接続先の環境が確認できないため中止します（§14.6）');
  }
  if (r.rows.length > 1) {
    throw new Error(`app_environment が ${r.rows.length} 行あります。どちらが本当か決まらないため中止します`);
  }
  const onDb = r.rows[0].environment;
  if (onDb !== declared) {
    throw new Error(
      `環境が一致しません: ${envFile} は "${declared}" のつもりですが、` +
        `接続先の DB は "${onDb}" です。**適用しません**（§14.6・A-7）。`,
    );
  }
  console.log(`環境を確認: ${onDb}（${envFile} の申告と一致）`);
}

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
const driftFiles = [];
for (const f of files) {
  const want = applied.get(f);
  if (want === undefined) continue;
  const got = sha(readFileSync(`db/migrations/${f}`, 'utf8'));
  if (got !== want) {
    console.error(`  ★${f}: 適用済みだが内容が変わっています（DB とリポジトリが食い違っている）`);
    console.error(`      DB の記録: ${want.length === 64 ? `${want.slice(0, 16)}…` : `★"${want}"（sha256 ではありません＝手で入れた記録）`}`);
    console.error(`      ファイル : ${got.slice(0, 16)}…`);
    drift += 1;
    driftFiles.push(f);
  }
}
if (drift > 0) {
  /**
   * ★`--repair-checksum <file>` は**記録だけ**を直します。
   *
   * ⚠️ **使ってよいのは「スキーマが実際にそのマイグレーションどおりだと確かめた」ときだけ**です。
   *    記録を合わせれば警告は消えますが、**消えるのは警告であって食い違いではありません。**
   *    実例: staging の 0015 は `checksum='restored'` という手書きの記録が入っていました
   *    （テーブル定義は 0015 と完全一致していたので、記録だけの問題でした）。
   *
   * ★ファイルを書き換えてしまった場合は**これを使わず、新しい番号で足してください。**
   */
  const repairIdx = process.argv.indexOf('--repair-checksum');
  const repairTarget = repairIdx >= 0 ? process.argv[repairIdx + 1] : null;
  if (repairTarget !== null && driftFiles.includes(repairTarget)) {
    const got = sha(readFileSync(`db/migrations/${repairTarget}`, 'utf8'));
    console.error('');
    console.error(`★記録だけを直します: ${repairTarget}`);
    console.error(`    ${applied.get(repairTarget)} → ${got}`);
    console.error('  ⚠️ スキーマが実際にこのマイグレーションどおりであることは、呼び出した人の責任です');
    await client.query('update schema_migrations set checksum = $2 where filename = $1', [repairTarget, got]);
    console.error('  直しました。もう一度実行してください');
    await client.end();
    process.exit(1);
  }
  console.error(`\n★${drift} 件が食い違っています。適用済みのファイルを書き換えず、新しい番号で足してください`);
  console.error('  （★記録だけが壊れていると確認できた場合に限り: --repair-checksum <ファイル名>）');
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
