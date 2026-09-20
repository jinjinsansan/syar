/**
 * ★**憲法の遵守（正典 §17.2 の C-1〜C-5）を、★コードで確かめる**（★2026-09-20）
 *
 * 【★なぜ要るか】
 *   ★§17.1 が弁護士へ渡すものを列挙し、★§17.2 が ★**「コードレベルで確認」**と定めています。
 *   ★これは ★**承認が要りません**（★読むだけ・★DB にも繋ぎません）。
 *
 * 【🔴 ★この道具が「合格」と言えないもの】
 *   ★**C-4 / C-5 は、★探す語そのものがリポジトリに在りません**（★在ったら憲法違反）。
 *   → ★この道具が見るのは ★**「仕組みが繋がっているか」**だけです。
 *     ★★**「実在名がゼロであること」を、★この道具は証明しません。**
 *   ⚠️ ★**それを混同しないこと**（★今日 何度も踏んだ形・**R-21**）。
 *
 * 【★どう探したか（★次の人が同じ網で安心しないように）】
 *   ★C-1/C-2 … ★`db/migrations/*.sql` の `check (reason in (…))` を ★**最後の定義**まで畳む
 *   ★C-3     … ★`users` の点を別の `users` へ動かす RPC を語で探す
 *   ★C-4     … ★NG リストの**配線**（★ハッシュ表の有無・★`ALLOW_ALL_NAMES` の注入先）
 *   ★C-5     … ★廃棄済み文書がコードから参照されていないこと（★語の走査は原理的にできない）
 *
 * 実行: npx tsx tools/verify-constitution.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const fails = [];
const warns = [];
const ok = (label, detail) => console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
const ng = (label, detail) => { console.log(`  🔴 ${label}${detail ? `  ${detail}` : ''}`); fails.push(label); };
const warn = (label, detail) => { console.log(`  ⚠️ ${label}${detail ? `  ${detail}` : ''}`); warns.push(label); };

console.log('# ★憲法の遵守（正典 §17.2）— ★読むだけ・★DB に繋ぎません');
console.log('');

// ── 走査対象（★`rg -uu` と同じく、★追跡外も見る） ──────────────
/**
 * 🔴 ★**`git ls-files` では足りません**（★**M-6** の教訓・★§17.2 C-4 が `rg -uu` と指定）。
 *   ★`.gitignore` 済みのファイルが漏れます。→ ★`node_modules` と `.git` だけ外して全部 歩きます。
 */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist', 'out', 'tmp'].includes(e.name)) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const allFiles = walk('.');
const codeFiles = allFiles.filter((f) => /\.(ts|tsx|mjs|js|sql|json)$/.test(f));
console.log(`  ★走査: 全 ${allFiles.length} ファイル（うちコード ${codeFiles.length}）`);
console.log('  ⚠️ ★`node_modules` / `.git` / `.next` / `dist` / `out` / `tmp` は外しています');
console.log('');

// ── C-1 / C-2: 台帳の理由の語彙 ───────────────────────────
/** ★`check (reason in ( … ))` を全部 拾い、★**最後に定義されたもの**を正とする */
function latestReasonVocab(table) {
  const migs = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
  let last = null;
  for (const f of migs) {
    const sql = readFileSync(`db/migrations/${f}`, 'utf8');
    for (const m of sql.matchAll(
      new RegExp(`${table}_reason_allowed[\\s\\S]{0,200}?reason in \\(([^)]*)\\)`, 'gi'),
    )) {
      last = {
        from: f,
        values: (m[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
      };
    }
  }
  return last;
}

/** ★「金を入れる」ことを表す語（★C-1） */
const MONEY_IN = /purchase_points|buy_points|topup|top_up|charge|deposit|payment|checkout|iap|課金|入金|購入ポイント/i;
/** ★「金にする」ことを表す語（★C-2） */
const MONEY_OUT = /cash|withdraw|payout_cash|remit|crypto|wallet|bank|換金|出金|送金/i;
/** ★決済 SDK（★依存に在ってはならない） */
const PAYMENT_SDK = /stripe|paypal|square|braintree|adyen|payjp|komoju|react-native-iap|@paypal|razorpay/i;

console.log('【C-1】★参加ポイント（EP）を金で買う経路が無い');
const ep = latestReasonVocab('ep_ledger');
if (ep === null) ng('C-1 ★`ep_ledger` の理由の語彙が見つかりません（★判定不能）');
else {
  console.log(`      ★語彙（${ep.from}）: ${ep.values.join(' / ')}`);
  const bad = ep.values.filter((v) => MONEY_IN.test(v));
  if (bad.length > 0) ng('C-1 ★金で買う理由が語彙に在る', bad.join(', '));
  else ok('C-1 ① ★語彙に「金で買う」を表す値が無い', `${ep.values.length} 種`);
  // ★語彙が閉じていること自体も見る（★`check` が無ければ何でも書けます）
  ok('C-1 ② ★理由は `check` で閉じている（★任意の文字列を書けない）', ep.from);
}
const pkgs = codeFiles.filter((f) => f.endsWith('package.json') && !f.includes('node_modules'));
const sdkHits = [];
for (const f of pkgs) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const sec of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(j[sec] ?? {})) if (PAYMENT_SDK.test(name)) sdkHits.push(`${f}: ${name}`);
  }
}
if (sdkHits.length > 0) ng('C-1 ③ ★決済 SDK の依存が在る', sdkHits.join(', '));
else ok('C-1 ③ ★決済 SDK の依存が無い', `package.json ${pkgs.length} 件`);

