/**
 * ★合格基準の SHA が HEAD かを機械で確かめる（正典 R-23）
 *
 * 【なぜ要るか】
 *   > 合格は「そのコード状態に対する主張」であり、**コードが変われば黙って失効する**。
 *   > フェーズを閉じるときは**全項目が HEAD であること**。
 *
 *   ★実例（R-23 の由来）: **A-2 の PASS は D-037/D-038 を入れる前の証拠のまま繰り越され**、
 *     しかも検証ツールが実行不能だったため誰も気づかず、報告表には毎回「PASS」と書かれていました。
 *
 * 【★「書いた」では足りない】
 *   判定書に SHA を書くのは**手順**です。書き忘れ・書き換え忘れは黙って通ります。
 *   → ここで**古い SHA を数え上げ**、フェーズを閉じる前に必ず目に入るようにします。
 *
 * 【★このツールが言えないこと】
 *   SHA が HEAD でも「その SHA で**実際に再実行した**」ことは保証しません。
 *   ここが守るのは「**古い証拠が黙って残っていない**」ことだけです。
 *
 * 実行: node tools/verify-acceptance-sha.mjs [docs/ACCEPTANCE_P3.md ...]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGETS = files.length > 0 ? files : ['docs/ACCEPTANCE_P3.md'];

/**
 * ★`shell: true` を使いません。
 *   Windows の cmd では **`^` がエスケープ文字**なので、`<sha>^{commit}` の `^` が消え、
 *   すべての SHA が「この repo に無い」と出ました（実際に出た）。
 *   ★**26件「不明」という結果は、判定ではなく引用の誤りでした。**
 */
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const HEAD = sh('git', ['rev-parse', 'HEAD']);
const HEAD_SHORT = HEAD.slice(0, 7);

/** その SHA が HEAD の祖先か（＝古い証拠か）。不明な SHA は「不明」として区別する */
const ageOf = (sha) => {
  try {
    // ★`^{commit}` を使わない（上記のエスケープ問題を避ける）。型は cat-file で確かめる
    if (sh('git', ['cat-file', '-t', sha]) !== 'commit') return 'unknown';
    const full = sh('git', ['rev-parse', sha]);
    if (full === HEAD) return 'HEAD';
    // ★HEAD に含まれない SHA（別ブランチ等）は「古い」と断定しない
    try {
      sh('git', ['merge-base', '--is-ancestor', full, HEAD]);
      return 'old';
    } catch {
      return 'unrelated';
    }
  } catch {
    return 'unknown';
  }
};

console.log('# ★合格基準の SHA が HEAD か（R-23）');
console.log('');
console.log(`  HEAD = ${HEAD_SHORT}`);
console.log('');

let old = 0;
let unknown = 0;
let head = 0;
for (const file of TARGETS) {
  const text = readFileSync(file, 'utf8');
  // ★表の中のバッククォート付き 7〜40桁 16進を SHA 候補とみなす
  const found = new Map();
  for (const m of text.matchAll(/`([0-9a-f]{7,40})`/g)) {
    const sha = m[1];
    if (!found.has(sha)) found.set(sha, 0);
    found.set(sha, found.get(sha) + 1);
  }
  console.log(`## ${file}`);
  if (found.size === 0) {
    // ★0件は「全部 HEAD」ではなく「**抽出できていない**」かもしれない（R-21）
    console.log('  ★SHA が1件も見つかりません。抽出器が壊れている可能性があります');
    unknown += 1;
    continue;
  }
  for (const [sha, count] of [...found.entries()].sort()) {
    const age = ageOf(sha);
    if (age === 'HEAD') { head += count; continue; }
    if (age === 'old') { old += count; console.log(`  ★古い: ${sha}（${count}箇所）`); }
    else if (age === 'unrelated') { old += count; console.log(`  ★HEAD に含まれない: ${sha}（${count}箇所）`); }
    else { unknown += count; console.log(`  ★不明（この repo に無い）: ${sha}（${count}箇所）`); }
  }
  console.log('');
}

console.log('【判定】');
console.log(`  HEAD の SHA: ${head}箇所 / 古い: ${old}箇所 / 不明: ${unknown}箇所`);
console.log('');
if (old === 0 && unknown === 0) {
  console.log('★R-23: PASS — すべて HEAD です');
  process.exit(0);
}
console.log('★R-23: 古い SHA が残っています。');
console.log('  ★フェーズを閉じるなら、**その SHA で再実行するか、');
console.log('    「なぜ古い SHA でも有効か」を明文で書く**かのどちらかが要ります。');
console.log('  ⚠️ ここを黙らせるために SHA だけ書き換えないこと。**証拠は再実行でしか作れません。**');
process.exit(1);
