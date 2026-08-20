/**
 * ★受け渡し用テキストから `secrets.staging.env` を作る（値を一切表示しない）
 *
 * 【なぜ要るか】
 *   2026-08-10、受け渡しファイルの中身を「マスクして」表示しようとして失敗しました。
 *   正規表現が `キー=値` / `キー: 値` を前提にしていたのに、
 *   **実際は値が独立した行**にあったため、**そのまま表示されました**。
 *   ★**ファイルの形式を確かめずにマスクを当てた**のが原因です。
 *
 *   → 表示という手段そのものをやめます。**読むのは機械だけ**にし、
 *     人が見るのは「キーが揃ったか」「接続できたか」だけにします。
 *
 * 【出力するもの】
 *   キー名と、値の**長さ**だけ。★長さは「空でない」「途中で切れていない」の確認に要ります。
 *
 * 実行: npx tsx tools/import-staging-secrets.mjs "<受け渡しファイル>"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('使い方: npx tsx tools/import-staging-secrets.mjs "<受け渡しファイル>"');
  process.exit(1);
}

// ★全角空白・タブ・コロンを区切りとして扱う。値が次の行にある形にも対応する
const lines = readFileSync(src, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

/** ラベル行から値を取る。同じ行に無ければ次の行を値とみなす */
function pick(patterns) {
  for (let i = 0; i < lines.length; i += 1) {
    for (const p of patterns) {
      if (!p.test(lines[i])) continue;
      const inline = lines[i].replace(p, '').replace(/^[\s　:：=]+/, '').trim();
      if (inline.length > 0) return inline;
      const next = lines[i + 1];
      if (next !== undefined) return next.trim();
    }
  }
  return null;
}

const password = pick([/データベース\s*パスワード/, /^db[_ ]?password/i]);
const url = pick([/プロジェクト\s*URL/, /^supabase[_ ]?url/i]);
const anon = pick([/^anon/i, /anon\s*キー/]);
const service = pick([/サービスロール\s*キー/, /^service[_ ]?role/i]);
/** ★明示された接続文字列があればそれを最優先で使う（推測より確実） */
const explicitDb = pick([/^database[_ ]?url/i, /^postgres(ql)?:\/\//i]);

const ref = url ? (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1] ?? null : null;

/**
 * ★接続文字列は**本番の形からホストだけ借りて**組み立てます。
 *   地域（aws-0-ap-northeast-1 など）はプロジェクトごとに違いうるので、
 *   組み立てたもので繋がらなければ**推測を続けず、ダッシュボードの値を要求**します。
 */
let databaseUrl = explicitDb;
// ★ダッシュボードの表示が枠ごとに分かれていると、貼られた文字列から
//   スキーム（postgresql://）が欠けることがあります。実際に欠けていました。
//   ★値を推測で作るのではなく、**欠けている接頭辞だけを補います**。
if (databaseUrl !== null && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  databaseUrl = `postgresql://${databaseUrl}`;
}
let built = false;
if (databaseUrl === null && ref !== null && password !== null) {
  const prod = readFileSync('secrets.production.env', 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (prod) {
    const host = prod[1].match(/@([^/]+)\//);
    if (host) {
      databaseUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host[1]}/postgres`;
      built = true;
    }
  }
}

const out = {
  STAR_ENV: 'staging',
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  SUPABASE_PROJECT_REF: ref,
  DATABASE_URL: databaseUrl,
  STAR_EPOCH_ISO: (readFileSync('secrets.production.env', 'utf8').match(/^STAR_EPOCH_ISO=(.*)$/m) ?? [])[1] ?? null,
};

console.log('# 読み取り結果（★値は表示しません。長さだけ）');
let missing = 0;
for (const [k, v] of Object.entries(out)) {
  if (v === null || v === undefined || v === '') {
    console.log(`  ${k.padEnd(28)} ★見つかりません`);
    missing += 1;
  } else {
    console.log(`  ${k.padEnd(28)} OK（${String(v).length} 文字）`);
  }
}
if (built) console.log('  ※ DATABASE_URL は本番の接続先の形からホストを借りて組み立てました');

if (missing > 0) {
  console.error(`\n★${missing} 個足りません。書き足していただく必要があります`);
  process.exit(1);
}

writeFileSync(
  'secrets.staging.env',
  Object.entries(out)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
  'utf8',
);
console.log('\n★secrets.staging.env を作成しました（.gitignore 済み）');