console.log('');
console.log('【C-2】★賞金ポイント（PP）→ 現金・暗号資産の経路が無い');
const pp = latestReasonVocab('pp_ledger');
if (pp === null) ng('C-2 ★`pp_ledger` の理由の語彙が見つかりません（★判定不能）');
else {
  console.log(`      ★語彙（${pp.from}）: ${pp.values.join(' / ')}`);
  const bad = pp.values.filter((v) => MONEY_OUT.test(v));
  if (bad.length > 0) ng('C-2 ★換金を表す理由が語彙に在る', bad.join(', '));
  else ok('C-2 ★語彙に「現金・暗号資産」を表す値が無い', `${pp.values.length} 種`);
}

console.log('');
console.log('【C-3】★ポイントのユーザー間 譲渡が無い');
/** ★「ある利用者の残高を減らし、★別の利用者の残高を増やす」形を探す */
const transferish = [];
for (const f of codeFiles.filter((x) => x.endsWith('.sql'))) {
  const sql = readFileSync(f, 'utf8');
  if (/transfer|gift|send_points|譲渡|贈|送付/i.test(sql)) transferish.push(f);
}
if (transferish.length > 0) warn('C-3 ★譲渡らしい語が在ります（★人が見ること）', transferish.join(', '));
else ok('C-3 ★譲渡を表す語が SQL に無い');
console.log('      ⚠️ ★種付料はサービス対価であって譲渡ではありません（★§10.5・★除外は正しい）');

console.log('');
console.log('【C-4】★実在競走馬名の NG リストが**配線されている**');
console.log('      🔴 ★この項目は ★**「実在名がゼロ」を証明しません**。★配線だけを見ます');
const HASH = 'data/ng-names.hash';
if (!existsSync(HASH)) {
  ng('C-4 ① 🔴 ★NG リストのハッシュ表が**在りません**', HASH);
} else {
  const n = readFileSync(HASH, 'utf8').split('\n').filter((l) => l.trim()).length;
  if (n === 0) ng('C-4 ① ★ハッシュ表が空です', HASH);
  else ok('C-4 ① ★ハッシュ表が在る', `${n} 件`);
}
/** 🔴 ★世界を作る経路が「全部 許す」を注いでいないか */
const allowAll = [];
for (const f of codeFiles) {
  const src = readFileSync(f, 'utf8');
  const live = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
  if (/blocklist:\s*ALLOW_ALL_NAMES/.test(live)) allowAll.push(f);
  if (/loadNameBlocklist\([^)]*,\s*false\s*\)/.test(live)) allowAll.push(`${f}（strict=false）`);
}
if (allowAll.length > 0) ng('C-4 ② 🔴 ★NG 判定を**素通し**にしている経路が在る', allowAll.join(' / '));
else ok('C-4 ② ★素通しにしている経路が無い');

console.log('');
console.log('【C-5】★他社製品の固有名称');
console.log('      🔴 ★**語の走査は原理的にできません** — ★探す語をここに書くこと自体が違反です');
console.log('      → ★確かめられるのは「★廃棄済み文書がコードから参照されていないこと」だけです');
const DEPRECATED = ['SPEC.md', 'AI_PROMPT.md'];
const refs = [];
for (const f of codeFiles) {
  if (f.endsWith('.json')) continue;
  // ★この道具自身は外す（★廃棄済み文書の名前を持っているのは、★探すためです）
  if (f.endsWith('verify-constitution.mjs')) continue;
  const src = readFileSync(f, 'utf8');
  for (const d of DEPRECATED) {
    if (new RegExp(`['"\`][^'"\`]*${d.replace('.', '\\.')}`).test(src)) refs.push(`${f} → ${d}`);
  }
}
if (refs.length > 0) ng('C-5 ★廃棄済み文書をコードが参照しています', refs.join(' / '));
else ok('C-5 ★廃棄済み文書（SPEC.md / AI_PROMPT.md）をコードが参照していない');
warn('C-5 ★**これは C-5 の確認ではありません**（★人の目視が要ります・★機械では閉じられません）');

// ── まとめ ───────────────────────────────────────────
console.log('');
console.log('=== ★判定 ===');
console.log(`  🔴 不合格 ${fails.length} 件 / ⚠️ 人が見るもの ${warns.length} 件`);
for (const f of fails) console.log(`     🔴 ${f}`);
console.log('');
console.log('🔴 ★**この道具が緑でも「憲法を守っている」ではありません。**');
console.log('   ★C-4 は配線だけ、★C-5 は機械では閉じられません（★上に書いたとおり）。');
process.exit(fails.length === 0 ? 0 : 1);
